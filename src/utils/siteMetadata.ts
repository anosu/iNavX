import type { Settings } from '../../shared/catalog'
import { resolveImageUrl } from '../../shared/resources'

export function applySiteMetadata(settings: Settings) {
	const presentation = settings.presentation
	const image = (value: string) =>
		resolveImageUrl(value, window.location.origin, settings.remoteImagesEnabled)
	const meta = (attribute: 'name' | 'property', key: string, value: string) => {
		let element = document.head.querySelector<HTMLMetaElement>(
			`meta[${attribute}="${key}"]`,
		)
		if (!element) {
			element = document.createElement('meta')
			element.setAttribute(attribute, key)
			document.head.appendChild(element)
		}
		element.content = value
	}
	const link = (rel: string, value: string) => {
		let element = document.head.querySelector<HTMLLinkElement>(
			`link[rel="${rel}"]`,
		)
		if (!value) {
			element?.remove()
			return
		}
		if (!element) {
			element = document.createElement('link')
			element.rel = rel
			document.head.appendChild(element)
		}
		element.removeAttribute('type')
		element.href = value
	}
	document.title = settings.name
	meta('name', 'description', settings.description)
	meta('name', 'author', presentation.author || settings.name)
	meta('name', 'keywords', presentation.keywords)
	for (const prefix of ['og', 'twitter']) {
		const attribute = prefix === 'og' ? 'property' : 'name'
		meta(attribute, `${prefix}:title`, settings.name)
		meta(attribute, `${prefix}:description`, settings.description)
		const share = image(presentation.shareImageUrl)
		meta(
			attribute,
			`${prefix}:image`,
			share ? new URL(share, window.location.origin).href : '',
		)
	}
	meta('property', 'og:site_name', settings.name)
	meta(
		'name',
		'twitter:card',
		image(presentation.shareImageUrl) ? 'summary_large_image' : 'summary',
	)
	link('icon', image(presentation.faviconUrl) || '/favicon.svg')
	link('apple-touch-icon', image(presentation.touchIconUrl) || '')
}
