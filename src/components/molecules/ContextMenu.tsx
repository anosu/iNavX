import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
	CopyIcon,
	EditIcon,
	ExternalLinkIcon,
	PinIcon,
	PinOffIcon,
	TrashIcon,
} from '@/components/atoms/Icons'

export interface ContextMenuAction {
	id: string
	label: string
	icon: React.ReactNode
	shortcut?: string
	destructive?: boolean
	disabled?: boolean
	onClick: () => void
}

export interface ContextMenuProps {
	x: number
	y: number
	onClose: () => void
	actions: ContextMenuAction[]
}

export function ContextMenu({ x, y, onClose, actions }: ContextMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null)
	const firstItemRef = useRef<HTMLButtonElement>(null)

	const MENU_WIDTH = 176
	const MENU_ITEM_HEIGHT = 36
	const MENU_PADDING = 4
	const estimatedHeight = actions.length * MENU_ITEM_HEIGHT + MENU_PADDING * 2

	// Right-align: menu right edge = x; flip left if too close to right edge
	const left = Math.max(
		8,
		Math.min(x - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8),
	)

	// Open below by default; flip above if not enough room at bottom
	const openBelow = y + estimatedHeight + 8 < window.innerHeight
	const top = openBelow ? y : Math.max(8, y - estimatedHeight - 4)

	// Focus first item on open
	useEffect(() => {
		requestAnimationFrame(() => {
			firstItemRef.current?.focus()
		})
	}, [])

	// Close on click/touch outside — touchstart with preventDefault so the
	// card beneath doesn't get activated on iOS
	useEffect(() => {
		const handlePointer = (e: MouseEvent | TouchEvent) => {
			const target = e instanceof TouchEvent ? e.touches[0]?.target : e.target
			if (menuRef.current && !menuRef.current.contains(target as Node)) {
				if (e instanceof TouchEvent) e.preventDefault()
				onClose()
			}
		}
		document.addEventListener('mousedown', handlePointer, true)
		document.addEventListener('touchstart', handlePointer, {
			capture: true,
			passive: false,
		})
		return () => {
			document.removeEventListener('mousedown', handlePointer, true)
			document.removeEventListener('touchstart', handlePointer, {
				capture: true,
			} as EventListenerOptions)
		}
	}, [onClose])

	// Close on scroll (non-anchored — position is a snapshot)
	useEffect(() => {
		const handler = () => onClose()
		window.addEventListener('scroll', handler, { passive: true, capture: true })
		return () =>
			window.removeEventListener('scroll', handler, { capture: true })
	}, [onClose])

	// Keyboard navigation
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault()
				onClose()
				return
			}
			if (!menuRef.current) return
			const items = Array.from(
				menuRef.current.querySelectorAll<HTMLButtonElement>(
					'button[role="menuitem"]:not(:disabled)',
				),
			)
			const current = document.activeElement as HTMLButtonElement
			const idx = items.indexOf(current)
			if (e.key === 'ArrowDown') {
				e.preventDefault()
				items[(idx + 1) % items.length]?.focus()
			} else if (e.key === 'ArrowUp') {
				e.preventDefault()
				items[(idx - 1 + items.length) % items.length]?.focus()
			}
		}
		document.addEventListener('keydown', handler)
		return () => document.removeEventListener('keydown', handler)
	}, [onClose])

	const menu = (
		<div
			ref={menuRef}
			role="menu"
			aria-label="站点操作"
			className="
				fixed z-9999
				w-44
				bg-surface border border-border
				rounded-lg shadow-lg
				overflow-hidden
				animate-in
				py-1
			"
			style={{ left, top }}
			onContextMenu={(e) => e.preventDefault()}
		>
			{actions.map((action, index) => (
				<button
					key={action.id}
					ref={index === 0 ? firstItemRef : undefined}
					type="button"
					role="menuitem"
					disabled={action.disabled}
					className={[
						'ctx-item',
						action.destructive ? 'destructive' : '',
						action.disabled ? 'opacity-40 pointer-events-none' : '',
					]
						.filter(Boolean)
						.join(' ')}
					onClick={() => {
						action.onClick()
						onClose()
					}}
				>
					<span className="shrink-0 opacity-75">{action.icon}</span>
					<span className="flex-1 truncate">{action.label}</span>
					{action.shortcut && (
						<span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
							{action.shortcut}
						</span>
					)}
				</button>
			))}
		</div>
	)

	// Portal to body so stacking context / overflow:hidden on card never clips it
	return createPortal(menu, document.body)
}

