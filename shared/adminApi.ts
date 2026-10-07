import { z } from 'zod'
import { applicationSchema } from './catalog.js'
import {
	ADMIN_PAGE_SIZE,
	MAX_APPLICATION_HISTORY,
	MAX_MEDIA_BYTES,
	MAX_MEDIA_FILES,
} from './limits.js'

export const mediaSchema = z
	.object({
		name: z
			.string()
			.regex(
				/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(png|jpg|gif|webp|ico|svg)$/,
			),
		url: z.string(),
		size: z.number().int().positive().max(MAX_MEDIA_BYTES),
	})
	.strict()
	.refine(
		(item) => item.url === `/media/${item.name}`,
		'图片地址与文件名不一致',
	)
const mediaLibraryItemSchema = mediaSchema.safeExtend({
	usedBy: z.array(z.string()),
	modifiedAt: z.iso.datetime(),
})
export const mediaListSchema = z
	.object({
		items: z.array(mediaLibraryItemSchema).max(MAX_MEDIA_FILES),
		revision: z.string().min(1),
	})
	.strict()
export type MediaLibraryItem = z.infer<typeof mediaLibraryItemSchema>

const count = z.number().int().nonnegative()
export const authResultSchema = z
	.object({
		csrf: z.string().min(1).max(100),
		username: z.string().min(1).max(100),
	})
	.strict()
export const authStatusSchema = z.discriminatedUnion('authenticated', [
	z
		.object({ initialized: z.boolean(), authenticated: z.literal(false) })
		.strict(),
	authResultSchema.extend({
		initialized: z.literal(true),
		authenticated: z.literal(true),
	}),
])
export const applicationListSchema = z
	.object({
		items: z.array(applicationSchema).max(ADMIN_PAGE_SIZE),
		total: count.max(MAX_APPLICATION_HISTORY),
		counts: z
			.object({
				pending: count,
				approved: count,
				rejected: count,
				duplicate: count,
			})
			.strict(),
	})
	.strict()
export const databaseBackupsSchema = z.array(
	z.object({ name: z.string().min(1), size: count }).strict(),
)
export const backupVerificationSchema = z
	.object({
		verified: z.literal(true),
		files: count.positive(),
		createdAt: z.iso.datetime(),
	})
	.strict()
export const operationsSchema = z
	.object({
		commit: z.string(),
		backup: z
			.object({
				lastAttempt: z.string(),
				lastSuccess: z.string(),
				lastError: z.string(),
				name: z.string(),
			})
			.strict(),
	})
	.strict()
export const importPreviewSchema = z
	.object({
		categories: count,
		sites: count,
		trash: count,
		engines: count,
		revision: z.string().min(1),
		applications: count,
	})
	.strict()
export const importResultSchema = z.union([
	z.object({ restored: z.literal(true), backup: z.string().min(1) }).strict(),
	z
		.object({
			added: count,
			skipped: count,
			conflicts: z.array(z.string()),
			backup: z.string().min(1),
			applicationsAdded: count,
			applicationsSkipped: count,
		})
		.strict(),
])
export type AuthStatus = z.infer<typeof authStatusSchema>
export type ApplicationList = z.infer<typeof applicationListSchema>
export type DatabaseBackup = z.infer<typeof databaseBackupsSchema>[number]
export type ImportPreview = z.infer<typeof importPreviewSchema>
