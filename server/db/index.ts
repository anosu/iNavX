import { mkdirSync, readFileSync } from 'node:fs'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { normalizeUrl, siteSchema } from '../../shared/catalog.js'
import {
	DEFAULT_CATEGORIES,
	DEFAULT_ENGINES,
	DEFAULT_SETTINGS,
} from '../../shared/defaults.js'
import type { ServerConfig } from '../config.js'
import * as schema from './schema.js'

export function openDatabase(config: ServerConfig) {
	mkdirSync(config.dataDir, { recursive: true })
	mkdirSync(config.backupDir, { recursive: true })
	const sqlite = new Database(config.databasePath)
	sqlite.pragma('journal_mode = WAL')
	sqlite.pragma('foreign_keys = ON')
	sqlite.pragma('busy_timeout = 5000')
	const db = drizzle(sqlite, { schema })
	try {
		migrate(db, { migrationsFolder: config.migrationsDir })
		if (!db.select().from(schema.configuration).get()) {
			const seed = JSON.parse(readFileSync(config.seedPath, 'utf8')) as {
				id: string
				name: string
				url: string
				description: string
				category: string
				iconUrl?: string
				pinned?: boolean
				tags?: string[]
			}[]
			db.transaction((tx) => {
				tx.insert(schema.categories).values(DEFAULT_CATEGORIES).run()
				const now = new Date().toISOString()
				const seenUrls = new Set<string>()
				for (const [index, item] of seed.entries()) {
					const category = DEFAULT_CATEGORIES.find(
						(c) => c.name === item.category,
					)
					if (!category) throw new Error(`种子分类不存在：${item.category}`)
					const { category: _category, ...fields } = item
					const normalizedUrl = normalizeUrl(item.url)
					const site = siteSchema.parse({
						...fields,
						categoryId: category.id,
						iconUrl: item.iconUrl || '',
						tags: item.tags || [],
						pinned: item.pinned || false,
						sortOrder: index,
						createdAt: now,
						updatedAt: now,
						deletedAt: seenUrls.has(normalizedUrl) ? now : null,
					})
					seenUrls.add(normalizedUrl)
					tx.insert(schema.sites)
						.values({ ...site, normalizedUrl: normalizeUrl(site.url) })
						.run()
				}
				tx.insert(schema.configuration)
					.values({
						id: 1,
						settings: DEFAULT_SETTINGS,
						engines: DEFAULT_ENGINES,
						revision: 1,
					})
					.run()
			})
		}
		return { db, sqlite }
	} catch (error) {
		sqlite.close()
		throw error
	}
}
export type Store = ReturnType<typeof openDatabase>
