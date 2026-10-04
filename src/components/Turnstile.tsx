import { useEffect, useRef, useState } from 'react'

interface TurnstileApi {
	render: (
		element: HTMLElement,
		options: {
			sitekey: string
			action: string
			theme: 'auto'
			callback: (token: string) => void
			'expired-callback': () => void
			'error-callback': () => void
		},
	) => string
	remove: (id: string) => void
}
declare global {
	interface Window {
		turnstile?: TurnstileApi
	}
}
let loading: Promise<void> | null = null
function load() {
	if (window.turnstile) return Promise.resolve()
	if (loading) return loading
	loading = new Promise<void>((resolve, reject) => {
		const script = document.createElement('script')
		script.src =
			'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
		script.async = true
		script.onload = () => resolve()
		script.onerror = () => {
			script.remove()
			loading = null
			reject(new Error('验证码加载失败'))
		}
		document.head.append(script)
	})
	return loading
}
export function Turnstile({
	siteKey,
	onToken,
}: {
	siteKey: string
	onToken: (token: string) => void
}) {
	const ref = useRef<HTMLDivElement>(null)
	const [error, setError] = useState('')
	const [retry, setRetry] = useState(0)
	// biome-ignore lint/correctness/useExhaustiveDependencies: retry deliberately recreates a failed widget.
	useEffect(() => {
		let active = true
		let id: string | undefined
		setError('')
		onToken('')
		void load()
			.then(() => {
				if (!active || !ref.current || !window.turnstile) return
				id = window.turnstile.render(ref.current, {
					sitekey: siteKey,
					action: 'submit',
					theme: 'auto',
					callback: (token) => {
						if (active) {
							setError('')
							onToken(token)
						}
					},
					'expired-callback': () => {
						if (active) onToken('')
					},
					'error-callback': () => {
						if (active) {
							onToken('')
							setError('验证码未能完成，请重试。')
						}
					},
				})
			})
			.catch(() => {
				if (active) setError('验证码加载失败，请检查网络后重试。')
			})
		return () => {
			active = false
			if (id) window.turnstile?.remove(id)
		}
	}, [siteKey, onToken, retry])
	return (
		<div className="space-y-2">
			<div ref={ref} />
			{error && (
				<p role="alert" className="text-sm text-error">
					{error}{' '}
					<button
						type="button"
						className="underline"
						onClick={() => setRetry((n) => n + 1)}
					>
						重新加载
					</button>
				</p>
			)}
		</div>
	)
}
