import { type ImgHTMLAttributes, useEffect, useRef, useState } from 'react'

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
const MAX_SVG_BYTES = 256 * 1024

// Some icon services return HTML-style SVG without the namespace required by images.
async function recoverSvg(src: string, signal: AbortSignal): Promise<Blob> {
	const response = await fetch(src, { signal, credentials: 'omit' })
	if (!response.ok || !response.body) throw new Error('Image unavailable')
	const reader = response.body.getReader()
	const chunks: Uint8Array[] = []
	let size = 0
	try {
		while (true) {
			const { done, value } = await reader.read()
			if (done) break
			size += value.byteLength
			if (size > MAX_SVG_BYTES) throw new Error('SVG too large')
			chunks.push(value)
		}
	} finally {
		await reader.cancel()
	}
	const data = new Uint8Array(size)
	let offset = 0
	for (const chunk of chunks) {
		data.set(chunk, offset)
		offset += chunk.byteLength
	}
	const text = new TextDecoder().decode(data)
	if (/<!DOCTYPE/i.test(text)) throw new Error('Unsupported SVG')
	const document = new DOMParser().parseFromString(text, 'image/svg+xml')
	const root = document.documentElement
	if (
		root.tagName !== 'svg' ||
		root.namespaceURI ||
		document.querySelector('parsererror')
	) {
		throw new Error('Not a namespace-less SVG')
	}
	root.removeAttribute('xmlns')
	const svg = new XMLSerializer()
		.serializeToString(root)
		.replace(/^<svg(?=[\s>])/, `<svg xmlns="${SVG_NAMESPACE}"`)
	return new Blob([svg], { type: 'image/svg+xml' })
}

type ResourceImageProps = Omit<
	ImgHTMLAttributes<HTMLImageElement>,
	'onError'
> & {
	onError?: () => void
}

// Key the loader by URL so recovery and temporary resources never leak into a new image.
export function ResourceImage(props: ResourceImageProps) {
	return <ImageLoader key={props.src} {...props} />
}

function ImageLoader({ src, alt, onError, ...props }: ResourceImageProps) {
	const [recoveredUrl, setRecoveredUrl] = useState<string>()
	const attempted = useRef(false)
	const recovery = useRef<AbortController | undefined>(undefined)
	const objectUrl = useRef<string | undefined>(undefined)

	useEffect(() => {
		return () => {
			recovery.current?.abort()
			if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
		}
	}, [])

	const handleError = async () => {
		if (!src || attempted.current) {
			onError?.()
			return
		}
		attempted.current = true
		const controller = new AbortController()
		recovery.current = controller
		try {
			const blob = await recoverSvg(
				src,
				AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
			)
			if (controller.signal.aborted) return
			objectUrl.current = URL.createObjectURL(blob)
			setRecoveredUrl(objectUrl.current)
		} catch {
			if (!controller.signal.aborted) onError?.()
		}
	}

	// SVG stays in an image context; never insert untrusted markup into the page.
	return (
		<img {...props} alt={alt} src={recoveredUrl ?? src} onError={handleError} />
	)
}
