import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Badge } from '@/components/atoms/Badge'
import { Button } from '@/components/atoms/Button'
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/atoms/Icons'
import type { CategoryFilterProps, SiteCategory } from '@/types'

export function CategoryFilter({
	categories,
	activeCategory,
	onChange,
}: CategoryFilterProps) {
	const listId = useId()
	const containerRef = useRef<HTMLFieldSetElement>(null)
	const scrollRef = useRef<HTMLDivElement>(null)
	const contentRef = useRef<HTMLDivElement>(null)
	const [scrollState, setScrollState] = useState({
		overflow: false,
		canScrollLeft: false,
		canScrollRight: false,
	})
	const updateScrollState = useCallback(() => {
		const container = containerRef.current
		const scroller = scrollRef.current
		const content = contentRef.current
		if (!container || !scroller || !content) return
		// Measure before reserving arrow space so resizing can hide unneeded controls.
		const overflow = content.scrollWidth > container.clientWidth + 1
		const next = {
			overflow,
			canScrollLeft: overflow && scroller.scrollLeft > 1,
			canScrollRight:
				overflow &&
				scroller.scrollLeft < scroller.scrollWidth - scroller.clientWidth - 1,
		}
		setScrollState((previous) =>
			previous.overflow === next.overflow &&
			previous.canScrollLeft === next.canScrollLeft &&
			previous.canScrollRight === next.canScrollRight
				? previous
				: next,
		)
	}, [])
	const scrollCategories = useCallback((left: number) => {
		scrollRef.current?.scrollBy({
			left,
			behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
				? 'auto'
				: 'smooth',
		})
	}, [])

	useEffect(() => {
		updateScrollState()
		window.addEventListener('resize', updateScrollState)
		const observer =
			typeof window.ResizeObserver === 'function'
				? new window.ResizeObserver(updateScrollState)
				: null
		for (const element of [
			containerRef.current,
			scrollRef.current,
			contentRef.current,
		]) {
			if (element) observer?.observe(element)
		}
		return () => {
			observer?.disconnect()
			window.removeEventListener('resize', updateScrollState)
		}
	}, [updateScrollState])

	useEffect(() => {
		updateScrollState()
		if (!scrollState.overflow) return
		const scroller = scrollRef.current
		const index =
			activeCategory === null ? 0 : categories.indexOf(activeCategory) + 1
		if (!scroller || (activeCategory !== null && index === 0)) return
		const selected = contentRef.current?.children[index]
		if (!selected) return
		const viewport = scroller.getBoundingClientRect()
		const item = selected.getBoundingClientRect()
		if (item.left < viewport.left + 4) {
			scrollCategories(item.left - viewport.left - 4)
		} else if (item.right > viewport.right - 4) {
			scrollCategories(item.right - viewport.right + 4)
		}
	}, [
		activeCategory,
		categories,
		scrollState.overflow,
		scrollCategories,
		updateScrollState,
	])

	// 点击已选中的分类 → 取消选中（回到"全部"）；否则选中该分类
	const handleSelect = (category: SiteCategory | null) => {
		onChange(category === activeCategory ? null : category)
	}

	return (
		<fieldset
			ref={containerRef}
			aria-label="按分类筛选"
			className="flex min-w-0 items-center gap-1"
		>
			{scrollState.overflow && (
				<Button
					variant="icon"
					size="sm"
					className="max-sm:hidden"
					aria-label="向左滚动分类"
					title="向左滚动分类"
					aria-controls={listId}
					disabled={!scrollState.canScrollLeft}
					onClick={() =>
						scrollCategories(
							-Math.max(120, (scrollRef.current?.clientWidth ?? 0) * 0.75),
						)
					}
				>
					<ChevronLeftIcon size={16} />
				</Button>
			)}
			<div
				ref={scrollRef}
				id={listId}
				onScroll={updateScrollState}
				className="min-w-0 flex-1 overflow-x-auto scrollbar-hide"
			>
				<div ref={contentRef} className="flex w-max items-center gap-2 p-1">
					<Badge
						variant={activeCategory === null ? 'active' : 'default'}
						onClick={() => handleSelect(null)}
						className="shrink-0 whitespace-nowrap badge-desktop-md"
						aria-pressed={activeCategory === null}
					>
						全部
					</Badge>

					{categories.map((category) => {
						const isActive = activeCategory === category
						return (
							<Badge
								key={category}
								title={category}
								variant={isActive ? 'active' : 'primary'}
								onClick={() => handleSelect(category)}
								className="max-w-48 shrink-0 whitespace-nowrap badge-desktop-md"
								aria-pressed={isActive}
							>
								<span className="truncate">{category}</span>
							</Badge>
						)
					})}
				</div>
			</div>
			{scrollState.overflow && (
				<Button
					variant="icon"
					size="sm"
					className="max-sm:hidden"
					aria-label="向右滚动分类"
					title="向右滚动分类"
					aria-controls={listId}
					disabled={!scrollState.canScrollRight}
					onClick={() =>
						scrollCategories(
							Math.max(120, (scrollRef.current?.clientWidth ?? 0) * 0.75),
						)
					}
				>
					<ChevronRightIcon size={16} />
				</Button>
			)}
		</fieldset>
	)
}
