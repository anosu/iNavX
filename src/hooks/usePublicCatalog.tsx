import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from 'react'
import {
	ALLOW_BOOKMARK_EXPORT,
	ALLOW_BOOKMARK_IMPORT,
	ALLOW_CLEAR_IMPORTED,
	ALLOW_CUSTOM_SITES,
	ALLOW_HIDE_BUILTIN,
} from '@/config/features'
import sitesData from '@/data/sites.json'
import { type Catalog, catalogSchema } from '../../shared/catalog'
import {
	DEFAULT_CATEGORIES,
	DEFAULT_ENGINES,
	DEFAULT_SETTINGS,
} from '../../shared/defaults'

export const publicApiUrl = (import.meta.env.VITE_PUBLIC_API_URL || '').replace(
	/\/$/,
	'',
)
const cacheKey = `inav-public-catalog:${publicApiUrl}`
const staticCatalog: Catalog = {
	revision: 'static',
	categories: DEFAULT_CATEGORIES,
	settings: {
		...DEFAULT_SETTINGS,
		applicationsEnabled: false,
		features: {
			bookmarkImport: ALLOW_BOOKMARK_IMPORT,
			bookmarkExport: ALLOW_BOOKMARK_EXPORT,
			customSites: ALLOW_CUSTOM_SITES,
			hideBuiltin: ALLOW_HIDE_BUILTIN,
			clearImported: ALLOW_CLEAR_IMPORTED,
		},
	},
	engines: DEFAULT_ENGINES,
	sites: sitesData.map((site, index) => ({
		...site,
		categoryId:
			DEFAULT_CATEGORIES.find((c) => c.name === site.category)?.id ||
			'category-10',
		iconUrl: site.iconUrl || '',
		pinned: site.pinned || false,
		tags: 'tags' in site ? (site.tags as string[]) : [],
		sortOrder: index,
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		deletedAt: null,
	})),
}
const CatalogContext = createContext({
	catalog: staticCatalog,
	unavailable: false,
})

function initialCatalog() {
	if (import.meta.env.VITE_STATIC_MODE === 'true') return staticCatalog
	try {
		const cached = catalogSchema.safeParse(
			JSON.parse(localStorage.getItem(cacheKey) || 'null'),
		)
		if (cached.success)
			return {
				...cached.data,
				settings: window.__INAV_SETTINGS__ || cached.data.settings,
			}
	} catch {
		/* The static directory remains available when storage is disabled. */
	}
	return {
		...staticCatalog,
		settings: window.__INAV_SETTINGS__ || staticCatalog.settings,
	}
}

export function PublicCatalogProvider({ children }: { children: ReactNode }) {
	const [catalog, setCatalog] = useState<Catalog>(initialCatalog)
	const [unavailable, setUnavailable] = useState(false)
	useEffect(() => {
		if (import.meta.env.VITE_STATIC_MODE === 'true') return
		let active: AbortController | undefined
		const refresh = () => {
			active?.abort()
			const controller = new AbortController()
			active = controller
			return fetch(`${publicApiUrl}/api/public/catalog`, {
				signal: controller.signal,
				credentials: 'omit',
			})
				.then(async (response) => {
					if (!response.ok) throw new Error('公开目录不可用')
					const next = catalogSchema.parse(await response.json())
					if (controller.signal.aborted) return
					setCatalog(next)
					setUnavailable(false)
					try {
						localStorage.setItem(cacheKey, JSON.stringify(next))
					} catch {
						/* Cache is optional. */
					}
				})
				.catch(() => {
					if (!controller.signal.aborted)
						setUnavailable(Boolean(window.__INAV_BACKEND__ || publicApiUrl))
				})
		}
		void refresh()
		const handleChange = () => {
			void refresh()
		}
		window.addEventListener('inav:catalog-changed', handleChange)
		return () => {
			active?.abort()
			window.removeEventListener('inav:catalog-changed', handleChange)
		}
	}, [])
	useEffect(() => {
		window.__INAV_SETTINGS__ = catalog.settings
		document.title = catalog.settings.name
		document
			.querySelector('meta[name="description"]')
			?.setAttribute('content', catalog.settings.description)
	}, [catalog.settings])
	return (
		<CatalogContext.Provider value={{ catalog, unavailable }}>
			{children}
		</CatalogContext.Provider>
	)
}

export function usePublicCatalog() {
	return useContext(CatalogContext).catalog
}
export function useCatalogAvailability() {
	return useContext(CatalogContext).unavailable
}
