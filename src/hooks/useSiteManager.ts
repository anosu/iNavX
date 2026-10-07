import { useCallback } from 'react'
import type { Site, SiteCategory } from '@/types'
import { extractDomain } from '@/utils/favicon'
import { readStoredSites } from '@/utils/personalData'
import { httpUrl, normalizeUrl } from '../../shared/catalog'
import { tagsSchema } from '../../shared/tags'
import { useStoredState } from './useStoredState'

const STORAGE_KEY = 'inav-custom-sites'
const HIDDEN_BUILTIN_KEY = 'inav-hidden-builtin'

function loadCustomSites(): Site[] {
	try {
		return readStoredSites(localStorage.getItem(STORAGE_KEY), 'custom')
	} catch {
		return []
	}
}

function loadHiddenBuiltin(): Set<string> {
	try {
		const raw = localStorage.getItem(HIDDEN_BUILTIN_KEY)
		if (!raw) return new Set()
		const parsed: unknown = JSON.parse(raw)
		return Array.isArray(parsed)
			? new Set(
					parsed.filter((id: unknown): id is string => typeof id === 'string'),
				)
			: new Set()
	} catch {
		return new Set()
	}
}

const serializeHidden = (ids: Set<string>) => Array.from(ids)

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/\s+/g, '-')
		.replace(/[^\w\u4e00-\u9fa5-]/g, '')
		.slice(0, 40)
}

function generateId(
	name: string,
	url: string,
	existingIds: Set<string>,
): string {
	const base = slugify(name) || slugify(extractDomain(url)) || 'site'
	let id = `custom-${base}`
	let suffix = 1
	while (existingIds.has(id)) {
		id = `custom-${base}-${suffix}`
		suffix++
	}
	return id
}

export interface SitePayload {
	name: string
	url: string
	description: string
	category: SiteCategory
	iconUrl?: string
	pinned?: boolean
	tags?: string[]
}

export interface ValidationError {
	field: keyof SitePayload
	message: string
}

export function validateSitePayload(
	payload: Partial<SitePayload>,
): ValidationError[] {
	const errors: ValidationError[] = []

	if (!payload.name?.trim()) {
		errors.push({ field: 'name', message: '站点名称不能为空' })
	} else if (payload.name.trim().length > 50) {
		errors.push({ field: 'name', message: '站点名称不超过 50 个字符' })
	}

	if (!payload.url?.trim()) {
		errors.push({ field: 'url', message: 'URL 不能为空' })
	} else if (!httpUrl.safeParse(payload.url).success)
		errors.push({
			field: 'url',
			message: '请输入不含账号密码的 HTTP / HTTPS 地址',
		})

	if (!payload.description?.trim()) {
		errors.push({ field: 'description', message: '描述不能为空' })
	} else if (payload.description.trim().length > 100) {
		errors.push({ field: 'description', message: '描述不超过 100 个字符' })
	}

	if (!payload.category?.trim()) {
		errors.push({ field: 'category', message: '请选择分类' })
	} else if (payload.category.trim().length > 100) {
		errors.push({ field: 'category', message: '分类名称不超过 100 个字符' })
	}

	const tags = tagsSchema.safeParse(payload.tags)
	if (!tags.success)
		errors.push({ field: 'tags', message: tags.error.issues[0].message })
	return errors
}

export interface UseSiteManagerReturn {
	customSites: Site[]
	addSite: (payload: SitePayload) => Site
	updateSite: (id: string, payload: Partial<SitePayload>) => void
	removeSite: (id: string) => void
	togglePin: (id: string) => void
	clearCustomSites: () => void
	isUrlDuplicate: (url: string, excludeId?: string) => boolean
	hiddenBuiltinIds: Set<string>
	hideBuiltin: (id: string) => void
	restoreBuiltin: (id: string) => void
	restoreAllBuiltin: () => void
}

export function useSiteManager(): UseSiteManagerReturn {
	const [customSites, setCustomSites] = useStoredState(
		STORAGE_KEY,
		loadCustomSites,
	)
	const [hiddenBuiltinIds, setHiddenBuiltinIds] = useStoredState(
		HIDDEN_BUILTIN_KEY,
		loadHiddenBuiltin,
		serializeHidden,
	)

	const addSite = useCallback(
		(payload: SitePayload): Site => {
			const iconUrl = payload.iconUrl?.trim() || undefined

			const site: Site = {
				id: '',
				name: payload.name.trim(),
				url: payload.url.trim(),
				description: payload.description.trim(),
				category: payload.category,
				iconUrl,
				pinned: payload.pinned ?? false,
				tags: payload.tags ?? [],
				source: 'custom' as Site['source'],
				addedAt: new Date().toISOString(),
			}

			setCustomSites((previous) => {
				site.id = generateId(
					payload.name,
					payload.url,
					new Set(previous.map((item) => item.id)),
				)
				return [site, ...previous]
			})
			return site
		},
		[setCustomSites],
	)

	const updateSite = useCallback(
		(id: string, payload: Partial<SitePayload>) => {
			setCustomSites((prev) =>
				prev.map((site) => {
					if (site.id !== id) return site
					const newUrl = payload.url?.trim() ?? site.url
					const iconUrl =
						payload.iconUrl !== undefined
							? payload.iconUrl?.trim() || undefined
							: site.iconUrl
					return {
						...site,
						...payload,
						name: payload.name?.trim() ?? site.name,
						url: newUrl,
						description: payload.description?.trim() ?? site.description,
						iconUrl,
					}
				}),
			)
		},
		[setCustomSites],
	)

	const removeSite = useCallback(
		(id: string) => {
			setCustomSites((prev) => prev.filter((s) => s.id !== id))
		},
		[setCustomSites],
	)

	const togglePin = useCallback(
		(id: string) => {
			setCustomSites((prev) =>
				prev.map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s)),
			)
		},
		[setCustomSites],
	)

	const clearCustomSites = useCallback(() => {
		setCustomSites([])
	}, [setCustomSites])

	const isUrlDuplicate = useCallback(
		(url: string, excludeId?: string): boolean => {
			const normalized = normalizeUrl(url)
			return customSites.some((s) => {
				if (s.id === excludeId) return false
				return normalizeUrl(s.url) === normalized
			})
		},
		[customSites],
	)

	const hideBuiltin = useCallback(
		(id: string) => {
			setHiddenBuiltinIds((prev) => {
				const next = new Set(prev)
				next.add(id)
				return next
			})
		},
		[setHiddenBuiltinIds],
	)

	const restoreBuiltin = useCallback(
		(id: string) => {
			setHiddenBuiltinIds((prev) => {
				const next = new Set(prev)
				next.delete(id)
				return next
			})
		},
		[setHiddenBuiltinIds],
	)

	const restoreAllBuiltin = useCallback(() => {
		setHiddenBuiltinIds(new Set())
	}, [setHiddenBuiltinIds])

	return {
		customSites,
		addSite,
		updateSite,
		removeSite,
		togglePin,
		clearCustomSites,
		isUrlDuplicate,
		hiddenBuiltinIds,
		hideBuiltin,
		restoreBuiltin,
		restoreAllBuiltin,
	}
}
