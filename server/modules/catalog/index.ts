import { randomUUID } from 'node:crypto'
import { asc, eq, isNull, sql } from 'drizzle-orm'
import {
	type Catalog,
	type Category,
	catalogSchema,
	type Engine,
	normalizeUrl,
	type PublicSite,
	type Settings,
	type SiteInput,
	settingsSchema,
} from '../../../shared/catalog.js'
import {
	MAX_CATALOG_CATEGORIES,
	MAX_CATALOG_SITES,
} from '../../../shared/limits.js'
import type { Store } from '../../db/index.js'
import { categories, configuration, sites } from '../../db/schema.js'
import { AppError } from '../../errors.js'

export function createCatalog(
	store: Store,
	assertWritable: () => void = () => undefined,
) {
	const { db } = store
	function config() {
		const row = db.select().from(configuration).get()
		if (!row) throw new Error('配置尚未初始化')
		return row
	}
	function touch() {
		db.update(configuration)
			.set({ revision: sql`${configuration.revision} + 1` })
			.where(eq(configuration.id, 1))
			.run()
	}
	function settings(): Settings {
		return settingsSchema.parse(config().settings)
	}
	function snapshot(includeDeleted = false): Catalog {
		const value = config()
		const rows = db
			.select()
			.from(sites)
			.where(includeDeleted ? undefined : isNull(sites.deletedAt))
			.orderBy(asc(sites.sortOrder))
			.all()
		return {
			revision: String(value.revision),
			settings: settingsSchema.parse(value.settings),
			engines: value.engines,
			categories: db
				.select()
				.from(categories)
				.orderBy(asc(categories.sortOrder))
				.all(),
			sites: rows.map(({ normalizedUrl: _normalizedUrl, ...site }) => site),
		}
	}
	function requireSite(id: string) {
		const site = db.select().from(sites).where(eq(sites.id, id)).get()
		if (!site) throw new AppError(404, '站点不存在')
		return site
	}
	function requireCategory(id: string) {
		const category = db
			.select()
			.from(categories)
			.where(eq(categories.id, id))
			.get()
		if (!category) throw new AppError(400, '分类不存在')
		return category
	}
	function checkUrl(url: string, exceptId?: string) {
		const duplicate = db
			.select()
			.from(sites)
			.where(
				sql`${sites.normalizedUrl} = ${normalizeUrl(url)} AND ${sites.deletedAt} IS NULL`,
			)
			.get()
		if (duplicate && duplicate.id !== exceptId)
			throw new AppError(409, `已收录相同 URL：${duplicate.name}`)
	}
	function saveSite(input: SiteInput, id?: string): PublicSite {
		assertWritable()
		requireCategory(input.categoryId)
		const old = id ? requireSite(id) : undefined
		if (
			!old &&
			(db.select({ count: sql<number>`count(*)` }).from(sites).get()?.count ||
				0) >= MAX_CATALOG_SITES
		)
			throw new AppError(409, `站点最多 ${MAX_CATALOG_SITES} 条（含回收站）`)
		if (!old?.deletedAt) checkUrl(input.url, id)
		const now = new Date().toISOString()
		const value = {
			...input,
			id: old?.id || randomUUID(),
			createdAt: old?.createdAt || now,
			updatedAt: now,
			deletedAt: old?.deletedAt || null,
		}
		db.transaction(() => {
			if (old)
				db.update(sites)
					.set({ ...value, normalizedUrl: normalizeUrl(value.url) })
					.where(eq(sites.id, old.id))
					.run()
			else
				db.insert(sites)
					.values({ ...value, normalizedUrl: normalizeUrl(value.url) })
					.run()
			touch()
		})
		return value
	}
	function setSiteDeleted(id: string, deleted: boolean): void {
		assertWritable()
		const old = requireSite(id)
		if (!deleted) checkUrl(old.url, id)
		const now = new Date().toISOString()
		db.transaction(() => {
			db.update(sites)
				.set({
					deletedAt: deleted ? now : null,
					updatedAt: now,
				})
				.where(eq(sites.id, id))
				.run()
			touch()
		})
	}
	function saveCategory(input: Omit<Category, 'id'>, id?: string) {
		assertWritable()
		if (
			!id &&
			(db.select({ count: sql<number>`count(*)` }).from(categories).get()
				?.count || 0) >= MAX_CATALOG_CATEGORIES
		)
			throw new AppError(409, `分类最多 ${MAX_CATALOG_CATEGORIES} 个`)
		if (id) requireCategory(id)
		const other = db
			.select()
			.from(categories)
			.where(eq(categories.name, input.name))
			.get()
		if (other && other.id !== id) throw new AppError(409, '分类名称已存在')
		const value = { ...input, id: id || randomUUID() }
		db.transaction(() => {
			if (id)
				db.update(categories).set(input).where(eq(categories.id, id)).run()
			else db.insert(categories).values(value).run()
			touch()
		})
		return value
	}
	function removeCategory(id: string, targetId?: string) {
		assertWritable()
		requireCategory(id)
		if (db.select().from(categories).all().length <= 1)
			throw new AppError(409, '至少保留一个分类')
		const related = db
			.select({ id: sites.id })
			.from(sites)
			.where(eq(sites.categoryId, id))
			.get()
		if (related && !targetId)
			throw new AppError(409, '分类有关联站点，请选择迁移目标')
		if (targetId) {
			requireCategory(targetId)
			if (targetId === id) throw new AppError(400, '不能迁移到原分类')
		}
		db.transaction(() => {
			if (targetId)
				db.update(sites)
					.set({ categoryId: targetId, updatedAt: new Date().toISOString() })
					.where(eq(sites.categoryId, id))
					.run()
			db.delete(categories).where(eq(categories.id, id)).run()
			touch()
		})
	}
	function saveSettings(settings: Settings) {
		assertWritable()
		db.transaction(() => {
			db.update(configuration)
				.set({ settings })
				.where(eq(configuration.id, 1))
				.run()
			touch()
		})
	}
	function saveEngines(engines: Engine[]) {
		assertWritable()
		if (new Set(engines.map((e) => e.id)).size !== engines.length)
			throw new AppError(400, '搜索引擎 ID 重复')
		db.transaction(() => {
			db.update(configuration)
				.set({ engines })
				.where(eq(configuration.id, 1))
				.run()
			touch()
		})
	}
	function replace(data: Catalog) {
		db.transaction(() => {
			db.delete(sites).run()
			db.delete(categories).run()
			for (const category of data.categories)
				db.insert(categories).values(category).run()
			for (const site of data.sites)
				db.insert(sites)
					.values({ ...site, normalizedUrl: normalizeUrl(site.url) })
					.run()
			db.update(configuration)
				.set({ settings: data.settings, engines: data.engines })
				.where(eq(configuration.id, 1))
				.run()
			touch()
		})
	}
	function merge(data: Catalog) {
		const report = {
			added: 0,
			skipped: 0,
			conflicts: [] as string[],
			siteMapping: Object.create(null) as Record<string, string>,
		}
		db.transaction(() => {
			const existing = snapshot(true)
			const categoriesByName = new Map(
				existing.categories.map((category) => [category.name, category]),
			)
			const categoryIds = new Set(
				existing.categories.map((category) => category.id),
			)
			const sitesById = new Map(existing.sites.map((site) => [site.id, site]))
			const activeByUrl = new Map(
				existing.sites
					.filter((site) => !site.deletedAt)
					.map((site) => [normalizeUrl(site.url), site]),
			)
			const categoryMap = new Map<string, string>()
			for (const category of data.categories) {
				let target = categoriesByName.get(category.name)
				if (!target) {
					target = {
						...category,
						id: categoryIds.has(category.id) ? randomUUID() : category.id,
					}
					db.insert(categories).values(target).run()
					categoriesByName.set(target.name, target)
					categoryIds.add(target.id)
				}
				categoryMap.set(category.id, target.id)
			}
			for (const site of data.sites) {
				const normalizedUrl = normalizeUrl(site.url)
				const old = sitesById.get(site.id)
				if (
					site.deletedAt &&
					old?.deletedAt &&
					normalizeUrl(old.url) === normalizedUrl
				) {
					report.skipped++
					report.siteMapping[site.id] = site.id
					continue
				}
				const duplicate = site.deletedAt
					? undefined
					: activeByUrl.get(normalizedUrl)
				if (duplicate) {
					report.siteMapping[site.id] = duplicate.id
					report.skipped++
					if (
						duplicate.name !== site.name ||
						duplicate.description !== site.description
					)
						report.conflicts.push(site.name)
					continue
				}
				const id = sitesById.has(site.id) ? randomUUID() : site.id
				const categoryId = categoryMap.get(site.categoryId)
				if (!categoryId) throw new AppError(400, '导入分类不存在')
				const row = { ...site, id, categoryId }
				db.insert(sites)
					.values({ ...row, normalizedUrl })
					.run()
				sitesById.set(id, row)
				if (!row.deletedAt) activeByUrl.set(normalizedUrl, row)
				report.siteMapping[site.id] = id
				report.added++
			}
			catalogSchema.parse(snapshot(true))
			touch()
		})
		return report
	}
	return {
		snapshot,
		settings,
		revision: () => String(config().revision),
		saveSite,
		trashSite: (id: string) => setSiteDeleted(id, true),
		restoreSite: (id: string) => setSiteDeleted(id, false),
		saveCategory,
		removeCategory,
		saveSettings,
		saveEngines,
		replace,
		merge,
	}
}
export type CatalogModule = ReturnType<typeof createCatalog>
