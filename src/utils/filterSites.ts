import type { Site, SiteCategory } from '@/types'

export function filterSites(
	sites: Site[],
	query: string,
	category: SiteCategory | null,
	tag: string | null,
): Site[] {
	const q = query.trim().toLowerCase()
	return sites.filter(
		(site) =>
			(!category || site.category === category) &&
			(!tag || site.tags?.includes(tag)) &&
			(!q ||
				site.name.toLowerCase().includes(q) ||
				site.description.toLowerCase().includes(q) ||
				site.url.toLowerCase().includes(q) ||
				site.tags?.some((value) => value.toLowerCase().includes(q))),
	)
}
