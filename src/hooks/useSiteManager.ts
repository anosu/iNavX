import { useCallback, useEffect, useRef, useState } from 'react'
import type { Site, SiteCategory } from '@/types'
import { extractDomain, getFaviconUrl } from '@/utils/favicon'
import { readStoredSites } from '@/utils/personalData'
import { httpUrl, normalizeUrl } from '../../shared/catalog'

const STORAGE_KEY = 'inav-custom-sites'
const HIDDEN_BUILTIN_KEY = 'inav-hidden-builtin'

function loadCustomSites(): Site[] {
	try {
		return readStoredSites(localStorage.getItem(STORAGE_KEY), 'custom')
	} catch {
		return []
	}
}

function saveCustomSites(sites: Site[]): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(sites))
	} catch {
		/* Personal storage may be disabled or full; keep the in-memory edits. */
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

function saveHiddenBuiltin(ids: Set<string>): void {
	try {
		localStorage.setItem(HIDDEN_BUILTIN_KEY, JSON.stringify(Array.from(ids)))
	} catch {
		/* Hiding remains usable for this visit when personal storage is unavailable. */
	}
}

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

	if (!payload.category) {
		errors.push({ field: 'category', message: '请选择分类' })
	}

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
	/** addSite 每次成功后递增，供外部依赖触发重新计算 */
	siteRevision: number
}

export function useSiteManager(): UseSiteManagerReturn {
	const [customSites, setCustomSites] = useState<Site[]>(() =>
		loadCustomSites(),
	)
	const [hiddenBuiltinIds, setHiddenBuiltinIds] = useState<Set<string>>(() =>
		loadHiddenBuiltin(),
	)
	const [siteRevision, setSiteRevision] = useState(0)
	const previousSites = useRef(customSites)
	const previousHidden = useRef(hiddenBuiltinIds)

	useEffect(() => {
		if (previousSites.current === customSites) return
		previousSites.current = customSites
		saveCustomSites(customSites)
	}, [customSites])

	useEffect(() => {
		if (previousHidden.current === hiddenBuiltinIds) return
		previousHidden.current = hiddenBuiltinIds
		saveHiddenBuiltin(hiddenBuiltinIds)
	}, [hiddenBuiltinIds])

	const addSite = useCallback(
		(payload: SitePayload): Site => {
			const existingIds = new Set(customSites.map((s) => s.id))
			const iconUrl =
				payload.iconUrl?.trim() || getFaviconUrl(payload.url) || undefined

			const site: Site = {
				id: generateId(payload.name, payload.url, existingIds),
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

			setCustomSites((prev) => [site, ...prev])
			setSiteRevision((v) => v + 1)
			return site
		},
		[customSites],
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
							: newUrl !== site.url
								? getFaviconUrl(newUrl) || site.iconUrl
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
		[],
	)

	const removeSite = useCallback((id: string) => {
		setCustomSites((prev) => prev.filter((s) => s.id !== id))
	}, [])

	const togglePin = useCallback((id: string) => {
		setCustomSites((prev) =>
			prev.map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s)),
		)
	}, [])

	const clearCustomSites = useCallback(() => {
		setCustomSites([])
	}, [])

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

	const hideBuiltin = useCallback((id: string) => {
		setHiddenBuiltinIds((prev) => {
			const next = new Set(prev)
			next.add(id)
			return next
		})
	}, [])

	const restoreBuiltin = useCallback((id: string) => {
		setHiddenBuiltinIds((prev) => {
			const next = new Set(prev)
			next.delete(id)
			return next
		})
	}, [])

	const restoreAllBuiltin = useCallback(() => {
		setHiddenBuiltinIds(new Set())
	}, [])

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
		siteRevision,
	}
}
