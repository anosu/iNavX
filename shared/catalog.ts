import { z } from 'zod'
import {
	MAX_APPLICATION_HISTORY,
	MAX_CATALOG_CATEGORIES,
	MAX_CATALOG_SITES,
	MAX_SEARCH_ENGINES,
} from './limits.js'
import { isResourceUrl } from './resources.js'
import { tagsSchema } from './tags.js'

export function normalizeUrl(value: string): string {
	return new URL(value.trim()).href
}

const id = z
	.string()
	.min(1)
	.max(100)
	.regex(/^[a-zA-Z0-9_-]+$/, 'ID 只能包含字母、数字、下划线和连字符')
export const httpUrl = z
	.string()
	.trim()
	.max(4096)
	.refine((value) => {
		try {
			const url = new URL(value)
			return (
				['http:', 'https:'].includes(url.protocol) &&
				!url.username &&
				!url.password
			)
		} catch {
			return false
		}
	}, '请输入有效的 HTTP / HTTPS 地址')
const imageUrl = z
	.string()
	.max(4096)
	.refine(isResourceUrl, '请输入站内路径或有效的 HTTP / HTTPS 图片地址')
const template = (placeholder: string) =>
	z
		.string()
		.max(4096)
		.refine(
			(value) =>
				value === '' ||
				(value.includes(placeholder) &&
					isResourceUrl(value.replaceAll(placeholder, 'example'))),
			`地址模板缺少 ${placeholder}`,
		)

export const categorySchema = z
	.object({
		id,
		name: z.string().trim().min(1).max(100),
		sortOrder: z.number().int().min(0).max(1000000),
	})
	.strict()
export const siteInputSchema = z
	.object({
		name: z.string().trim().min(1).max(100),
		url: httpUrl,
		description: z.string().trim().max(1000).default(''),
		categoryId: id,
		iconUrl: imageUrl.default(''),
		pinned: z.boolean().default(false),
		tags: tagsSchema,
		sortOrder: z.number().int().min(0).max(1000000).default(0),
	})
	.strict()
export const siteSchema = siteInputSchema
	.extend({
		id,
		createdAt: z.iso.datetime(),
		updatedAt: z.iso.datetime(),
		deletedAt: z.iso.datetime().nullable(),
	})
	.strict()
export const engineSchema = z
	.object({
		id,
		name: z.string().trim().min(1).max(100),
		searchUrl: template('{q}').refine(
			(v) => httpUrl.safeParse(v.replaceAll('{q}', 'example')).success,
			'请输入 HTTP / HTTPS 搜索地址',
		),
		iconUrl: imageUrl,
		enabled: z.boolean(),
	})
	.strict()
export const settingsSchema = z
	.object({
		name: z.string().trim().min(1).max(100),
		description: z.string().trim().max(1000),
		logoUrl: imageUrl,
		defaultTheme: z.enum(['light', 'dark', 'system']),
		features: z
			.object({
				bookmarkImport: z.boolean(),
				bookmarkExport: z.boolean(),
				customSites: z.boolean(),
				clearImported: z.boolean(),
				hideBuiltin: z.boolean(),
			})
			.strict(),
		faviconTemplate: template('{domain}'),
		metadataProxyTemplate: template('{url}'),
		remoteImagesEnabled: z.boolean().default(false),
		metadataFetchEnabled: z.boolean().default(false),
		backupIntervalHours: z.number().int().min(0).max(8760),
		backupKeep: z.number().int().min(1).max(365),
		applicationsEnabled: z.boolean().default(true),
	})
	.strict()
export const catalogSchema = z
	.object({
		revision: z.string(),
		categories: z.array(categorySchema).max(MAX_CATALOG_CATEGORIES),
		sites: z.array(siteSchema).max(MAX_CATALOG_SITES),
		engines: z.array(engineSchema).max(MAX_SEARCH_ENGINES),
		settings: settingsSchema,
	})
	.strict()
const applicationInputSchema = z
	.object({
		name: z.string().trim().min(1).max(100),
		url: httpUrl,
		description: z.string().trim().max(1000).default(''),
		suggestedCategory: z.string().trim().max(100).default(''),
		tags: tagsSchema,
	})
	.strict()
export const applicationStatusSchema = z.enum([
	'pending',
	'approved',
	'rejected',
	'duplicate',
])
export const applicationSchema = applicationInputSchema
	.extend({
		id,
		status: applicationStatusSchema,
		reviewNote: z.string().max(1000),
		siteId: id.nullable(),
		siteDeletedAt: z.iso.datetime().nullable().default(null),
		createdAt: z.iso.datetime(),
		updatedAt: z.iso.datetime(),
		reviewedAt: z.iso.datetime().nullable(),
	})
	.strict()
	.superRefine((item, ctx) => {
		if (
			item.status === 'pending'
				? item.reviewedAt !== null ||
					item.siteId !== null ||
					item.siteDeletedAt !== null
				: item.reviewedAt === null
		)
			ctx.addIssue({ code: 'custom', message: '申请状态和审核时间不一致' })
		if (
			['approved', 'duplicate'].includes(item.status) &&
			!item.siteId &&
			!item.siteDeletedAt
		)
			ctx.addIssue({ code: 'custom', message: '已收录或重复申请必须关联站点' })
		if (
			(item.status === 'rejected' && (item.siteId || item.siteDeletedAt)) ||
			(item.siteId && item.siteDeletedAt)
		)
			ctx.addIssue({ code: 'custom', message: '拒绝申请不能关联站点' })
	})
