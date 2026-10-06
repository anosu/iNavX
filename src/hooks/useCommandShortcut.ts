import { useEffect } from 'react'

/** Capture before dialog handlers stop propagation, without entering other dialogs. */
export function useCommandShortcut(open: boolean, toggle: () => void) {
	useEffect(() => {
		const handle = (event: KeyboardEvent) => {
			if (
				!(event.ctrlKey || event.metaKey) ||
				event.altKey ||
				event.key.toLowerCase() !== 'k' ||
				event.isComposing
			)
				return
			event.preventDefault()
			event.stopPropagation()
			if (!open && document.querySelector('dialog[open]')) return
			if (!event.repeat) toggle()
		}
		window.addEventListener('keydown', handle, true)
		return () => window.removeEventListener('keydown', handle, true)
	}, [open, toggle])
}
