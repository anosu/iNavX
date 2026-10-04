import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
	cpSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { openDatabase } from './db/index.js'
import { createCatalog } from './modules/catalog/index.js'

test('failed SQL migration rolls back and leaves the previous catalog readable', () => {
	const root = mkdtempSync(join(tmpdir(), 'inav-test-'))
	const config = {
		...loadConfig(),
		dataDir: join(root, 'data'),
		backupDir: join(root, 'backups'),
		databasePath: join(root, 'data/inav.sqlite'),
	}
	try {
		const initial = openDatabase(config)
		const before = createCatalog(initial).snapshot(true)
		initial.sqlite.close()
		const migrationsDir = join(root, 'migrations')
		cpSync(config.migrationsDir, migrationsDir, { recursive: true })
		const journalPath = join(migrationsDir, 'meta/_journal.json')
		const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
			entries: {
				idx: number
				version: string
				when: number
				tag: string
				breakpoints: boolean
			}[]
		}
		journal.entries.push({
			idx: journal.entries.length,
			version: '6',
			when: (journal.entries.at(-1)?.when || Date.now()) + 1000,
			tag: '0001_failed',
			breakpoints: true,
		})
		writeFileSync(journalPath, JSON.stringify(journal))
		writeFileSync(
			join(migrationsDir, '0001_failed.sql'),
			'CREATE TABLE migration_probe (id TEXT);\n--> statement-breakpoint\nINVALID SQL;',
		)
		assert.throws(() => openDatabase({ ...config, migrationsDir }))
		const reopened = openDatabase(config)
		try {
			assert.deepEqual(createCatalog(reopened).snapshot(true), before)
			assert.equal(
				reopened.sqlite
					.prepare(
						"SELECT name FROM sqlite_master WHERE name = 'migration_probe'",
					)
					.get(),
				undefined,
			)
		} finally {
			reopened.sqlite.close()
		}
	} finally {
		if (
			dirname(resolve(root)) === resolve(tmpdir()) &&
			basename(root).startsWith('inav-test-')
		)
			rmSync(root, { recursive: true, force: true })
		else console.error('拒绝清理非测试目录')
	}
})

test('phase two migrates an existing phase-one database without reseeding or changing credentials', async () => {
	const root = mkdtempSync(join(tmpdir(), 'inav-test-'))
	const config = {
		...loadConfig(),
		dataDir: join(root, 'data'),
		backupDir: join(root, 'backups'),
		databasePath: join(root, 'data/inav.sqlite'),
	}
	let store: ReturnType<typeof openDatabase> | undefined
	try {
		const migrationsDir = join(root, 'phase-one-migrations')
		cpSync(config.migrationsDir, migrationsDir, { recursive: true })
		const journalPath = join(migrationsDir, 'meta/_journal.json')
		const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
			entries: unknown[]
		}
		journal.entries = journal.entries.slice(0, 1)
		writeFileSync(journalPath, JSON.stringify(journal))
		store = openDatabase({ ...config, migrationsDir })
		const app = createApp(store, config)
		await app.auth.setup(
			'legacy-owner',
			'legacy-password-long-enough',
			app.auth.setupToken(),
		)
		const before = app.catalog.snapshot(true)
		const settings = {
			...before.settings,
			name: '升级前编辑过的名称',
		} as Record<string, unknown>
		delete settings.applicationsEnabled
		store.sqlite
			.prepare('UPDATE configuration SET settings = ? WHERE id = 1')
			.run(JSON.stringify(settings))
		const credentials = app.auth.account()
		const backup = join(root, 'phase-one.sqlite')
		await store.sqlite.backup(backup)
		const restoredConfig = {
			...config,
			dataDir: join(root, 'restored'),
			databasePath: join(root, 'restored/inav.sqlite'),
			backupDir: join(root, 'restore-backups'),
		}
		const result = spawnSync(
			process.execPath,
			['--import', 'tsx', 'server/entry.ts', 'restore', backup],
			{
				cwd: process.cwd(),
				env: {
					...process.env,
					DATA_DIR: restoredConfig.dataDir,
					BACKUP_DIR: restoredConfig.backupDir,
				},
				encoding: 'utf8',
			},
		)
		assert.equal(result.status, 0, result.stderr)
		const restored = openDatabase(restoredConfig)
		try {
			const service = createApp(restored, restoredConfig)
			assert.equal(service.catalog.snapshot().settings.name, settings.name)
			assert.equal(
				service.catalog.snapshot().settings.remoteImagesEnabled,
				false,
			)
			assert.deepEqual(service.catalog.snapshot(true).sites, before.sites)
			assert.deepEqual(service.auth.account(), credentials)
			assert.equal(service.applications.all().length, 0)
			assert.equal(
				(
					restored.sqlite
						.prepare('SELECT count(*) AS n FROM sessions')
						.get() as { n: number }
				).n,
				0,
			)
		} finally {
			restored.sqlite.close()
		}
		store.sqlite.close()
		store = openDatabase(config)
		const next = createApp(store, config)
		assert.equal(next.catalog.snapshot().settings.name, settings.name)
		assert.equal(next.catalog.snapshot().settings.applicationsEnabled, true)
		assert.deepEqual(next.catalog.snapshot(true).sites, before.sites)
		assert.deepEqual(next.auth.account(), credentials)
		next.applications.submit({
			name: '升级后申请',
			url: 'https://upgraded.test',
			description: '',
			suggestedCategory: '',
		})
		assert.equal(next.applications.all().length, 1)
	} finally {
		if (store?.sqlite.open) store.sqlite.close()
		if (
			dirname(resolve(root)) === resolve(tmpdir()) &&
			basename(root).startsWith('inav-test-')
		)
			rmSync(root, { recursive: true, force: true })
		else console.error('拒绝清理非测试目录')
	}
})
