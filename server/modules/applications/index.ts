import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, or, sql } from 'drizzle-orm'
import {
	type Application,
	type ApplicationInput,
	type ApplicationList,
	applicationSchema,
	normalizeUrl,
	type ReviewInput,
} from '../../../shared/catalog.js'
import {
	ADMIN_PAGE_SIZE,
	MAX_APPLICATION_HISTORY,
	MAX_PENDING_APPLICATIONS,
} from '../../../shared/limits.js'
import type { Store } from '../../db/index.js'
import { applications, configuration, sites } from '../../db/schema.js'
import { AppError } from '../../errors.js'
import type { CatalogModule } from '../catalog/index.js'

// Older native backups predate this table; their content is migrated on startup.
export function readApplications(store: Store): Application[] {
	if (
		!store.sqlite
			.prepare(
				"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'applications'",
			)
			.get()
	)
		return []
	return store.db
		.select()
		.from(applications)
		.orderBy(asc(applications.createdAt))
		.all()
		.map(({ normalizedUrl: _url, ...row }) => applicationSchema.parse(row))
}

export function createApplications(
	store: Store,
	catalog: CatalogModule,
	assertWritable: () => void,
) {
	const { db } = store
	const touch = () =>
		db
			.update(configuration)
			.set({ revision: sql`${configuration.revision} + 1` })
			.where(eq(configuration.id, 1))
			.run()
	function countByStatus(): ApplicationList['counts'] {
		const counts: ApplicationList['counts'] = {
			pending: 0,
			approved: 0,
			rejected: 0,
			duplicate: 0,
		}
		for (const row of db
			.select({ status: applications.status, count: sql<number>`count(*)` })
			.from(applications)
			.groupBy(applications.status)
			.all())
			counts[row.status] = row.count
		return counts
	}
	function list(
		status?: Application['status'],
		query = '',
		page = 1,
	): ApplicationList {
		const search = query
			.replaceAll('\\', '\\\\')
			.replaceAll('%', '\\%')
			.replaceAll('_', '\\_')
		const conditions = [
			status ? eq(applications.status, status) : undefined,
			search
				? or(
						sql`${applications.name} LIKE ${`%${search}%`} ESCAPE '\\'`,
						sql`${applications.url} LIKE ${`%${search}%`} ESCAPE '\\'`,
					)
				: undefined,
		]
		const where = and(...conditions)
		const total =
			db
				.select({ count: sql<number>`count(*)` })
				.from(applications)
				.where(where)
				.get()?.count || 0
		const counts = countByStatus()
		const items = db
			.select()
			.from(applications)
			.where(where)
			.orderBy(desc(applications.createdAt), desc(applications.id))
			.limit(ADMIN_PAGE_SIZE)
			.offset((page - 1) * ADMIN_PAGE_SIZE)
			.all()
			.map(({ normalizedUrl: _url, ...row }) => row)
		return { items, total, counts }
	}
	function submit(input: ApplicationInput) {
		assertWritable()
		if (!catalog.settings().applicationsEnabled)
			throw new AppError(403, '当前暂停接收收录申请')
		const normalizedUrl = normalizeUrl(input.url)
		if (
			db
				.select()
				.from(applications)
				.where(
					and(
						eq(applications.normalizedUrl, normalizedUrl),
						eq(applications.status, 'pending'),
					),
				)
				.get()
		)
			return
		const counts = countByStatus()
		if (
			Object.values(counts).reduce((sum, count) => sum + count, 0) >=
				MAX_APPLICATION_HISTORY ||
			counts.pending >= MAX_PENDING_APPLICATIONS
		)
			throw new AppError(503, '申请队列暂时已满，请稍后再试')
		const now = new Date().toISOString()
		db.transaction(() => {
			db.insert(applications)
				.values({
					...input,
					id: randomUUID(),
					normalizedUrl,
					status: 'pending',
					reviewNote: '',
					siteId: null,
					createdAt: now,
					updatedAt: now,
					reviewedAt: null,
				})
				.run()
			touch()
		})
	}
	function review(id: string, value: ReviewInput): Application {
		assertWritable()
		return db.transaction(() => {
			const old = db
				.select()
				.from(applications)
				.where(eq(applications.id, id))
				.get()
			if (!old) throw new AppError(404, '申请不存在')
			if (old.status !== 'pending') {
				if (old.status !== value.action)
					throw new AppError(409, '该申请已处理，请刷新列表')
				const { normalizedUrl: _url, ...record } = old
				return record
			}
			if (old.updatedAt !== value.expectedUpdatedAt)
				throw new AppError(409, '申请已变化，请重新打开审核')
			let siteId: string | null = null
			if (value.action === 'approved') siteId = catalog.saveSite(value.site).id
			if (value.action === 'duplicate') {
				const site = db
					.select()
					.from(sites)
					.where(
						and(eq(sites.id, value.siteId), sql`${sites.deletedAt} IS NULL`),
					)
					.get()
				if (!site) throw new AppError(400, '请选择已收录的有效站点')
				siteId = site.id
			}
			const now = new Date().toISOString()
			const patch = {
				status: value.action,
				siteId,
				reviewNote: value.reviewNote,
				reviewedAt: now,
				updatedAt: now,
			}
			db.update(applications).set(patch).where(eq(applications.id, id)).run()
			touch()
			const { normalizedUrl: _url, ...record } = old
			return { ...record, ...patch }
		})
	}
	function replace(records: Application[]) {
		db.delete(applications).run()
		for (const item of records)
			db.insert(applications)
				.values({ ...item, normalizedUrl: normalizeUrl(item.url) })
				.run()
		touch()
	}
	function merge(records: Application[], siteMapping: Record<string, string>) {
		const result = { applicationsAdded: 0, applicationsSkipped: 0 }
		for (const item of records) {
			if (
				db
					.select()
					.from(applications)
					.where(eq(applications.id, item.id))
					.get() ||
				(item.status === 'pending' &&
					db
						.select()
						.from(applications)
						.where(
							and(
								eq(applications.status, 'pending'),
								eq(applications.normalizedUrl, normalizeUrl(item.url)),
							),
						)
						.get())
			) {
				result.applicationsSkipped++
				continue
			}
			const siteId = item.siteId ? siteMapping[item.siteId] : null
			if (item.siteId && !siteId)
				throw new AppError(400, '申请关联站点无法映射')
			db.insert(applications)
				.values({ ...item, siteId, normalizedUrl: normalizeUrl(item.url) })
				.run()
			result.applicationsAdded++
		}
		const counts = list()
		if (counts.total > 10000) throw new AppError(400, '申请最多 10000 条')
		if (counts.counts.pending > 500)
			throw new AppError(400, '待审核申请最多 500 条')
		if (result.applicationsAdded) touch()
		return result
	}
	return {
		list,
		submit,
		review,
		replace,
		merge,
		all: () => readApplications(store),
	}
}
export type ApplicationsModule = ReturnType<typeof createApplications>