export const submissionSchema = applicationInputSchema
	.extend({
		website: z.string().max(200).default(''),
		captchaToken: z.string().max(4096).default(''),
	})
	.strict()
export const reviewSchema = z.discriminatedUnion('action', [
	z
		.object({
			action: z.literal('approved'),
			site: siteInputSchema,
			expectedUpdatedAt: z.iso.datetime(),
			reviewNote: z.string().trim().max(1000).default(''),
		})
		.strict(),
	z
		.object({
			action: z.literal('rejected'),
			expectedUpdatedAt: z.iso.datetime(),
			reviewNote: z.string().trim().max(1000).default(''),
		})
		.strict(),
	z
		.object({
			action: z.literal('duplicate'),
			siteId: id,
			expectedUpdatedAt: z.iso.datetime(),
			reviewNote: z.string().trim().max(1000).default(''),
		})
		.strict(),
])
export type Application = z.infer<typeof applicationSchema>
export type ApplicationInput = z.infer<typeof applicationInputSchema>
export type ReviewInput = z.infer<typeof reviewSchema>
export const migrationSchema = z
	.object({
		format: z.literal('inav-catalog'),
		formatVersion: z.union([
			z.literal(1),
			z.literal(2),
			z.literal(3),
			z.literal(4),
		]),
		appVersion: z.string().max(100),
		exportedAt: z.iso.datetime(),
		data: catalogSchema,
		applications: z
			.array(applicationSchema)
			.max(MAX_APPLICATION_HISTORY)
			.default([]),
	})
	.strict()
	.superRefine((value, ctx) => {
		const { categories, sites, engines } = value.data
		if (value.formatVersion === 1 && value.applications.length)
			ctx.addIssue({ code: 'custom', message: '版本 1 不支持申请记录' })
		if (
			new Set(value.applications.map((item) => item.id)).size !==
			value.applications.length
		)
			ctx.addIssue({ code: 'custom', message: '申请 ID 重复' })
		const siteIds = new Set(sites.map((site) => site.id))
		const pendingUrls = new Set<string>()
		for (const item of value.applications) {
			if (value.formatVersion < 4 && item.tags.length)
				ctx.addIssue({ code: 'custom', message: '旧版迁移包不支持申请标签' })
			if (value.formatVersion < 3 && item.siteDeletedAt)
				ctx.addIssue({
					code: 'custom',
					message: '旧版迁移包不支持已删除站点关联',
				})
			if (item.status === 'pending') {
				const url = normalizeUrl(item.url)
				if (pendingUrls.has(url))
					ctx.addIssue({ code: 'custom', message: '待审核申请 URL 重复' })
				pendingUrls.add(url)
			}
			if (item.siteId && !siteIds.has(item.siteId))
				ctx.addIssue({
					code: 'custom',
					message: `申请关联站点不存在：${item.name}`,
				})
		}
		if (pendingUrls.size > 500)
			ctx.addIssue({ code: 'custom', message: '待审核申请最多 500 条' })
		for (const [label, items] of [
			['分类', categories],
			['站点', sites],
			['搜索引擎', engines],
		] as const) {
			if (new Set(items.map((item) => item.id)).size !== items.length)
				ctx.addIssue({ code: 'custom', message: `${label} ID 重复` })
		}
		if (new Set(categories.map((item) => item.name)).size !== categories.length)
			ctx.addIssue({ code: 'custom', message: '分类名称重复' })
		const categoryIds = new Set(categories.map((item) => item.id))
		const urls = new Set<string>()
		for (const site of sites) {
			if (!categoryIds.has(site.categoryId))
				ctx.addIssue({
					code: 'custom',
					message: `站点分类不存在：${site.name}`,
				})
			if (!site.deletedAt) {
				const url = normalizeUrl(site.url)
				if (urls.has(url))
					ctx.addIssue({
						code: 'custom',
						message: `站点 URL 重复：${site.name}`,
					})
				urls.add(url)
			}
		}
	})
export const credentialsSchema = z
	.object({
		username: z.string().trim().min(1).max(100),
		password: z.string().min(12).max(256),
	})
	.strict()
export type Catalog = z.infer<typeof catalogSchema>
export type Category = z.infer<typeof categorySchema>
export type PublicSite = z.infer<typeof siteSchema>
export type SiteInput = z.infer<typeof siteInputSchema>
export type Settings = z.infer<typeof settingsSchema>
export type Engine = z.infer<typeof engineSchema>
export type MigrationPackage = z.infer<typeof migrationSchema>
