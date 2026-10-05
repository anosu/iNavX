import {
	lazy,
	Suspense,
	useCallback,
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react'
import { NavLink } from 'react-router'
import { Button } from '@/components/atoms/Button'
import { Dialog } from '@/components/atoms/Dialog'
import { BookmarkIO } from '@/components/molecules/BookmarkIO'
import { CategoryFilter } from '@/components/molecules/CategoryFilter'
import { EngineSettings } from '@/components/molecules/EngineSettings'
import { Header } from '@/components/organisms/Header'
import { NavGrid } from '@/components/organisms/NavGrid'

// Lazy-load heavy overlay components — they are never needed on initial paint
const CommandPalette = lazy(() =>
	import('@/components/organisms/CommandPalette').then((m) => ({
		default: m.CommandPalette,
	})),
)
const SiteFormModal = lazy(() =>
	import('@/components/organisms/SiteFormModal').then((m) => ({
		default: m.SiteFormModal,
	})),
)

import { useBookmarks } from '@/hooks/useBookmarks'
import { useEngineOrder } from '@/hooks/useEngineOrder'
import {
	useCatalogAvailability,
	usePublicCatalog,
} from '@/hooks/usePublicCatalog'
import { type SitePayload, useSiteManager } from '@/hooks/useSiteManager'
import type { Site, SiteCategory } from '@/types'
import { mergeSites } from '@/utils/mergeSites'
import { exportPersonalData } from '@/utils/personalData'

/* ============================================================
   filterSites
   对 name / description / tags / url 做多字段模糊匹配
   ============================================================ */
function filterSites(
	sites: Site[],
	query: string,
	category: SiteCategory | null,
): Site[] {
	let result = sites
	if (category) {
		result = result.filter((s) => s.category === category)
	}
	const q = query.trim().toLowerCase()
	if (!q) return result
	return result.filter(
		(s) =>
			s.name.toLowerCase().includes(q) ||
			s.description.toLowerCase().includes(q) ||
			s.url.toLowerCase().includes(q) ||
			s.tags?.some((t) => t.toLowerCase().includes(q)),
	)
}

/* ============================================================
   Toast 通知（轻量内部实现）
   ============================================================ */
interface ToastItem {
	id: string
	message: string
	type: 'success' | 'error' | 'info'
}

function useToast() {
	const [toasts, setToasts] = useState<ToastItem[]>([])
	const show = useCallback(
		(message: string, type: ToastItem['type'] = 'success') => {
			const id = Math.random().toString(36).slice(2)
			setToasts((prev) => [...prev, { id, message, type }])
			setTimeout(
				() => setToasts((prev) => prev.filter((t) => t.id !== id)),
				3000,
			)
		},
		[],
	)
	return { toasts, show }
}

/* ============================================================
   ToastContainer
   ============================================================ */
function ToastContainer({ toasts }: { toasts: ToastItem[] }) {
	if (toasts.length === 0) return null
	return (
		<div
			aria-live="polite"
			aria-atomic="false"
			className="fixed bottom-4 left-1/2 -translate-x-1/2 z-400 w-[calc(100%_-_2rem)] max-w-lg flex flex-col gap-2 items-center pointer-events-none"
		>
			{toasts.map((t) => (
				<div
					key={t.id}
					className={[
						'w-full border bg-surface px-4 py-3 rounded-md break-words',
						'text-sm shadow-lg animate-in',
						t.type === 'success'
							? 'border-success/30 text-success'
							: t.type === 'error'
								? 'border-error/30 text-error'
								: 'border-border text-foreground',
					].join(' ')}
				>
					{t.message}
				</div>
			))}
		</div>
	)
}

/* ============================================================
   DeleteConfirm 对话框
   ============================================================ */
interface DeleteConfirmProps {
	site: Site
	onConfirm: () => void
	onCancel: () => void
}

function DeleteConfirm({ site, onConfirm, onCancel }: DeleteConfirmProps) {
	const isBuiltin = site.source === 'builtin'

	return (
		<Dialog
			role="alertdialog"
			size="sm"
			title={isBuiltin ? '本地隐藏站点' : '删除站点'}
			description={
				isBuiltin
					? `确定要在本地隐藏「${site.name}」吗？可通过恢复隐藏站点重新显示。`
					: `确定要删除「${site.name}」吗？此操作不可撤销。`
			}
			onClose={onCancel}
			footer={
				<div className="flex flex-wrap justify-end gap-2">
					<Button variant="secondary" onClick={onCancel}>
						取消
					</Button>
					<Button variant="danger" onClick={onConfirm}>
						{isBuiltin ? '确认隐藏' : '确认删除'}
					</Button>
				</div>
			}
		/>
	)
}

/* ============================================================
   Home 页面主组件
   ============================================================ */
export default function Home() {
	const publicCatalog = usePublicCatalog()
	const unavailable = useCatalogAvailability()
	const {
		bookmarkExport: ALLOW_BOOKMARK_EXPORT,
		bookmarkImport: ALLOW_BOOKMARK_IMPORT,
		customSites: ALLOW_CUSTOM_SITES,
		hideBuiltin: ALLOW_HIDE_BUILTIN,
		clearImported: ALLOW_CLEAR_IMPORTED,
	} = publicCatalog.settings.features
	const builtinSites = useMemo<Site[]>(
		() =>
			publicCatalog.sites.map((site) => ({
				...site,
				category:
					publicCatalog.categories.find(
						(category) => category.id === site.categoryId,
					)?.name || '其他',
				source: 'builtin',
				addedAt: site.createdAt,
			})),
		[publicCatalog],
	)
	// ---- 搜索 & 分类状态 ----
	const [query, setQuery] = useState('')
	const [activeCategory, setActiveCategory] = useState<SiteCategory | null>(
		null,
	)
	const deferredQuery = useDeferredValue(query)
	const searchInputRef = useRef<HTMLInputElement>(null)

	// ---- 搜索引擎顺序 & 启用状态 ----
	const engineOrder = useEngineOrder()

	// ---- 命令面板 ----
	const [cmdOpen, setCmdOpen] = useState(false)

	// ---- 站点管理（自定义站点 + 内置隐藏） ----
	const {
		customSites,
		addSite,
		updateSite,
		removeSite,
		togglePin,
		isUrlDuplicate,
		hiddenBuiltinIds,
		hideBuiltin,
		restoreAllBuiltin,
	} = useSiteManager()

	// ---- 书签导入/导出 ----
	const {
		importedSites,
		importFromHtml,
		importFromJson,
		updateImported,
		removeImported,
		clearImported,
		exportToJson,
		exportToHtml,
	} = useBookmarks()

	// ---- Toast 通知 ----
	const { toasts, show: showToast } = useToast()

	// ---- 站点表单（添加/编辑） ----
	const [formOpen, setFormOpen] = useState(false)
	const [editingSite, setEditingSite] = useState<Site | undefined>(undefined)

	// ---- 删除确认 ----
	const [deletingSite, setDeletingSite] = useState<Site | undefined>(undefined)
	const overlayOpenRef = useRef(false)
	overlayOpenRef.current = cmdOpen || formOpen || Boolean(deletingSite)

	// ---- 个人同 URL 优先，过滤本地隐藏后统一置顶排序 ----
	const allSites = useMemo<Site[]>(
		() =>
			mergeSites(builtinSites, customSites, importedSites, hiddenBuiltinIds),
		[builtinSites, customSites, importedSites, hiddenBuiltinIds],
	)

	// ---- 「所有可见站点」用于导出（内置未隐藏 + 自定义 + 导入） ----
	const visibleSitesForExport = useMemo<Site[]>(() => {
		return allSites // allSites 已经过滤了隐藏的内置站点
	}, [allSites])

	// ---- 分类列表 ----
	const categories = useMemo<SiteCategory[]>(() => {
		const set = new Set(allSites.map((s) => s.category))
		return [
			...publicCatalog.categories
				.map((category) => category.name)
				.filter((name) => set.has(name)),
			...Array.from(set).filter(
				(name) =>
					!publicCatalog.categories.some((category) => category.name === name),
			),
		]
	}, [allSites, publicCatalog.categories])
	const formCategories = useMemo(
		() => [
			...new Set([
				...publicCatalog.categories.map((category) => category.name),
				...categories,
			]),
		],
		[publicCatalog.categories, categories],
	)

	// ---- 过滤 ----
	const filteredSites = useMemo(
		() => filterSites(allSites, deferredQuery, activeCategory),
		[allSites, deferredQuery, activeCategory],
	)

	const isStale = query !== deferredQuery
	const hasFilter = query.trim() !== '' || activeCategory !== null

	// ---- 事件处理 ----
	const handleSearchChange = useCallback((value: string) => {
		setQuery(value)
	}, [])

	const handleCategoryChange = useCallback((cat: SiteCategory | null) => {
		setActiveCategory(cat)
	}, [])

	// filteredSites ref：供键盘快捷键读取最新值，避免 closure 陈旧引用
	const filteredSitesRef = useRef<typeof filteredSites>([])
	filteredSitesRef.current = filteredSites

	// query ref：供 keydown handler 读取，避免 stale closure
	const queryRef = useRef(query)
	queryRef.current = query

	// enabledEngines ref：供键盘快捷键读取最新值
	const enabledEnginesRef = useRef(engineOrder.enabledEngines)
	enabledEnginesRef.current = engineOrder.enabledEngines

	/**
	 * 构建统一的「可打开条目」列表，顺序与网格渲染一致：
	 *   1. 过滤后的站点
	 *   2. 已启用的搜索引擎卡片（rank 紧接站点之后）
	 * 只有在有搜索词时才追加引擎卡片。
	 */
	const buildOpenableList = (
		q: string,
	): Array<{ url: string; label: string }> => {
		const sites = filteredSitesRef.current
		const trimmed = q.trim()

		const result: Array<{ url: string; label: string }> = sites.map((s) => ({
			url: s.url,
			label: s.name,
		}))

		if (trimmed) {
			for (const engine of enabledEnginesRef.current) {
				result.push({
					url: engine.searchUrl.replace('{q}', encodeURIComponent(trimmed)),
					label: engine.name,
				})
			}
		}

		return result
	}

	// 任意可打印字符聚焦搜索框 + Enter 打开第一结果 + Ctrl/⌘+1-9 快速打开
	// biome-ignore lint/correctness/useExhaustiveDependencies: none
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (overlayOpenRef.current) return
			const focused = e.target as HTMLElement
			if (
				focused !== searchInputRef.current &&
				(focused.tagName === 'INPUT' ||
					focused.tagName === 'TEXTAREA' ||
					focused.tagName === 'SELECT' ||
					focused.isContentEditable)
			)
				return
			// ⌘K / Ctrl+K 打开命令面板
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault()
				setCmdOpen(true)
				return
			}

			// Ctrl/⌘+1~9：打开第 N 个条目（站点 + 引擎卡片统一编号）
			if ((e.ctrlKey || e.metaKey) && /^[1-9]$/.test(e.key)) {
				const q = queryRef.current
				if (!q.trim()) return
				const idx = Number(e.key) - 1
				const list = buildOpenableList(q)
				const item = list[idx]
				if (item) {
					e.preventDefault()
					window.open(item.url, '_blank', 'noopener,noreferrer')
				}
				return
			}

			// Enter 在搜索框内：打开第一个条目
			if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.altKey) {
				const target = e.target as HTMLElement
				if (target === searchInputRef.current) {
					const q = queryRef.current
					if (!q.trim()) return
					e.preventDefault()
					const list = buildOpenableList(q)
					if (list.length > 0) {
						window.open(list[0].url, '_blank', 'noopener,noreferrer')
					}
				}
				return
			}

			if (e.metaKey || e.ctrlKey || e.altKey) return
			if (e.key.length !== 1) return

			const target = e.target as HTMLElement
			const isTyping =
				target.tagName === 'INPUT' ||
				target.tagName === 'TEXTAREA' ||
				target.isContentEditable
			if (isTyping) return

			searchInputRef.current?.focus()
		}
		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [])

	// ---- 站点表单提交 ----
	const handleFormSubmit = useCallback(
		(payload: SitePayload, editId?: string) => {
			if (editId) {
				if (editingSite?.source === 'imported') updateImported(editId, payload)
				else updateSite(editId, payload)
				showToast(`「${payload.name}」已更新`, 'success')
			} else {
				addSite(payload)
				showToast(`「${payload.name}」已添加`, 'success')
			}
		},
		[addSite, updateSite, updateImported, editingSite, showToast],
	)

	// ---- 编辑回调 ----
	const handleEdit = useCallback((site: Site) => {
		setEditingSite(site)
		setFormOpen(true)
	}, [])

	// ---- 删除回调（统一入口：自定义/导入 → 真删除，内置 → 本地隐藏） ----
	const handleDelete = useCallback((site: Site) => {
		setDeletingSite(site)
	}, [])

	const confirmDelete = useCallback(() => {
		if (!deletingSite) return

		if (deletingSite.source === 'builtin') {
			// 内置站点：本地隐藏
			hideBuiltin(deletingSite.id)
			showToast(`「${deletingSite.name}」已在本地隐藏`, 'success')
		} else if (deletingSite.source === 'imported') {
			// 导入站点：从导入列表中删除
			removeImported(deletingSite.id)
			showToast(`「${deletingSite.name}」已删除`, 'success')
		} else {
			// 自定义站点：真删除
			removeSite(deletingSite.id)
			showToast(`「${deletingSite.name}」已删除`, 'success')
		}

		setDeletingSite(undefined)
	}, [deletingSite, hideBuiltin, removeImported, removeSite, showToast])

	// ---- 置顶回调（仅 custom 站点支持，builtin 不支持 pin） ----
	const handleTogglePin = useCallback(
		(site: Site) => {
			if (site.source !== 'custom') return
			togglePin(site.id)
			showToast(
				site.pinned ? '已取消置顶' : `「${site.name}」已置顶`,
				'success',
			)
		},
		[togglePin, showToast],
	)

	return (
		<div className="min-h-screen flex flex-col bg-background">
			{/* ---- Header ---- */}
			<Header
				searchValue={query}
				onSearchChange={handleSearchChange}
				searchInputRef={searchInputRef}
				siteCount={allSites.length}
				onOpenCommandPalette={() => setCmdOpen(true)}
				onAddSite={
					ALLOW_CUSTOM_SITES
						? () => {
								setEditingSite(undefined)
								setFormOpen(true)
							}
						: undefined
				}
				onReset={() => {
					setQuery('')
					setActiveCategory(null)
					requestAnimationFrame(() => searchInputRef.current?.blur())
				}}
			/>

			{/* ---- 主内容 ---- */}
			<main
				aria-label="导航站主页"
				className="flex-1 page-enter mx-auto w-full max-w-7xl px-4 sm:px-6 py-3 space-y-3"
			>
				{/* 视觉隐藏的页面级标题，供屏幕阅读器识别（标题层级从 h1 开始） */}
				<h1 className="sr-only">{publicCatalog.settings.name}</h1>
				{unavailable && (
					<output className="text-xs text-muted-foreground">
						公共目录暂时不可用，正在显示最近的可用内容。
					</output>
				)}
				{/* 工具栏：分类筛选 + 书签导入导出 */}
				<div className="flex flex-col sm:flex-row sm:items-center gap-2">
					<div className="flex-1 min-w-0 overflow-x-auto scrollbar-hide">
						<CategoryFilter
							categories={categories}
							activeCategory={activeCategory}
							onChange={handleCategoryChange}
						/>
					</div>
					{/* 仅当导入或导出功能至少一项开启时才渲染 BookmarkIO */}
					{(ALLOW_BOOKMARK_IMPORT || ALLOW_BOOKMARK_EXPORT) && (
						<div className="shrink-0 flex items-center">
							<BookmarkIO
								visibleSites={visibleSitesForExport}
								importedCount={importedSites.length}
								bookmarks={{
									importFromHtml: ALLOW_BOOKMARK_IMPORT
										? importFromHtml
										: undefined,
									importFromJson: ALLOW_BOOKMARK_IMPORT
										? importFromJson
										: undefined,
									exportPersonal: ALLOW_BOOKMARK_EXPORT
										? exportPersonalData
										: undefined,
									clearImported: ALLOW_CLEAR_IMPORTED
										? clearImported
										: undefined,
									exportToJson: ALLOW_BOOKMARK_EXPORT
										? exportToJson
										: undefined,
									exportToHtml: ALLOW_BOOKMARK_EXPORT
										? exportToHtml
										: undefined,
								}}
								hiddenBuiltinCount={hiddenBuiltinIds.size}
								onRestoreBuiltin={
									ALLOW_HIDE_BUILTIN && hiddenBuiltinIds.size > 0
										? restoreAllBuiltin
										: undefined
								}
								onShowToast={showToast}
							/>
						</div>
					)}
				</div>

				{/* 搜索结果信息 */}
				{hasFilter && (
					<div
						aria-live="polite"
						aria-atomic="true"
						className="text-xs text-muted-foreground"
					>
						{filteredSites.length > 0 ? (
							<>
								找到{' '}
								<strong className="text-foreground font-medium">
									{filteredSites.length}
								</strong>{' '}
								个结果
								{query.trim() && (
									<>
										，关键词：
										<strong className="text-foreground font-medium">
											&ldquo;{query.trim()}&rdquo;
										</strong>
									</>
								)}
								{activeCategory && (
									<>
										，分类：
										<strong className="text-foreground font-medium">
											{activeCategory}
										</strong>
									</>
								)}
							</>
						) : (
							<span>没有找到匹配的站点</span>
						)}
					</div>
				)}

				{/* 导航卡片网格 */}
				<section aria-label="导航站点">
					<NavGrid
						sites={filteredSites}
						searchQuery={deferredQuery}
						enabledEngines={engineOrder.enabledEngines}
						engineSettings={<EngineSettings engineOrder={engineOrder} />}
						isStale={isStale}
						hasFilter={hasFilter}
						onEdit={ALLOW_CUSTOM_SITES ? handleEdit : undefined}
						onDelete={
							ALLOW_CUSTOM_SITES || ALLOW_HIDE_BUILTIN
								? handleDelete
								: undefined
						}
						onTogglePin={ALLOW_CUSTOM_SITES ? handleTogglePin : undefined}
					/>
				</section>
			</main>

			{/* ---- Footer ---- */}
			<footer className="border-t border-border mt-auto">
				<div className="mx-auto max-w-7xl px-4 sm:px-6 min-h-12 py-3 flex flex-wrap gap-3 items-center justify-between">
					<span className="text-xs text-muted-foreground">
						{allSites.length} 个站点
						{customSites.length > 0 && (
							<span className="ml-1 text-muted-foreground/60">
								（{customSites.length} 自定义）
							</span>
						)}
						{importedSites.length > 0 && (
							<span className="ml-1 text-muted-foreground/60">
								（{importedSites.length} 导入）
							</span>
						)}
						{hiddenBuiltinIds.size > 0 && (
							<span className="ml-1 text-muted-foreground/60">
								（{hiddenBuiltinIds.size} 已隐藏）
							</span>
						)}
						{' · '}
						{categories.length} 个分类
					</span>
					<nav aria-label="页脚导航" className="flex items-center gap-4">
						{import.meta.env.VITE_STATIC_MODE !== 'true' &&
							publicCatalog.settings.applicationsEnabled && (
								<NavLink
									to="/submit"
									className="text-xs text-primary no-underline hover:underline"
								>
									申请收录
								</NavLink>
							)}
						{(window.__INAV_BACKEND__ || import.meta.env.DEV) && (
							<NavLink
								to="/admin"
								className="text-xs text-muted-foreground no-underline hover:text-foreground"
							>
								管理
							</NavLink>
						)}
						<NavLink
							to="/"
							end
							className={({ isActive }) =>
								[
									'text-xs no-underline transition-colors duration-100',
									isActive
										? 'text-foreground font-medium'
										: 'text-muted-foreground hover:text-foreground',
								].join(' ')
							}
						>
							首页
						</NavLink>
						<NavLink
							to="/about"
							className={({ isActive }) =>
								[
									'text-xs no-underline transition-colors duration-100',
									isActive
										? 'text-foreground font-medium'
										: 'text-muted-foreground hover:text-foreground',
								].join(' ')
							}
						>
							使用说明
						</NavLink>
					</nav>
				</div>
			</footer>

			{/* ---- 命令面板（懒加载，仅在打开时挂载） ---- */}
			<Suspense fallback={null}>
				<CommandPalette
					open={cmdOpen}
					onClose={() => setCmdOpen(false)}
					sites={allSites}
				/>
			</Suspense>

			{/* ---- 添加 / 编辑站点表单（懒加载，仅在 ALLOW_CUSTOM_SITES 时挂载） ---- */}
			{ALLOW_CUSTOM_SITES && (
				<Suspense fallback={null}>
					<SiteFormModal
						categories={formCategories}
						open={formOpen}
						editSite={editingSite}
						onClose={() => {
							setFormOpen(false)
							setEditingSite(undefined)
						}}
						onSubmit={handleFormSubmit}
						isUrlDuplicate={isUrlDuplicate}
						onDelete={
							editingSite?.source === 'custom' ||
							editingSite?.source === 'imported'
								? handleDelete
								: undefined
						}
					/>
				</Suspense>
			)}

			{/* ---- 删除确认对话框 ---- */}
			{deletingSite && (
				<DeleteConfirm
					site={deletingSite}
					onConfirm={confirmDelete}
					onCancel={() => setDeletingSite(undefined)}
				/>
			)}

			{/* ---- Toast 通知 ---- */}
			<ToastContainer toasts={toasts} />
		</div>
	)
}
