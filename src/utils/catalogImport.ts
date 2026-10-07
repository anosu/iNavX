import { z } from 'zod'
import {
	type Catalog,
	httpUrl,
	type MigrationPackage,
	migrationSchema,
	normalizeUrl,
} from '../../shared/catalog'
import { MAX_CATALOG_SITES } from '../../shared/limits'
import { localSiteSchema } from './personalData'

interface ParsedCatalogImport {
	package: MigrationPackage
	canReplace: boolean
}

export function parseCatalogImport(
	contents: string,
	filename: string,
	currentCatalog: Catalog,
): ParsedCatalogImport {
	let raw: unknown
	if (/\.html?$/i.test(filename)) {
		const bookmarkDocument = new DOMParser().parseFromString(
			contents,
			'text/html',
		)
		raw = [...bookmarkDocument.querySelectorAll('a[href]')]
			.map((anchor) => ({
				id: crypto.randomUUID(),
				name: anchor.textContent?.trim() || '导入站点',
				url: anchor.getAttribute('href'),
				description: '',
				category: '其他',
			}))
			.filter((site) => httpUrl.safeParse(site.url).success)
	} else raw = JSON.parse(contents)

	if (raw && typeof raw === 'object' && 'format' in raw) {
		if (raw.format === 'inav-catalog')
			return {
				package: migrationSchema.parse(raw),
				canReplace: /\.json$/i.test(filename),
			}
		if (
			raw.format === 'inav-personal' &&
			'customSites' in raw &&
			'importedSites' in raw &&
			Array.isArray(raw.customSites) &&
			Array.isArray(raw.importedSites)
		)
			raw = [...raw.customSites, ...raw.importedSites]
	}

	const localSites = z
		.array(localSiteSchema)
		.min(1)
		.max(MAX_CATALOG_SITES)
		.parse(raw)
	const categories = currentCatalog.categories.map((category) => ({
		...category,
	}))
	const categoriesByName = new Map(
		categories.map((category) => [category.name, category]),
	)
	const now = new Date().toISOString()
	const seenUrls = new Set<string>()
	const sites: Catalog['sites'] = []
	for (const site of localSites) {
		const normalizedUrl = normalizeUrl(site.url)
		if (seenUrls.has(normalizedUrl)) continue
		seenUrls.add(normalizedUrl)
		let category = categoriesByName.get(site.category)
		if (!category) {
			category = {
				id: crypto.randomUUID(),
				name: site.category,
				sortOrder: categories.length,
				color: '',
			}
			categories.push(category)
			categoriesByName.set(category.name, category)
		}
		sites.push({
			id: crypto.randomUUID(),
			name: site.name,
			url: site.url,
			description: site.description,
			categoryId: category.id,
			iconUrl: site.iconUrl || '',
			tags: site.tags || [],
			pinned: site.pinned || false,
			sortOrder: sites.length,
			createdAt: now,
			updatedAt: now,
			deletedAt: null,
		})
	}
	return {
		package: migrationSchema.parse({
			format: 'inav-catalog',
			formatVersion: 5,
			appVersion: 'bookmark-import',
			exportedAt: now,
			data: { ...currentCatalog, categories, sites },
		}),
		canReplace: false,
	}
}