interface ContextMenuState {
	open: boolean
	x: number
	y: number
}

export interface UseContextMenuReturn {
	menuState: ContextMenuState
	onContextMenu: (e: React.MouseEvent) => void
	onTouchStart: (e: React.TouchEvent) => void
	onTouchEnd: () => void
	onTouchMove: () => void
	closeMenu: () => void
	/** Open the menu at an explicit viewport coordinate (e.g. from iOS three-dot button). */
	openAt: (x: number, y: number) => void
}

export function useContextMenu(): UseContextMenuReturn {
	const [menuState, setMenuState] = useState<ContextMenuState>({
		open: false,
		x: 0,
		y: 0,
	})
	const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
	const touchMoved = useRef(false)

	const openMenu = (x: number, y: number) => {
		setMenuState({ open: true, x, y })
	}

	const closeMenu = () => {
		setMenuState({ open: false, x: 0, y: 0 })
	}

	const onContextMenu = (e: React.MouseEvent) => {
		e.preventDefault()
		e.stopPropagation()
		openMenu(e.clientX, e.clientY)
	}

	const clearLongPress = () => {
		if (longPressTimer.current) {
			clearTimeout(longPressTimer.current)
			longPressTimer.current = null
		}
	}

	// touchcancel fires on Safari iOS when the system takes over the touch
	useEffect(() => {
		const handler = () => {
			if (longPressTimer.current) {
				clearTimeout(longPressTimer.current)
				longPressTimer.current = null
			}
		}
		document.addEventListener('touchcancel', handler, { passive: true })
		return () => document.removeEventListener('touchcancel', handler)
	}, [])

	const onTouchStart = (e: React.TouchEvent) => {
		touchMoved.current = false
		const touch = e.touches[0]
		if (!touch) return
		const x = touch.clientX
		const y = touch.clientY
		longPressTimer.current = setTimeout(() => {
			if (!touchMoved.current) openMenu(x, y)
		}, 500)
	}

	const onTouchEnd = () => {
		clearLongPress()
	}

	const onTouchMove = () => {
		touchMoved.current = true
		clearLongPress()
	}

	return {
		menuState,
		onContextMenu,
		onTouchStart,
		onTouchEnd,
		onTouchMove,
		closeMenu,
		openAt: openMenu,
	}
}

export interface SiteActionCallbacks {
	onOpen?: () => void
	onEdit?: () => void
	onTogglePin?: () => void
	onCopyUrl?: () => void
	onDelete?: () => void
}

export function buildSiteActions(
	site: { url: string; pinned?: boolean; source?: string },
	callbacks: SiteActionCallbacks,
): ContextMenuAction[] {
	const actions: ContextMenuAction[] = []

	if (callbacks.onOpen) {
		actions.push({
			id: 'open',
			label: '在新标签页打开',
			icon: <ExternalLinkIcon size={14} />,
			onClick: callbacks.onOpen,
		})
	}

	if (callbacks.onCopyUrl) {
		actions.push({
			id: 'copy',
			label: '复制链接',
			icon: <CopyIcon size={14} />,
			onClick: callbacks.onCopyUrl,
		})
	}

	const canEdit = site.source === 'custom' || site.source === 'imported'
	const isBuiltin = site.source === 'builtin'

	if (callbacks.onEdit && canEdit) {
		actions.push({
			id: 'edit',
			label: '编辑',
			icon: <EditIcon size={14} />,
			onClick: callbacks.onEdit,
		})
	}

	if (callbacks.onTogglePin && !isBuiltin) {
		actions.push({
			id: 'pin',
			label: site.pinned ? '取消置顶' : '置顶',
			icon: site.pinned ? <PinOffIcon size={14} /> : <PinIcon size={14} />,
			onClick: callbacks.onTogglePin,
		})
	}

	if (callbacks.onDelete && isBuiltin) {
		actions.push({
			id: 'hide',
			label: '本地隐藏',
			icon: <TrashIcon size={14} />,
			destructive: true,
			onClick: callbacks.onDelete,
		})
	} else if (callbacks.onDelete && canEdit) {
		actions.push({
			id: 'delete',
			label: '删除',
			icon: <TrashIcon size={14} />,
			destructive: true,
			onClick: callbacks.onDelete,
		})
	}

	return actions
}
