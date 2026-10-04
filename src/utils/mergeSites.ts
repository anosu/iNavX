import type { Site } from '@/types'
import { normalizeUrl } from '../../shared/catalog'
import { localSiteSchema } from './personalData'

export function mergeSites(
	publicSites: Site[],
	custom: Site[],
	imported: Site[],
	hidden: Set<string>,
): Site[] {
	const local: Site[] = []
	const urls = new Set<string>()
	for (const site of [...custom, ...imported]) {
		try {
			if (!localSiteSchema.safeParse(site).success) continue
			const url = normalizeUrl(site.url)
			if (!urls.has(url)) {
				local.push(site)
				urls.add(url)
			}
		} catch {
			/* Invalid legacy records do not become links. */
		}
	}
	return [
		...publicSites.filter(
			(site) => !hidden.has(site.id) && !urls.has(normalizeUrl(site.url)),
		),
		...local,
	].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)))
}
