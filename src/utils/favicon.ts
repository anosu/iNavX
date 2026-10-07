import type { Settings } from '../../shared/catalog'
import { resolveImageUrl } from '../../shared/resources'

export function extractDomain(url: string): string {
	try {
		return new URL(url).hostname
	} catch {
		return ''
	}
}

/** Only generate an icon from an explicitly configured source. */
export function getFaviconUrl(
	urlOrDomain: string,
	settings: Pick<Settings, 'faviconTemplate' | 'remoteImagesEnabled'>,
): string | undefined {
	const domain = urlOrDomain.includes('://')
		? extractDomain(urlOrDomain)
		: urlOrDomain.trim()

	if (!domain) return undefined

	const template = settings?.faviconTemplate
	if (!template) return undefined
	return resolveImageUrl(
		template.replaceAll('{domain}', encodeURIComponent(domain)),
		window.location.origin,
		settings.remoteImagesEnabled,
	)
}
