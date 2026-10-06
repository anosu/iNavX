import { useCallback } from 'react'
import { z } from 'zod'
import type { BookmarkImportResult, Site } from '@/types'
import { extractDomain, getFaviconUrl } from '@/utils/favicon'
import {
	localSiteSchema,
	readStoredSites,
	restorePersonalData,
} from '@/utils/personalData'
import { normalizeUrl } from '../../shared/catalog'
import { useStoredState } from './useStoredState'

const STORAGE_KEY = 'inav-imported-sites'

function loadFromStorage(): Site[] {
	try {
		return readStoredSites(localStorage.getItem(STORAGE_KEY), 'imported')
	} catch {
		return []
	}
}

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/\s+/g, '-')
		.replace(/[^\w\u4e00-\u9fa5-]/g, '')
		.slice(0, 40)
}

function parseBookmarkHtml(
	html: string,
	existingIds: Set<string>,
): BookmarkImportResult {
	const parser = new DOMParser()
	const doc = parser.parseFromString(html, 'text/html')

	const sites: Site[] = []
	let skipped = 0

	function walkDl(dl: Element, folderName: string) {
		for (const child of Array.from(dl.children)) {
			if (child.tagName !== 'DT') continue

			const h3 = child.querySelector(':scope > H3')
			const a = child.querySelector(':scope > A')
			const subDl = child.querySelector(':scope > DL')

			if (h3 && subDl) {
				walkDl(subDl, h3.textContent?.trim() || folderName)
				continue
			}

			if (!a) continue

			const url = a.getAttribute('href') ?? ''
			const name = a.textContent?.trim() ?? ''

			if (!url.startsWith('http://') && !url.startsWith('https://')) {
				skipped++
				continue
			}

			const domain = extractDomain(url)
			const baseId = slugify(name) || slugify(domain)
			let id = baseId
			let suffix = 1
			while (existingIds.has(id)) {
				id = `${baseId}-${suffix}`
				suffix++
			}
			existingIds.add(id)

			sites.push({
				id,
				name: name || domain,
				url,
				description: `从书签导入 — ${domain}`,
				iconUrl: domain ? getFaviconUrl(domain) : undefined,
				category: '其他',
				source: 'imported',
				addedAt: new Date().toISOString(),
				tags: folderName && folderName !== '书签栏' ? [folderName] : [],
			})
		}
	}

	const rootDl = doc.querySelector('DL')
	if (rootDl) walkDl(rootDl, '其他')

	return { imported: sites.length, skipped, sites }
}

export interface UseBookmarksReturn {
	importedSites: Site[]
	importFromHtml: (html: string) => BookmarkImportResult
	importFromJson: (json: string) => BookmarkImportResult
	updateImported: (id: string, value: Partial<Site>) => void
	removeImported: (id: string) => void
	clearImported: () => void
	exportToJson: (visibleSites: Site[]) => void
	exportToHtml: (visibleSites: Site[]) => void
}

export function useBookmarks(): UseBookmarksReturn {
	const [importedSites, setImportedSites] = useStoredState(
		STORAGE_KEY,
		loadFromStorage,
	)

	const importFromHtml = useCallback(
		(html: string): BookmarkImportResult => {
			const existingIds = new Set(importedSites.map((s) => s.id))
			const result = parseBookmarkHtml(html, existingIds)
			setImportedSites((prev) => [...prev, ...result.sites])
			return result
		},
		[importedSites, setImportedSites],
	)

	const removeImported = useCallback(
		(id: string) => {
			setImportedSites((prev) => prev.filter((s) => s.id !== id))
		},
		[setImportedSites],
	)
	const updateImported = useCallback(
		(id: string, value: Partial<Site>) => {
			setImportedSites((previous) =>
				previous.map((site) =>
					site.id === id ? { ...site, ...value, id, source: 'imported' } : site,
				),
			)
		},
		[setImportedSites],
	)
	const importFromJson = useCallback(
		(json: string): BookmarkImportResult => {
			const raw: unknown = JSON.parse(json)
			if (
				raw &&
				typeof raw === 'object' &&
				'format' in raw &&
				raw.format === 'inav-personal'
			) {
				restorePersonalData(raw)
				return { imported: 0, skipped: 0, sites: [], handled: true }
			}
			const parsed = z.array(localSiteSchema).max(10000).parse(raw)
			const urls = new Set(importedSites.map((site) => normalizeUrl(site.url)))
			const sites: Site[] = []
			for (const item of parsed) {
				const url = normalizeUrl(item.url)
				if (!urls.has(url)) {
					sites.push({
						...item,
						id: `imported-${crypto.randomUUID()}`,
						source: 'imported',
					})
					urls.add(url)
				}
			}
			setImportedSites((previous) => [...previous, ...sites])
			return {
				imported: sites.length,
				skipped: parsed.length - sites.length,
				sites,
			}
		},
		[importedSites, setImportedSites],
	)

	const clearImported = useCallback(() => {
		setImportedSites([])
	}, [setImportedSites])

	const exportToJson = useCallback((visibleSites: Site[]) => {
		const blob = new Blob([JSON.stringify(visibleSites, null, 2)], {
			type: 'application/json',
		})
		triggerDownload(blob, 'inav-sites.json')
	}, [])

	const exportToHtml = useCallback((visibleSites: Site[]) => {
		const grouped = new Map<string, Site[]>()
		for (const site of visibleSites) {
			const cat = site.category
			if (!grouped.has(cat)) grouped.set(cat, [])
			grouped.get(cat)?.push(site)
		}

		const folderHtml = Array.from(grouped.entries())
			.map(([cat, sites]) => {
				const items = sites
					.map(
						(s) =>
							`    <DT><A HREF="${escapeHtml(s.url)}">${escapeHtml(s.name)}</A>`,
					)
					.join('\n')
				return `  <DT><H3>${escapeHtml(cat)}</H3>\n  <DL><p>\n${items}\n  </DL><p>`
			})
			.join('\n')

		const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file. -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>iNav 导出书签</H1>
<DL><p>
${folderHtml}
</DL><p>`

		const blob = new Blob([html], { type: 'text/html' })
		triggerDownload(blob, 'inav-bookmarks.html')
	}, [])

	return {
		importedSites,
		importFromHtml,
		importFromJson,
		updateImported,
		removeImported,
		clearImported,
		exportToJson,
		exportToHtml,
	}
}

function triggerDownload(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = filename
	a.click()
	URL.revokeObjectURL(url)
}

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
}
