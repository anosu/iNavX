import type { Site } from '@/types'

export function searchCommandSites(sites: Site[], query: string): Site[] {
	const q = query.trim().toLowerCase()
	if (!q) return []
	return sites
		.map((site) => {
			const name = site.name.toLowerCase()
			let score =
				name === q ? 100 : name.startsWith(q) ? 60 : name.includes(q) ? 40 : 0
			if (site.description.toLowerCase().includes(q)) score += 20
			if (site.tags?.some((tag) => tag.toLowerCase().includes(q))) score += 15
			if (site.url.toLowerCase().includes(q)) score += 10
			return { site, score: score > 0 && site.pinned ? score + 5 : score }
		})
		.filter(({ score }) => score > 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, 12)
		.map(({ site }) => site)
}
