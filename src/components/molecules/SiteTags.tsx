import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { XIcon } from '@/components/atoms/Icons'

interface SiteTagsProps {
	name: string
	tags: string[]
	activeTag?: string | null
	onTagSelect?: (tag: string) => void
}

export function SiteTags({
	name,
	tags,
	activeTag,
	onTagSelect,
}: SiteTagsProps) {
	const panelId = useId()
	const tagsRef = useRef<HTMLFieldSetElement>(null)
	const panelRef = useRef<HTMLDivElement>(null)
	const triggerRef = useRef<HTMLButtonElement>(null)
	const [open, setOpen] = useState(false)
	const [truncated, setTruncated] = useState(false)
	const [position, setPosition] = useState<React.CSSProperties>({})
	const preview =
		activeTag && tags.includes(activeTag)
			? [activeTag, ...tags.filter((tag) => tag !== activeTag)].slice(0, 2)
			: tags.slice(0, 2)
	const closePanel = useCallback(() => setOpen(false), [])

	useEffect(() => {
		const fieldset = tagsRef.current
		if (!fieldset || tags.length > 2) {
			setTruncated(false)
			return
		}
		const labels = fieldset.querySelectorAll<HTMLElement>('.site-tag span')
		const measure = () =>
			setTruncated(
				Array.from(labels).some(
					(label) => label.scrollWidth > label.clientWidth,
				),
			)
		measure()
		if (typeof window.ResizeObserver === 'function') {
			const observer = new window.ResizeObserver(measure)
			observer.observe(fieldset)
			for (const label of labels) observer.observe(label)
			return () => observer.disconnect()
		}
		window.addEventListener('resize', measure)
		return () => window.removeEventListener('resize', measure)
	}, [tags])

	useEffect(() => {
		if (!open) return
		const dismiss = (event: Event) => {
			const target = event.target
			if (
				target instanceof Node &&
				(panelRef.current?.contains(target) ||
					triggerRef.current?.contains(target))
			)
				return
			closePanel()
		}
		const handleKey = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return
			event.preventDefault()
			event.stopPropagation()
			closePanel()
			triggerRef.current?.focus()
		}
		panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
		window.addEventListener('resize', dismiss)
		document.addEventListener('scroll', dismiss, true)
		document.addEventListener('pointerdown', dismiss)
		document.addEventListener('focusin', dismiss)
		document.addEventListener('keydown', handleKey, true)
		return () => {
			window.removeEventListener('resize', dismiss)
			document.removeEventListener('scroll', dismiss, true)
			document.removeEventListener('pointerdown', dismiss)
			document.removeEventListener('focusin', dismiss)
			document.removeEventListener('keydown', handleKey, true)
		}
	}, [open, closePanel])

	const positionPanel = () => {
		const rect = triggerRef.current?.getBoundingClientRect()
		if (!rect) return
		const viewportWidth = document.documentElement.clientWidth
		const width = Math.min(320, viewportWidth - 24)
		const below = window.innerHeight - rect.bottom - 12
		const above = rect.top - 12
		const placeAbove = below < 240 && above > below
		setPosition({
			width,
			left: Math.max(
				12,
				Math.min(rect.right - width, viewportWidth - width - 12),
			),
			top: placeAbove ? 'auto' : rect.bottom + 4,
			bottom: placeAbove ? window.innerHeight - rect.top + 4 : 'auto',
			maxHeight: Math.max(0, Math.min(240, (placeAbove ? above : below) - 4)),
		})
	}

	const tagButton = (tag: string, expanded = false) => (
		<button
			key={tag}
			type="button"
			onClick={() => {
				closePanel()
				if (expanded) triggerRef.current?.focus()
				onTagSelect?.(tag)
			}}
			className={[
				'badge site-tag min-w-0 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
				activeTag === tag ? 'badge-active' : 'badge-default',
				expanded
					? 'max-w-full whitespace-normal rounded-md text-left leading-relaxed'
					: preview.length > 1
						? 'max-w-[calc(50%-0.125rem)]'
						: 'max-w-full',
			].join(' ')}
			title={tag}
			aria-label={`筛选标签：${tag}`}
			aria-pressed={activeTag === tag}
			disabled={!onTagSelect}
		>
			<span className={expanded ? 'break-all' : 'truncate'}>{tag}</span>
		</button>
	)

	if (tags.length === 0) return <span className="flex-1" aria-hidden="true" />

	return (
		<fieldset
			ref={tagsRef}
			className="flex min-w-0 flex-1 items-center justify-end gap-1"
			aria-label={`${name}的标签`}
		>
			{preview.map((tag) => tagButton(tag))}
			{(tags.length > 2 || truncated) && (
				<>
					<button
						ref={triggerRef}
						type="button"
						onClick={() => {
							positionPanel()
							setOpen((previous) => !previous)
						}}
						aria-haspopup="dialog"
						aria-expanded={open}
						aria-controls={panelId}
						aria-label={`查看${name}的全部标签`}
						className="shrink-0 rounded px-1.5 py-1 text-[11px] leading-none text-muted-foreground hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
					>
						{tags.length > preview.length
							? `+${tags.length - preview.length}`
							: '…'}
					</button>
					{open &&
						createPortal(
							<div
								ref={panelRef}
								id={panelId}
								role="dialog"
								aria-label={`${name}的全部标签`}
								className="site-tags-popover fixed z-100 right-auto m-0 overflow-hidden rounded-card border border-border bg-surface text-foreground shadow-lg"
								style={position}
							>
								<div className="flex shrink-0 items-center justify-between gap-2 px-3 pt-2 pb-1">
									<span
										className="min-w-0 truncate text-xs text-muted-foreground"
										title={`${name}的全部标签`}
									>
										{name}的全部标签
									</span>
									<button
										type="button"
										onClick={() => {
											closePanel()
											triggerRef.current?.focus()
										}}
										className="btn-icon h-6 w-6 shrink-0"
										aria-label="关闭标签列表"
									>
										<XIcon size={12} />
									</button>
								</div>
								<div className="flex min-h-0 flex-wrap gap-1 overflow-y-auto p-3 pt-1">
									{tags.map((tag) => tagButton(tag, true))}
								</div>
							</div>,
							document.body,
						)}
				</>
			)}
		</fieldset>
	)
}
