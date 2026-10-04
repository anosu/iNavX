// Accept local assets and explicit HTTP URLs, never protocol-relative or credentialed URLs.
export function isResourceUrl(value: string): boolean {
	if (!value) return true
	if (
		value !== value.trim() ||
		[...value].some(
			(character) => character.charCodeAt(0) <= 32 || character === '\\',
		)
	)
		return false
	if (value.startsWith('/')) return !value.startsWith('//')
	try {
		const url = new URL(value)
		return (
			['http:', 'https:'].includes(url.protocol) &&
			!url.username &&
			!url.password
		)
	} catch {
		return false
	}
}

export function resolveImageUrl(
	value: string | undefined,
	origin: string,
	remoteImagesEnabled: boolean,
): string | undefined {
	if (!value || !isResourceUrl(value)) return undefined
	const url = new URL(value, origin)
	return remoteImagesEnabled || url.origin === origin ? value : undefined
}
