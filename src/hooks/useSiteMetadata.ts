import {
	type Dispatch,
	type SetStateAction,
	useCallback,
	useEffect,
	useRef,
	useState,
} from 'react'
import { httpUrl } from '../../shared/catalog'
import type { SitePayload } from './useSiteManager'

interface PageMeta {
	title: string
	description: string
}

async function fetchPageMeta(
	url: string,
	template: string,
	signal: AbortSignal,
): Promise<PageMeta | null> {
	try {
		const response = await fetch(
			template.replaceAll('{url}', encodeURIComponent(url)),
			{
				signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
			},
		)
		if (!response.ok) return null
		const html = await response.text()
		if (!html) return null
		const doc = new DOMParser().parseFromString(html, 'text/html')
		const title = doc.querySelector('title')?.textContent?.trim() ?? ''
		const description =
			doc
				.querySelector('meta[name="description"]')
				?.getAttribute('content')
				?.trim() ||
			doc
				.querySelector('meta[property="og:description"]')
				?.getAttribute('content')
				?.trim() ||
			doc
				.querySelector('meta[name="twitter:description"]')
				?.getAttribute('content')
				?.trim() ||
			''
		return title || description ? { title, description } : null
	} catch {
		return null
	}
}

// Owns the lifetime of each request; late responses must never overwrite manual edits.
export function useSiteMetadata(
	open: boolean,
	isEdit: boolean,
	form: SitePayload,
	setForm: Dispatch<SetStateAction<SitePayload>>,
	template: string,
) {
	const [fetchStatus, setFetchStatus] = useState<
		'idle' | 'loading' | 'done' | 'error'
	>('idle')
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
	const request = useRef<AbortController | null>(null)
	const formRef = useRef(form)
	formRef.current = form
	const cancelMetadata = useCallback(() => {
		if (timer.current) clearTimeout(timer.current)
		timer.current = null
		request.current?.abort()
		request.current = null
		setFetchStatus('idle')
	}, [])
	const fetchMetadata = useCallback(
		async (url: string, mode: 'fill' | 'refresh') => {
			const trimmed = url.trim()
			if (!template || !httpUrl.safeParse(trimmed).success) return
			cancelMetadata()
			const controller = new AbortController()
			request.current = controller
			const before = formRef.current
			setFetchStatus('loading')
			const meta = await fetchPageMeta(trimmed, template, controller.signal)
			if (controller.signal.aborted || request.current !== controller) return
			if (!meta) {
				setFetchStatus('error')
				return
			}
			setFetchStatus('done')
			setForm((previous) =>
				previous.url.trim() !== trimmed
					? previous
					: {
							...previous,
							name:
								(mode === 'refresh' && previous.name === before.name) ||
								!previous.name.trim()
									? meta.title.slice(0, 50) || previous.name
									: previous.name,
							description:
								(mode === 'refresh' &&
									previous.description === before.description) ||
								!previous.description.trim()
									? meta.description.slice(0, 100) || previous.description
									: previous.description,
						},
			)
		},
		[template, cancelMetadata, setForm],
	)
	useEffect(() => {
		cancelMetadata()
		if (open && !isEdit && template && httpUrl.safeParse(form.url).success) {
			timer.current = setTimeout(
				() => void fetchMetadata(form.url, 'fill'),
				600,
			)
		}
		return cancelMetadata
	}, [open, isEdit, form.url, template, fetchMetadata, cancelMetadata])
	const handleRefreshMeta = useCallback(
		() => void fetchMetadata(form.url, 'refresh'),
		[form.url, fetchMetadata],
	)
	return { fetchStatus, cancelMetadata, handleRefreshMeta }
}
