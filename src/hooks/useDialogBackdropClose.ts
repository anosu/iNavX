import { type MouseEvent, type PointerEvent, useRef } from 'react'

const MAX_CLICK_MOVEMENT = 6

function isBackdrop(event: PointerEvent<HTMLDialogElement>) {
	const rect = event.currentTarget.getBoundingClientRect()
	return (
		event.target === event.currentTarget &&
		(event.clientX < rect.left ||
			event.clientX > rect.right ||
			event.clientY < rect.top ||
			event.clientY > rect.bottom)
	)
}

/** Only a completed background click can dismiss a dialog, never a drag. */
export function useDialogBackdropClose(onClose?: () => void) {
	const pressRef = useRef<{
		pointerId: number
		x: number
		y: number
		released: boolean
	} | null>(null)
	return {
		onPointerDown(event: PointerEvent<HTMLDialogElement>) {
			pressRef.current =
				onClose && event.isPrimary && event.button === 0 && isBackdrop(event)
					? {
							pointerId: event.pointerId,
							x: event.clientX,
							y: event.clientY,
							released: false,
						}
					: null
		},
		onPointerMove(event: PointerEvent<HTMLDialogElement>) {
			const press = pressRef.current
			if (
				press &&
				Math.hypot(event.clientX - press.x, event.clientY - press.y) >
					MAX_CLICK_MOVEMENT
			)
				pressRef.current = null
		},
		onPointerUp(event: PointerEvent<HTMLDialogElement>) {
			const press = pressRef.current
			pressRef.current =
				press?.pointerId === event.pointerId &&
				isBackdrop(event) &&
				Math.hypot(event.clientX - press.x, event.clientY - press.y) <=
					MAX_CLICK_MOVEMENT
					? { ...press, released: true }
					: null
		},
		onPointerCancel() {
			pressRef.current = null
		},
		onClick(event: MouseEvent<HTMLDialogElement>) {
			event.stopPropagation()
			const press = pressRef.current
			pressRef.current = null
			if (press?.released) onClose?.()
		},
	}
}
