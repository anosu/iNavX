import { z } from 'zod'
import type { Site } from '@/types'
import { httpUrl } from '../../shared/catalog'
import { StorageWriteError } from './browserStorage'

export const localSiteSchema = z.object({
	id: z.string().min(1).max(200),
	name: z.string().min(1).max(100),
	url: httpUrl,
	description: z.string().max(1000),
	category: z.string().min(1).max(100),
	categoryId: z.string().optional(),
	iconUrl: z.string().optional(),
	pinned: z.boolean().optional(),
	tags: z.array(z.string()).max(30).optional(),
	source: z.enum(['builtin', 'custom', 'imported']).optional(),
	addedAt: z.string().optional(),
})
export const personalSchema = z
	.object({
		format: z.literal('inav-personal'),
		formatVersion: z.literal(1),
		customSites: z.array(localSiteSchema).max(10000),
		importedSites: z.array(localSiteSchema).max(10000),
		hiddenIds: z.array(z.string()).max(10000),
		theme: z.enum(['light', 'dark', 'system']).nullable(),
		engines: z
			.array(z.object({ id: z.string(), enabled: z.boolean() }))
			.max(100)
			.nullable(),
	})
	.strict()
	.superRefine((value, ctx) => {
		for (const sites of [value.customSites, value.importedSites])
			if (new Set(sites.map((site) => site.id)).size !== sites.length)
				ctx.addIssue({ code: 'custom', message: '个人站点 ID 重复' })
	})

export function readStoredSites(
	raw: string | null,
	source: 'custom' | 'imported',
): Site[] {
	try {
		const value: unknown = JSON.parse(raw || 'null')
		if (!Array.isArray(value)) return []
		const ids = new Set<string>()
		const sites: Site[] = []
		for (const item of value.slice(0, 10000)) {
			const parsed = localSiteSchema.safeParse(item)
			if (!parsed.success || ids.has(parsed.data.id)) continue
			ids.add(parsed.data.id)
			sites.push({ ...parsed.data, source })
		}
		return sites
	} catch {
		return []
	}
}
function downloadJson(value: unknown, name: string) {
	const url = URL.createObjectURL(
		new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
	)
	const anchor = document.createElement('a')
	anchor.href = url
	anchor.download = name
	anchor.click()
	setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function exportPersonalData() {
	const read = (key: string) => JSON.parse(localStorage.getItem(key) || 'null')
	const value = personalSchema.parse({
		format: 'inav-personal',
		formatVersion: 1,
		customSites: read('inav-custom-sites') || [],
		importedSites: read('inav-imported-sites') || [],
		hiddenIds: read('inav-hidden-builtin') || [],
		theme: localStorage.getItem('inav-theme'),
		engines: read('inav:engine-order'),
	})
	downloadJson(value, 'inav-personal.json')
}
export function restorePersonalData(value: unknown) {
	const parsed = personalSchema.parse(value)
	if (
		!window.confirm(
			'恢复此个人备份将替换当前浏览器的个人站点、隐藏记录和偏好。是否继续？',
		)
	)
		return false
	const changes: Record<string, string | null> = {
		'inav-custom-sites': JSON.stringify(
			parsed.customSites.map((site) => ({ ...site, source: 'custom' })),
		),
		'inav-imported-sites': JSON.stringify(
			parsed.importedSites.map((site) => ({ ...site, source: 'imported' })),
		),
		'inav-hidden-builtin': JSON.stringify(parsed.hiddenIds),
		'inav-theme': parsed.theme,
		'inav:engine-order': parsed.engines ? JSON.stringify(parsed.engines) : null,
	}
	let previous: Record<string, string | null>
	try {
		previous = Object.fromEntries(
			Object.keys(changes).map((key) => [key, localStorage.getItem(key)]),
		)
	} catch (cause) {
		throw new StorageWriteError(cause)
	}
	try {
		for (const [key, raw] of Object.entries(changes))
			raw === null
				? localStorage.removeItem(key)
				: localStorage.setItem(key, raw)
	} catch (error) {
		// Release the space used by partially written values before restoring originals.
		for (const key of Object.keys(changes)) localStorage.removeItem(key)
		for (const [key, raw] of Object.entries(previous))
			raw === null
				? localStorage.removeItem(key)
				: localStorage.setItem(key, raw)
		throw new StorageWriteError(error)
	}
	window.location.reload()
	return true
}
