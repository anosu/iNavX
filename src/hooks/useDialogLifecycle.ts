import { useEffect, useRef } from 'react'

let dialogCount = 0
let restoreBodyScroll: (() => void) | undefined

/** Native dialogs share a scroll lock and restore focus when their owner closes. */
export function useDialogLifecycle(open = true) {
	const ref = useRef<HTMLDialogElement>(null)
	useEffect(() => {
		if (!open) return
		const dialog = ref.current
		if (!dialog) return
		const previousFocus = document.activeElement
		if (dialogCount === 0) {
			const previousOverflow = document.body.style.overflow
			const previousPadding = document.body.style.paddingRight
			const scrollbarWidth =
				window.innerWidth - document.documentElement.clientWidth
			if (scrollbarWidth > 0)
				document.body.style.paddingRight = `${Number.parseFloat(getComputedStyle(document.body).paddingRight) + scrollbarWidth}px`
			document.body.style.overflow = 'hidden'
			restoreBodyScroll = () => {
				document.body.style.overflow = previousOverflow
				document.body.style.paddingRight = previousPadding
			}
		}
		dialogCount++
		dialog.showModal()
		dialog
			.querySelector<HTMLElement>(
				'input:not(:disabled), textarea:not(:disabled), select:not(:disabled)',
			)
			?.focus({ preventScroll: true })
		return () => {
			dialog.close()
			if (--dialogCount === 0) {
				restoreBodyScroll?.()
				restoreBodyScroll = undefined
			}
			if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
				previousFocus.focus({ preventScroll: true })
		}
	}, [open])
	return ref
}
