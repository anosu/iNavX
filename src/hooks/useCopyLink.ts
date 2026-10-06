import { useCallback, useEffect, useState } from 'react'

function copySynchronously(value: string): boolean {
	const previousFocus = document.activeElement
	const input = document.createElement('textarea')
	input.value = value
	input.style.cssText =
		'position:fixed;top:0;left:0;opacity:0;pointer-events:none'
	document.body.appendChild(input)
	try {
		input.focus()
		input.select()
		return document.execCommand('copy')
	} catch {
		return false
	} finally {
		input.remove()
		if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
			previousFocus.focus({ preventScroll: true })
	}
}

export function useCopyLink(url: string) {
	const [result, setResult] = useState<{
		url: string
		status: 'copied' | 'error' | 'idle'
	}>({ url, status: 'idle' })
	useEffect(() => {
		if (result.status !== 'copied') return
		const timer = setTimeout(
			() => setResult({ url: result.url, status: 'idle' }),
			1500,
		)
		return () => clearTimeout(timer)
	}, [result])
	const copyLink = useCallback(async () => {
		try {
			// iOS requires the synchronous attempt within the original user gesture.
			if (!copySynchronously(url)) {
				if (!navigator.clipboard) throw new Error('Clipboard unavailable')
				await navigator.clipboard.writeText(url)
			}
			setResult({ url, status: 'copied' })
		} catch {
			setResult({ url, status: 'error' })
		}
	}, [url])
	return {
		copyLink,
		copied: result.url === url && result.status === 'copied',
		copyFailed: result.url === url && result.status === 'error',
	}
}
