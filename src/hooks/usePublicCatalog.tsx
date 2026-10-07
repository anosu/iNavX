import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from 'react'
import { applySiteMetadata } from '@/utils/siteMetadata'
import {
	type Catalog,
	catalogSchema,
	settingsSchema,
} from '../../shared/catalog'
import { DEFAULT_SETTINGS } from '../../shared/defaults'

export const publicApiUrl = (import.meta.env.VITE_PUBLIC_API_URL || '').replace(
	/\/$/,
	'',
)
const cacheKey = `inav-public-catalog:${publicApiUrl}`
function injectedSettings() {
	const parsed = settingsSchema.safeParse(window.__INAV_SETTINGS__)
	return parsed.success ? parsed.data : undefined
}
type CatalogStatus = 'loading' | 'ready' | 'stale' | 'error'
interface CatalogState {
	catalog: Catalog
	status: CatalogStatus
}
const emptyCatalog: Catalog = {
	revision: 'loading',
	categories: [],
	sites: [],
	engines: [],
	settings: DEFAULT_SETTINGS,
}
const CatalogContext = createContext<CatalogState>({
	catalog: emptyCatalog,
	status: 'loading',
})

function readCachedCatalog(): Catalog | undefined {
	try {
		const cached = catalogSchema.safeParse(
			JSON.parse(localStorage.getItem(cacheKey) || 'null'),
		)
		if (cached.success)
			return {
				...cached.data,
				settings: injectedSettings() || cached.data.settings,
			}
	} catch {
		// Cache is optional; seed data must never stand in for a failed backend.
	}
}

export function PublicCatalogProvider({ children }: { children: ReactNode }) {
	const [state, setState] = useState<CatalogState>(() => ({
		catalog: {
			...emptyCatalog,
			settings: injectedSettings() || DEFAULT_SETTINGS,
		},
		status: 'loading',
	}))
	useEffect(() => {
		let active: AbortController | undefined
		const refresh = async () => {
			active?.abort()
			const controller = new AbortController()
			active = controller
			setState((current) =>
				current.status === 'error'
					? { ...current, status: 'loading' }
					: current,
			)
			try {
				let next: Catalog
				if (import.meta.env.VITE_STATIC_MODE === 'true') {
					next = (await import('@/data/staticCatalog')).staticCatalog
				} else {
					const response = await fetch(`${publicApiUrl}/api/public/catalog`, {
						signal: controller.signal,
						credentials: 'omit',
					})
					if (!response.ok) throw new Error('公开目录不可用')
					next = catalogSchema.parse(await response.json())
				}
				if (controller.signal.aborted) return
				setState({ catalog: next, status: 'ready' })
				if (import.meta.env.VITE_STATIC_MODE !== 'true') {
					try {
						localStorage.setItem(cacheKey, JSON.stringify(next))
					} catch {
						/* Cache writes must not affect the live catalog. */
					}
				}
			} catch {
				if (controller.signal.aborted) return
				const cached =
					import.meta.env.VITE_STATIC_MODE === 'true'
						? undefined
						: readCachedCatalog()
				setState((current) => {
					if (current.status === 'ready' || current.status === 'stale')
						return { ...current, status: 'stale' }
					return {
						catalog: cached || current.catalog,
						status: cached ? 'stale' : 'error',
					}
				})
			}
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
		// Preserve server-injected metadata until authoritative data is available.
		if (state.status !== 'ready') return
		window.__INAV_SETTINGS__ = state.catalog.settings
		applySiteMetadata(state.catalog.settings)
	}, [state.catalog.settings, state.status])
	return (
		<CatalogContext.Provider value={state}>{children}</CatalogContext.Provider>
	)
}

export function usePublicCatalog() {
	return useContext(CatalogContext).catalog
}
export function useCatalogStatus() {
	return useContext(CatalogContext).status
}
