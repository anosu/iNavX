import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buttonVariants } from '@/components/atoms/Button'
import { ExternalLinkIcon, SearchIcon, XIcon } from '@/components/atoms/Icons'
import { Input } from '@/components/atoms/Input'
import { ResourceImage } from '@/components/atoms/ResourceImage'
import { getCategoryColor } from '@/data/categories'
import { useDialogLifecycle } from '@/hooks/useDialogLifecycle'
import { useSiteIconUrl } from '@/hooks/useImageUrl'
import type { Site, SiteCategory } from '@/types'

/* ============================================================
   CommandPalette
   - ⌘K / Ctrl+K 唤起
   - 实时模糊搜索站点（名称 / 描述 / tags）
   - 键盘上下导航，Enter 在新标签页打开
   - Esc 关闭
   - 搜索关键词高亮
   ============================================================ */

// ---- 高亮工具 ----

function highlightMatch(text: string, query: string): React.ReactNode {
	if (!query.trim()) return text
	const regex = new RegExp(`(${escapeRegex(query.trim())})`, 'gi')
	const parts = text.split(regex)
	return parts.map((part, i) =>
		regex.test(part) ? (
			// biome-ignore lint/suspicious/noArrayIndexKey: 高亮分片
			<mark key={i} className="search-highlight not-italic font-medium">
				{part}
			</mark>
		) : (
			// biome-ignore lint/suspicious/noArrayIndexKey: 高亮分片
			<span key={i}>{part}</span>
		),
	)
}

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ---- 搜索逻辑 ----

function searchSites(sites: Site[], query: string): Site[] {
	const q = query.trim().toLowerCase()
	if (!q) return sites.slice(0, 20) // 无输入时显示前 20 个

	return sites
		.map((site) => {
			let score = 0
			const name = site.name.toLowerCase()
			const desc = site.description.toLowerCase()
			const tags = site.tags?.join(' ').toLowerCase() ?? ''
			const url = site.url.toLowerCase()

			if (name === q) score += 100
			else if (name.startsWith(q)) score += 60
			else if (name.includes(q)) score += 40

			if (desc.includes(q)) score += 20
			if (tags.includes(q)) score += 15
			if (url.includes(q)) score += 10
			if (site.pinned) score += 5

			return { site, score }
		})
		.filter(({ score }) => score > 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, 12)
		.map(({ site }) => site)
}

// ---- 分类颜色 ----

function CategoryDot({ category }: { category: SiteCategory }) {
	const color = getCategoryColor(category)
	return (
		<span
			className={`inline-block w-1.5 h-1.5 rounded-full bg-current shrink-0 ${color}`}
		/>
	)
}

// ---- 站点 favicon ----

function SiteAvatar({ site }: { site: Site }) {
	const iconUrl = useSiteIconUrl(site.iconUrl, site.url)
	const [failedUrl, setFailedUrl] = useState<string>()
	const initial = [...site.name][0]?.toUpperCase() ?? '?'

	if (!iconUrl || failedUrl === iconUrl) {
		return (
			<div className="h-6 w-6 shrink-0 rounded-md bg-muted flex items-center justify-center text-[11px] font-semibold text-muted-foreground">
				{initial}
			</div>
		)
	}

	return (
		<ResourceImage
			src={iconUrl}
			alt=""
			width={24}
			height={24}
			className="h-6 w-6 shrink-0 rounded-md object-contain"
			onError={() => setFailedUrl(iconUrl)}
			loading="eager"
			decoding="async"
		/>
	)
}

// ---- 单条结果 ----

interface ResultItemProps {
	site: Site
	query: string
	selected: boolean
	onMouseEnter: () => void
	onClick: () => void
}

function ResultItem({
	site,
	query,
	selected,
	onMouseEnter,
	onClick,
}: ResultItemProps) {
	const ref = useRef<HTMLButtonElement>(null)

	// 被键盘选中时滚动到视图内
	useEffect(() => {
		if (selected) {
			ref.current?.scrollIntoView({ block: 'nearest' })
		}
	}, [selected])

	return (
		<button
			ref={ref}
			id={`cmd-item-${site.source}-${site.id}`}
			role="option"
			aria-selected={selected}
			type="button"
			className="cmd-item w-full text-left"
			data-selected={selected ? 'true' : undefined}
			onMouseEnter={onMouseEnter}
			onClick={onClick}
			tabIndex={-1}
		>
			{/* 图标 */}
			<SiteAvatar site={site} />

			{/* 信息 */}
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-1.5 min-w-0">
					<span className="text-sm font-medium text-foreground truncate">
						{highlightMatch(site.name, query)}
					</span>
					<CategoryDot category={site.category} />
					<span
						className="max-w-24 truncate text-[11px] text-muted-foreground"
						title={site.category}
					>
						{site.category}
					</span>
				</div>
				<p className="text-[11px] text-muted-foreground truncate mt-0.5 leading-none">
					{highlightMatch(site.description, query)}
				</p>
			</div>

			{/* 外链提示 */}
			{selected && (
				<span className="shrink-0 text-muted-foreground opacity-60 animate-fade-in">
					<ExternalLinkIcon size={12} />
				</span>
			)}
		</button>
	)
}

// ---- 空状态 ----

function EmptyState({ query }: { query: string }) {
	return (
		<div className="flex flex-col items-center justify-center py-12 px-4 text-center">
			<SearchIcon size={24} className="text-muted-foreground mb-3 opacity-40" />
			<p className="text-sm text-muted-foreground break-words">
				未找到
				{query.trim() && (
					<>
						{' '}
						与{' '}
						<span className="font-medium text-foreground">
							&ldquo;{query.trim()}&rdquo;
						</span>{' '}
						匹配
					</>
				)}{' '}
				的站点
			</p>
		</div>
	)
}

