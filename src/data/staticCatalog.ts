import {
	ALLOW_BOOKMARK_EXPORT,
	ALLOW_BOOKMARK_IMPORT,
	ALLOW_CLEAR_IMPORTED,
	ALLOW_CUSTOM_SITES,
	ALLOW_HIDE_BUILTIN,
} from '@/config/features'
import sitesData from '@/data/sites.json'
import type { Catalog } from '../../shared/catalog'
import {
	DEFAULT_CATEGORIES,
	DEFAULT_ENGINES,
	DEFAULT_SETTINGS,
} from '../../shared/defaults'

/** Loaded only by explicit static builds; never a fallback for the backend. */
export const staticCatalog: Catalog = {
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
	sites: sitesData.map(({ category, ...site }, index) => {
		const match = DEFAULT_CATEGORIES.find((item) => item.name === category)
		if (!match) throw new Error(`静态站点分类不存在：${category}`)
		return {
			...site,
			categoryId: match.id,
			iconUrl: site.iconUrl || '',
			pinned: site.pinned || false,
			tags: 'tags' in site ? (site.tags as string[]) : [],
			sortOrder: index,
			createdAt: '2026-01-01T00:00:00.000Z',
			updatedAt: '2026-01-01T00:00:00.000Z',
			deletedAt: null,
		}
	}),
}
