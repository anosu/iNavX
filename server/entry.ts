import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { serve } from '@hono/node-server'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { credentialsSchema, migrationSchema } from '../shared/catalog.js'
import { createApp } from './app.js'
import { loadConfig, type ServerConfig } from './config.js'
import { openDatabase } from './db/index.js'
import * as schema from './db/schema.js'
import { readApplications } from './modules/applications/index.js'
import { createCatalog } from './modules/catalog/index.js'

async function backupBeforeUpgrade(config: ServerConfig) {
	if (!existsSync(config.databasePath)) return
	const db = new Database(config.databasePath)
	try {
		const journal = JSON.parse(
			readFileSync(resolve(config.migrationsDir, 'meta/_journal.json'), 'utf8'),
		) as { entries: { when: number }[] }
		const latest = journal.entries.at(-1)?.when || 0
		const table = db
			.prepare(
				"SELECT name FROM sqlite_master WHERE name = '__drizzle_migrations'",
			)
			.get()
		const applied = table
			? Number(
					(
						db
							.prepare(
								'SELECT max(created_at) AS timestamp FROM __drizzle_migrations',
							)
							.get() as { timestamp: number | null }
					).timestamp || 0,
				)
			: 0
		if (applied > latest)
			throw new Error('数据库版本高于当前应用，请使用匹配镜像或恢复升级前备份')
		if (applied < latest) {
			await mkdir(config.backupDir, { recursive: true })
			await db.backup(
				resolve(
					config.backupDir,
					'inav-' +
						new Date().toISOString().replaceAll(':', '-') +
						'-upgrade.sqlite',
				),
			)
		}
	} finally {
		db.close()
	}
}

async function restoreNative(config: ServerConfig, file?: string) {
	if (!file)
		throw new Error('用法：restore /path/to/backup.sqlite；操作前必须停止服务')
	await mkdir(config.dataDir, { recursive: true })
	await mkdir(config.backupDir, { recursive: true })
	const source = new Database(resolve(file), {
		readonly: true,
		fileMustExist: true,
	})
	const temp = resolve(config.dataDir, `.restore-${randomUUID()}.sqlite`)
	try {
		try {
			if (source.pragma('integrity_check', { simple: true }) !== 'ok')
				throw new Error('备份完整性检查失败')
			const sourceStore = { sqlite: source, db: drizzle(source, { schema }) }
			const data = createCatalog(sourceStore).snapshot(true)
			migrationSchema.parse({
				format: 'inav-catalog',
				formatVersion: 2,
				appVersion: 'restore',
				exportedAt: new Date().toISOString(),
				data,
				applications: readApplications(sourceStore),
			})
			await source.backup(temp)
		} finally {
			source.close()
		}
		// Validate migration compatibility before replacing the existing database.
		await backupBeforeUpgrade({ ...config, databasePath: temp })
		if (existsSync(config.databasePath)) {
			const current = new Database(config.databasePath)
			try {
				await current.backup(
					resolve(
						config.backupDir,
						'inav-' +
							new Date().toISOString().replaceAll(':', '-') +
							'-before-restore.sqlite',
					),
				)
				current.pragma('wal_checkpoint(TRUNCATE)')
			} finally {
				current.close()
			}
		}
		const restored = new Database(temp)
		try {
			restored.prepare('DELETE FROM sessions').run()
			restored.pragma('wal_checkpoint(TRUNCATE)')
		} finally {
			restored.close()
		}
		for (const suffix of ['-wal', '-shm'])
			rmSync(config.databasePath + suffix, { force: true })
		renameSync(temp, config.databasePath)
		console.log('数据库已恢复，历史会话已失效。请启动服务。')
	} finally {
		rmSync(temp, { force: true })
		rmSync(`${temp}-wal`, { force: true })
		rmSync(`${temp}-shm`, { force: true })
	}
}

async function main() {
	const config = loadConfig()
	const command = process.argv[2] || 'serve'
	if (command === 'restore') {
		await restoreNative(config, process.argv[3])
		return
	}
	await backupBeforeUpgrade(config)
	const store = openDatabase(config)
	const { app, auth, backups } = createApp(store, config)
	if (command !== 'serve') {
		try {
			if (command === 'setup-token') console.log(auth.setupToken())
			else if (command === 'backup') console.log(await backups.create())
			else if (command === 'migrate') console.log('数据库迁移完成')
			else if (command === 'reset-password') {
				const password =
					process.env.ADMIN_PASSWORD || readFileSync(0, 'utf8').trim()
				credentialsSchema.shape.password.parse(password)
				await auth.reset(password)
				console.log('密码已重置，历史会话已失效')
			} else throw new Error(`未知命令：${command}`)
		} finally {
			store.sqlite.close()
		}
		return
	}
	if (!auth.account()) {
		auth.setupToken()
		console.log(
			'管理员尚未初始化。运行 setup-token 命令获取一次性凭据，然后访问 /admin。',
		)
	}
	const stopScheduler = backups.startScheduler()
	const server = serve(
		{ fetch: app.fetch, port: config.port, hostname: config.host },
		() => console.log(`iNav 服务启动：${config.origin}`),
	)
	let stopping = false
	const stop = () => {
		if (stopping) return
		stopping = true
		stopScheduler()
		server.close(() => {
			backups.whenIdle().finally(() => {
				store.sqlite.close()
				process.exit(0)
			})
		})
	}
	process.on('SIGTERM', stop)
	process.on('SIGINT', stop)
}

main().catch((error: unknown) => {
	console.error(error)
	process.exitCode = 1
})