// ---- 页脚提示 ----

function Footer({ resultCount }: { resultCount: number }) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-2">
			<div className="flex items-center gap-3">
				<span className="flex items-center gap-1 text-[11px] text-muted-foreground">
					<kbd className="kbd">↑</kbd>
					<kbd className="kbd">↓</kbd>
					导航
				</span>
				<span className="flex items-center gap-1 text-[11px] text-muted-foreground">
					<kbd className="kbd">↵</kbd>
					打开
				</span>
				<span className="flex items-center gap-1 text-[11px] text-muted-foreground">
					<kbd className="kbd">Esc</kbd>
					关闭
				</span>
			</div>
			{resultCount > 0 && (
				<span className="text-[11px] text-muted-foreground tabular-nums">
					{resultCount} 个结果
				</span>
			)}
		</div>
	)
}

// ---- 主组件 ----

export interface CommandPaletteProps {
	open: boolean
	onClose: () => void
	sites: Site[]
}

export function CommandPalette({ open, onClose, sites }: CommandPaletteProps) {
	const dialogRef = useDialogLifecycle(open)
	const [query, setQuery] = useState('')
	const [selectedIndex, setSelectedIndex] = useState(0)
	const inputRef = useRef<HTMLInputElement>(null)
	const listRef = useRef<HTMLDivElement>(null)

	const results = useMemo(() => searchSites(sites, query), [sites, query])

	// 打开时重置状态并聚焦
	useEffect(() => {
		if (open) {
			setQuery('')
			setSelectedIndex(0)
			// 等 DOM 渲染后再 focus
			requestAnimationFrame(() => {
				inputRef.current?.focus()
			})
		}
	}, [open])

	// query 变化时重置选中
	// biome-ignore  lint/correctness/useExhaustiveDependencies: need
	useEffect(() => {
		setSelectedIndex(0)
	}, [query])

	// 打开当前选中站点
	const openSelected = useCallback(
		(index: number) => {
			const site = results[index]
			if (site) {
				window.open(site.url, '_blank', 'noopener,noreferrer')
				onClose()
			}
		},
		[results, onClose],
	)

	// 键盘事件
	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			switch (e.key) {
				case 'ArrowDown':
					e.preventDefault()
					setSelectedIndex((i) => Math.min(i + 1, results.length - 1))
					break
				case 'ArrowUp':
					e.preventDefault()
					setSelectedIndex((i) => Math.max(i - 1, 0))
					break
				case 'Enter':
					e.preventDefault()
					openSelected(selectedIndex)
					break
				case 'Escape':
					e.preventDefault()
					onClose()
					break
			}
		},
		[results.length, selectedIndex, openSelected, onClose],
	)

	if (!open) return null

	return (
		<dialog
			ref={dialogRef}
			aria-label="命令面板"
			className="dialog-panel max-w-xl animate-scale-up"
			onCancel={(event) => {
				event.preventDefault()
				onClose()
			}}
			onClick={(event) => {
				if (event.target === event.currentTarget) onClose()
				event.stopPropagation()
			}}
			onKeyDown={(e) => {
				e.stopPropagation()
			}}
			tabIndex={-1}
		>
			<div className="flex max-h-[calc(100dvh_-_2rem)] flex-col">
				{/* 搜索输入行 */}
				<div className="dialog-header flex shrink-0 items-center gap-2">
					<SearchIcon
						size={16}
						className="text-muted-foreground shrink-0 opacity-60"
					/>
					<Input
						ref={inputRef}
						role="combobox"
						aria-expanded="true"
						aria-haspopup="listbox"
						type="text"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="搜索站点..."
						autoComplete="off"
						autoCorrect="off"
						autoCapitalize="off"
						spellCheck={false}
						className="flex-1 min-w-0"
						rightIcon={
							query ? (
								<button
									type="button"
									onClick={() => {
										setQuery('')
										requestAnimationFrame(() => inputRef.current?.focus())
									}}
									className={buttonVariants({ variant: 'icon', size: 'sm' })}
									aria-label="清除搜索"
								>
									<XIcon size={14} />
								</button>
							) : null
						}
						aria-label="搜索站点"
						aria-autocomplete="list"
						aria-controls="cmd-results"
						aria-activedescendant={
							results[selectedIndex]
								? `cmd-item-${results[selectedIndex].source}-${results[selectedIndex].id}`
								: undefined
						}
					/>
					<button
						type="button"
						onClick={onClose}
						className={buttonVariants({ variant: 'icon', size: 'sm' })}
						aria-label="关闭命令面板"
					>
						<XIcon size={16} />
					</button>
				</div>

				{/* 分组标题 */}
				<div className="shrink-0 px-5 pt-3 pb-1">
					<span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
						{query.trim() ? `搜索结果` : '最近添加 / 置顶'}
					</span>
				</div>

				{/* 结果列表 */}
				<div
					ref={listRef}
					id="cmd-results"
					role="listbox"
					aria-label="站点搜索结果"
					className="min-h-0 flex-1 px-1.5 pb-1.5 max-h-80 overflow-y-auto overscroll-contain scrollbar-thin"
				>
					{results.length > 0 ? (
						results.map((site, index) => (
							<ResultItem
								key={`${site.source}:${site.id}`}
								site={site}
								query={query}
								selected={index === selectedIndex}
								onMouseEnter={() => setSelectedIndex(index)}
								onClick={() => openSelected(index)}
							/>
						))
					) : (
						<EmptyState query={query} />
					)}
				</div>

				{/* 页脚 */}
				<div className="dialog-footer shrink-0">
					<Footer resultCount={results.length} />
				</div>
			</div>
		</dialog>
	)
}
