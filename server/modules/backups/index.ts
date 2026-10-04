import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { readdir, readFile, stat, unlink } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import type { MigrationPackage } from '../../../shared/catalog.js'
import type { ServerConfig } from '../../config.js'
import type { Store } from '../../db/index.js'
import { applications as applicationsTable } from '../../db/schema.js'
import { AppError } from '../../errors.js'
import {
	type ApplicationsModule,
	readApplications,
} from '../applications/index.js'
import type { CatalogModule } from '../catalog/index.js'

export function createBackups(
	store: Store,
	config: ServerConfig,
	catalog: CatalogModule,
	applications: ApplicationsModule,
) {
	let running: Promise<string> | undefined
	function exportPackage(): MigrationPackage {
		const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
			version: string
		}
		return {
			format: 'inav-catalog',
			formatVersion: 2,
			appVersion: pkg.version,
			exportedAt: new Date().toISOString(),
			data: catalog.snapshot(true),
			applications: readApplications(store),
		}
	}
	async function list() {
		const names = (await readdir(config.backupDir))
			.filter((name) => /^inav-[\w.-]+\.sqlite$/.test(name))
			.sort()
			.reverse()
		return Promise.all(
			names.map(async (name) => ({
				name,
				size: (await stat(resolve(config.backupDir, name))).size,
			})),
		)
	}
	function create() {
		if (running) return running
		running = (async () => {
			const name =
				'inav-' +
				new Date().toISOString().replaceAll(':', '-') +
				'-' +
				randomUUID().slice(0, 8) +
				'.sqlite'
			await store.sqlite.backup(resolve(config.backupDir, name))
			const backups = await list()
			for (const old of backups.slice(catalog.settings().backupKeep))
				await unlink(resolve(config.backupDir, old.name))
			return name
		})().finally(() => {
			running = undefined
		})
		return running
	}
	async function importPackage(
		value: MigrationPackage,
		mode: 'merge' | 'replace',
	) {
		await running
		const backup = await create()
		return store.db.transaction(() => {
			if (mode === 'replace') {
				store.db.delete(applicationsTable).run()
				catalog.replace(value.data)
				applications.replace(value.applications)
				return { restored: true, backup }
			}
			const { siteMapping, ...report } = catalog.merge(value.data)
			return {
				...report,
				...applications.merge(value.applications, siteMapping),
				backup,
			}
		})
	}
	async function download(name: string) {
		if (basename(name) !== name || !/^inav-[\w.-]+\.sqlite$/.test(name))
			throw new AppError(400, '备份文件名无效')
		try {
			return await readFile(resolve(config.backupDir, name))
		} catch {
			throw new AppError(404, '备份不存在')
		}
	}
	async function scheduled() {
		const backups = await list()
		const newest = backups[0]
		const latestTime = newest
			? (await stat(resolve(config.backupDir, newest.name))).mtimeMs
			: 0
		if (
			Date.now() - latestTime >=
			catalog.settings().backupIntervalHours * 3600000
		)
			await create()
	}
	function startScheduler() {
		const tick = () => {
			scheduled().catch((error: unknown) =>
				console.error('定时备份失败', error),
			)
		}
		const timer = setInterval(tick, 60000)
		timer.unref()
		tick()
		return () => clearInterval(timer)
	}
	return {
		exportPackage,
		importPackage,
		list,
		create,
		download,
		startScheduler,
		whenIdle: () => running || Promise.resolve(),
	}
}
