import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buttonVariants } from '@/components/atoms/Button'
import {
	CommandIcon,
	ExternalLinkIcon,
	SearchIcon,
	XIcon,
} from '@/components/atoms/Icons'
import { Input } from '@/components/atoms/Input'
import { ResourceImage } from '@/components/atoms/ResourceImage'
import { getCategoryColor } from '@/data/categories'
import { useDialogBackdropClose } from '@/hooks/useDialogBackdropClose'
import { useDialogLifecycle } from '@/hooks/useDialogLifecycle'
import { useSiteIconUrl } from '@/hooks/useImageUrl'
import type { Site, SiteCategory } from '@/types'
import { searchCommandSites } from '@/utils/commandSearch'
import {
	clearRecentSites,
	readRecentSites,
	recordSiteOpen,
} from '@/utils/recentSites'
import type { Engine } from '../../../shared/catalog'

/* ============================================================
   CommandPalette
   - ⌘K / Ctrl+K 开关
   - 搜索站点、分类、标签与操作；>id 关键词执行站点操作
   - 键盘上下导航，Enter 执行选中项
   - Esc 关闭
   - 搜索关键词高亮
   ============================================================ */

// ---- 高亮工具 ----

function highlightMatch(text: string, query: string): React.ReactNode {
	if (!query.trim()) return text
	const regex = new RegExp(`(${escapeRegex(query.trim())})`, 'gi')
	const parts = text.split(regex)
	return parts.map((part, i) =>
		i % 2 === 1 ? (
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
	entry: CommandEntry
	query: string
	selected: boolean
	onMouseEnter: () => void
	onClick: () => void
}

function ResultItem({
	entry,
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
			id={`cmd-item-${encodeURIComponent(entry.id)}`}
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
			{entry.site ? (
				<SiteAvatar site={entry.site} />
			) : (
				<CommandIcon size={20} className="shrink-0 text-muted-foreground" />
			)}

			{/* 信息 */}
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-1.5 min-w-0">
					<span className="text-sm font-medium text-foreground truncate">
						{highlightMatch(entry.label, query)}
					</span>
					{entry.commandId && (
						<span className="shrink-0 font-mono text-[11px] text-muted-foreground">
							{highlightMatch(entry.commandId, query)}
						</span>
					)}
					{entry.site && <CategoryDot category={entry.site.category} />}
					<span
						className="max-w-24 truncate text-[11px] text-muted-foreground"
						title={entry.site?.category}
					>
						{entry.site?.category}
					</span>
				</div>
				<p className="text-[11px] text-muted-foreground truncate mt-0.5 leading-none">
					{highlightMatch(entry.detail, query)}
				</p>
			</div>

			{/* 外链提示 */}
			{selected && entry.site && !entry.commandId && (
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
				的结果
			</p>
		</div>
	)
}

// ---- 页脚提示 ----

function Footer({
	resultCount,
	visibleCount,
}: {
	resultCount: number
	visibleCount: number
}) {
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
					执行
				</span>
				<span className="flex items-center gap-1 text-[11px] text-muted-foreground">
					<kbd className="kbd">Esc</kbd>
					关闭
				</span>
			</div>
			{resultCount > 0 && (
				<span className="text-[11px] text-muted-foreground tabular-nums">
					已展示 {visibleCount} / 共 {resultCount} 条
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
	actions: CommandAction[]
	siteActions?: SiteCommandAction[]
	engines: Engine[]
	onCategorySelect: (category: string) => void
	onTagSelect: (tag: string) => void
}

export interface CommandAction {
	id: string
	label: string
	detail: string
	run: () => void
}

export interface SiteCommandAction extends Omit<CommandAction, 'run'> {
	isAvailable: (site: Site) => boolean
	run: (site: Site) => void
}

const NO_SITE_ACTIONS: SiteCommandAction[] = []
const RESULT_BATCH_SIZE = 30

interface CommandEntry extends CommandAction {
	group: string
	site?: Site
	commandId?: string
	keepOpen?: boolean
}

export function CommandPalette({
	open,
	onClose,
	sites,
	actions,
	siteActions = NO_SITE_ACTIONS,
	engines,
	onCategorySelect,
	onTagSelect,
}: CommandPaletteProps) {
	const dialogRef = useDialogLifecycle(open)
	const [query, setQuery] = useState('')
	const [selectedIndex, setSelectedIndex] = useState(0)
	const [visibleLimit, setVisibleLimit] = useState(RESULT_BATCH_SIZE)
	const inputRef = useRef<HTMLInputElement>(null)
	const listRef = useRef<HTMLDivElement>(null)
	const backdropHandlers = useDialogBackdropClose(onClose)
	const changeQuery = useCallback((value: string) => {
		setQuery(value)
		setSelectedIndex(0)
		setVisibleLimit(RESULT_BATCH_SIZE)
		if (listRef.current) listRef.current.scrollTop = 0
	}, [])

	const [recentUrls, setRecentUrls] = useState<string[]>([])
	const [historyError, setHistoryError] = useState('')
	const actionsOnly = query.trimStart().startsWith('>')
	const search = (actionsOnly ? query.trimStart().slice(1) : query).trim()
	const commandToken = search.split(/\s+/, 1)[0]
	const siteAction = actionsOnly
		? siteActions.find(
				(action) =>
					action.id === commandToken.toLowerCase() ||
					action.label === commandToken,
			)
		: undefined
	const siteQuery = siteAction ? search.slice(commandToken.length).trim() : ''
	const results = useMemo(() => {
		if (!open) return []
		if (siteAction) {
			const eligible = sites.filter(siteAction.isAvailable)
			const targets = siteQuery
				? searchCommandSites(eligible, siteQuery)
				: eligible
			return targets.map(
				(site): CommandEntry => ({
					id: `${siteAction.id}-${site.source}-${site.id}`,
					commandId: siteAction.id,
					label: site.name,
					detail: `${siteAction.label} · ${site.url}`,
					group: `${siteAction.label} · 选择站点`,
					site,
					run: () => siteAction.run(site),
				}),
			)
		}
		const entries: CommandEntry[] = []
		const matches = (text: string) =>
			text.toLowerCase().includes(search.toLowerCase())
		const addSites = (items: Site[], group: string) => {
			for (const site of items)
				entries.push({
					id: `${group}-${site.source}-${site.id}`,
					label: site.name,
					detail: site.description,
					group,
					site,
					run: () => {
						recordSiteOpen(site.url)
						window.open(site.url, '_blank', 'noopener,noreferrer')
					},
				})
		}
		if (!actionsOnly) {
			if (search) addSites(searchCommandSites(sites, search), '站点')
			else {
				const recent = recentUrls
					.flatMap((url) => sites.find((site) => site.url === url) ?? [])
					.slice(0, 8)
				addSites(recent, '最近打开')
				addSites(
					sites
						.filter((site) => site.pinned && !recent.includes(site))
						.slice(0, 8),
					'置顶站点',
				)
			}
		}
		for (const action of actions) {
			if (matches(`${action.id} ${action.label} ${action.detail}`))
				entries.push({
					...action,
					id: `action-${action.id}`,
					commandId: action.id,
					group: '常用操作',
				})
		}
		if (recentUrls.length && matches('clear-history 清空最近打开记录'))
			entries.push({
				id: 'clear-history',
				commandId: 'clear-history',
				label: '清空最近打开记录',
				detail: '仅清除本浏览器的打开记录',
				group: '常用操作',
				keepOpen: true,
				run: () => {
					try {
						clearRecentSites()
						setRecentUrls([])
						setHistoryError('')
					} catch {
						setHistoryError('清除失败，请检查浏览器存储权限后重试。')
					}
				},
			})
		for (const action of siteActions) {
			if (matches(`${action.id} ${action.label} ${action.detail}`))
				entries.push({
					id: `action-${action.id}`,
					commandId: action.id,
					label: action.label,
					detail: action.detail,
					group: '站点操作',
					keepOpen: true,
					run: () => {
						changeQuery(`>${action.id} `)
						inputRef.current?.focus()
					},
				})
		}
		if (search && !actionsOnly) {
			for (const category of [
				...new Set(sites.map((site) => site.category)),
			].filter(matches)) {
				entries.push({
					id: `category-${category}`,
					label: category,
					detail: '查看此分类的站点',
					group: '分类',
					run: () => onCategorySelect(category),
				})
			}
			for (const tag of [
				...new Set(sites.flatMap((site) => site.tags ?? [])),
			].filter(matches)) {
				entries.push({
					id: `tag-${tag}`,
					label: tag,
					detail: '按此标签筛选站点',
					group: '标签',
					run: () => onTagSelect(tag),
				})
			}
			for (const engine of engines.filter((engine) => engine.enabled))
				entries.push({
					id: `engine-${engine.id}`,
					label: `用 ${engine.name} 搜索`,
					detail: search,
					group: '搜索互联网',
					run: () => {
						window.open(
							engine.searchUrl.replace('{q}', encodeURIComponent(search)),
							'_blank',
							'noopener,noreferrer',
						)
					},
				})
		}
		// Keep the newly available operations visible even with many pinned sites.
		return !search && !actionsOnly
			? [
					...entries.filter((entry) => entry.group === '常用操作'),
					...entries.filter((entry) => entry.group !== '常用操作'),
				]
			: entries
	}, [
		open,
		changeQuery,
		sites,
		search,
		siteAction,
		siteQuery,
		siteActions,
		actionsOnly,
		recentUrls,
		actions,
		engines,
		onCategorySelect,
		onTagSelect,
	])
	const visibleResults = results.slice(0, visibleLimit)
	const activeIndex = Math.min(
		selectedIndex,
		Math.max(0, visibleResults.length - 1),
	)

	// 焦点由共享的原生弹窗生命周期管理。
	useEffect(() => {
		if (open) {
			setRecentUrls(readRecentSites())
			setHistoryError('')
			changeQuery('')
		}
	}, [open, changeQuery])

	// 统一执行站点、页面操作与面板内部操作。
	const openSelected = useCallback(
		(index: number) => {
			const entry = results[index]
			if (entry) {
				if (!entry.keepOpen) onClose()
				entry.run()
			}
		},
		[results, onClose],
	)

	// 键盘事件
	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			// Some IMEs report Enter with keyCode 229 after compositionend.
			if (e.nativeEvent.isComposing || e.keyCode === 229) return
			switch (e.key) {
				case 'ArrowDown': {
					e.preventDefault()
					const next = Math.min(
						activeIndex + 1,
						Math.max(0, results.length - 1),
					)
					if (next >= visibleLimit)
						setVisibleLimit((limit) =>
							Math.min(limit + RESULT_BATCH_SIZE, results.length),
						)
					setSelectedIndex(next)
					break
				}
				case 'ArrowUp':
					e.preventDefault()
					setSelectedIndex(Math.max(activeIndex - 1, 0))
					break
				case 'Enter':
					e.preventDefault()
					if (!e.repeat) openSelected(activeIndex)
					break
				case 'Escape':
					e.preventDefault()
					onClose()
					break
			}
		},
		[results.length, visibleLimit, activeIndex, openSelected, onClose],
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
			{...backdropHandlers}
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
						onChange={(e) => changeQuery(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder={
							actionsOnly
								? '输入操作 ID 或说明，如 theme / 切换主题'
								: '搜索站点或操作，输入 > 查看命令'
						}
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
										changeQuery('')
										inputRef.current?.focus()
									}}
									className={buttonVariants({ variant: 'icon', size: 'sm' })}
									aria-label="清除搜索"
								>
									<XIcon size={14} />
								</button>
							) : null
						}
						aria-label="搜索站点或操作"
						aria-autocomplete="list"
						aria-controls="cmd-results"
						aria-activedescendant={
							results[activeIndex]
								? `cmd-item-${encodeURIComponent(results[activeIndex].id)}`
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

				<div className="shrink-0 px-5 pt-3 pb-1">
					<span className="text-[11px] font-medium text-muted-foreground">
						{actionsOnly
							? '操作 · 输入英文 ID 或中文说明，Enter 执行'
							: search
								? '搜索结果'
								: '快速访问 · 输入 > 查看命令'}
					</span>
				</div>

				{/* 结果列表 */}
				<div
					ref={listRef}
					id="cmd-results"
					role="listbox"
					aria-label="命令搜索结果"
					onScroll={(event) => {
						const list = event.currentTarget
						if (
							visibleLimit < results.length &&
							list.clientHeight > 0 &&
							list.scrollHeight - list.scrollTop - list.clientHeight <= 48
						) {
							setVisibleLimit((limit) =>
								Math.min(limit + RESULT_BATCH_SIZE, results.length),
							)
						}
					}}
					className="min-h-0 flex-1 px-1.5 pb-1.5 max-h-80 overflow-y-auto overscroll-contain scrollbar-thin"
				>
					{results.length > 0 ? (
						visibleResults.map((entry, index) => (
							<div key={entry.id} role="presentation">
								{results[index - 1]?.group !== entry.group && (
									<div
										role="presentation"
										className="px-3 pt-3 pb-1 text-[11px] font-medium text-muted-foreground"
									>
										{entry.group}
									</div>
								)}
								<ResultItem
									entry={entry}
									query={siteAction ? siteQuery : search}
									selected={index === activeIndex}
									onMouseEnter={() => setSelectedIndex(index)}
									onClick={() => openSelected(index)}
								/>
							</div>
						))
					) : (
						<EmptyState query={query} />
					)}
				</div>

				{/* 页脚 */}
				<div className="dialog-footer shrink-0">
					{historyError && (
						<p role="alert" className="mb-2 text-xs text-error">
							{historyError}
						</p>
					)}
					<Footer
						resultCount={results.length}
						visibleCount={visibleResults.length}
					/>
				</div>
			</div>
		</dialog>
	)
}
