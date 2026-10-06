import { useCallback, useEffect, useState } from 'react'
import { copyText } from '@/utils/clipboard'

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
			await copyText(url)
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
