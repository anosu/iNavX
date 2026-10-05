import { useState } from 'react'
import { ResourceImage } from '@/components/atoms/ResourceImage'
import { NavCard } from '@/components/molecules/NavCard'
import { useImageUrl } from '@/hooks/useImageUrl'
import type { NavGridProps } from '@/types'
import type { Engine } from '../../../shared/catalog'

/* ============================================================
   NavGrid
   - Grid 布局（仅网格）
   - 置顶项始终排首位
   - 搜索时末尾追加搜索引擎卡片（最多 3 个）
   - 搜索时前 9 个卡片展示快捷键编号
   ============================================================ */

// ---- 图标 ----

function SearchEmptyIcon() {
	return (
		<svg
			width="32"
			height="32"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<circle cx="11" cy="11" r="8" />
			<path d="m21 21-4.35-4.35" />
			<path d="M11 8v6M8 11h6" />
		</svg>
	)
}

function EmptyBoxIcon() {
	return (
		<svg
			width="32"
			height="32"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
			<path d="m3.29 7 8.71 5 8.71-5" />
			<path d="M12 22V12" />
		</svg>
	)
}

function ExternalIcon() {
	return (
		<svg
			width="10"
			height="10"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
			<polyline points="15 3 21 3 21 9" />
			<line x1="10" y1="14" x2="21" y2="3" />
		</svg>
	)
}

// ---- 空状态 ----

interface EmptyStateProps {
	hasFilter: boolean
}

function EmptyState({ hasFilter }: EmptyStateProps) {
	return (
		<output
			aria-live="polite"
			className="col-span-full flex flex-col items-center justify-center py-20 px-4 text-center"
		>
			<div className="mb-4 text-muted-foreground opacity-40">
				{hasFilter ? <SearchEmptyIcon /> : <EmptyBoxIcon />}
			</div>
			<h3 className="text-sm font-semibold text-foreground mb-1">
				{hasFilter ? '没有找到匹配的站点' : '暂无站点'}
			</h3>
			<p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
				{hasFilter
					? '试试换个关键词，或者清除分类筛选'
					: '点击右上角「+ 添加」来添加你的第一个站点'}
			</p>
		</output>
	)
}

// ---- 骨架屏（shimmer 动画） ----

function SkeletonCard() {
	return (
		<div className="card p-3 flex flex-col gap-2.5" aria-hidden="true">
			<div className="flex items-center gap-2.5">
				<div className="h-8 w-8 shrink-0 rounded-lg animate-shimmer" />
				<div className="flex-1 space-y-1.5">
					<div className="h-3 w-2/3 rounded animate-shimmer" />
					<div className="h-2.5 w-1/3 rounded animate-shimmer delay-75" />
				</div>
			</div>
			<div className="space-y-1.5">
				<div className="h-2.5 w-full rounded animate-shimmer delay-100" />
				<div className="h-2.5 w-4/5 rounded animate-shimmer delay-150" />
			</div>
			<div className="mt-auto pt-0.5">
				<div className="h-4 w-14 rounded-full animate-shimmer delay-200" />
			</div>
		</div>
	)
}

// ---- 搜索引擎图标 ----

function EngineIcon({ engine }: { engine: Engine }) {
	const { name } = engine
	const iconUrl = useImageUrl(engine.iconUrl)
	const [imgOk, setImgOk] = useState(false)

	const fallback = (
		<span className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg bg-muted text-muted-foreground text-sm font-bold">
			{name[0]}
		</span>
	)

	if (!iconUrl) return fallback

	return (
		<div className="h-8 w-8 relative shrink-0">
			{!imgOk && (
				<span className="absolute inset-0 flex items-center justify-center rounded-lg bg-muted text-muted-foreground text-sm font-bold">
					{name[0]}
				</span>
			)}
			<ResourceImage
				key={iconUrl}
				src={iconUrl}
				alt=""
				width={32}
				height={32}
				className={[
					'w-full h-full rounded-lg object-contain',
					'transition-opacity duration-150',
					imgOk ? 'opacity-100' : 'opacity-0',
				].join(' ')}
				onLoad={() => setImgOk(true)}
				onError={() => setImgOk(false)}
				loading="eager"
				decoding="async"
			/>
		</div>
	)
}

// ---- 搜索引擎卡片 ----

interface EngineCardProps {
	engine: Engine
	query: string
	rank?: number
}

function EngineCard({ engine, query, rank }: EngineCardProps) {
	const searchUrl = engine.searchUrl.replace(
		'{q}',
		encodeURIComponent(query.trim()),
	)

	return (
		<a
			href={searchUrl}
			target="_blank"
			rel="noopener noreferrer"
			aria-label={`在 ${engine.name} 中搜索「${query.trim()}」`}
			className="
				card-interactive group relative flex flex-col gap-2 p-3
				no-underline text-foreground no-tap-highlight
				focus-visible:outline-none focus-visible:ring-2
				focus-visible:ring-primary focus-visible:ring-offset-2
			"
		>
			{/* 图标 + 名称行 */}
			<div className="flex items-center gap-2.5">
				<EngineIcon engine={engine} />
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-1.5 min-w-0">
						<span className="truncate text-sm font-medium text-foreground group-hover:text-primary transition-colors duration-100 leading-snug">
							{engine.name}
						</span>
						<span className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-50 transition-opacity duration-100">
							<ExternalIcon />
						</span>
					</div>
				</div>
			</div>

			{/* 搜索词预览 */}
			<p className="line-clamp-2 text-xs text-muted-foreground leading-relaxed">
				搜索 &ldquo;
				<span className="text-foreground font-medium">{query.trim()}</span>
				&rdquo;
			</p>

			{/* 底部标记 */}
			<div className="mt-auto flex items-center justify-between pt-0.5">
				<span
					className="inline-flex items-center gap-1 rounded-full text-[11px] font-medium leading-none px-2 py-1"
					style={{
						backgroundColor:
							'color-mix(in srgb, var(--color-primary) 10%, transparent)',
						color: 'var(--color-primary)',
					}}
				>
					<svg
						width="9"
						height="9"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.5"
						strokeLinecap="round"
						strokeLinejoin="round"
						aria-hidden="true"
					>
						<circle cx="11" cy="11" r="8" />
						<path d="m21 21-4.35-4.35" />
					</svg>
					网络搜索
				</span>
				{rank !== undefined && (
					<span
						className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded text-[10px] font-semibold tabular-nums leading-none bg-muted text-muted-foreground border border-border select-none"
						title={`Ctrl+${rank} 打开`}
					>
						{rank}
					</span>
				)}
			</div>
		</a>
	)
}

// ---- 分隔标题（仅在有搜索引擎卡片时显示） ----

interface EngineSectionDividerProps {
	settingsSlot?: React.ReactNode
}

function EngineSectionDivider({ settingsSlot }: EngineSectionDividerProps) {
	return (
		<div className="col-span-full flex items-center gap-3 py-1">
			<div className="flex-1 h-px bg-border" />
			<span className="text-[11px] text-muted-foreground font-medium shrink-0 select-none">
				在网络中搜索
			</span>
			<div className="flex-1 h-px bg-border" />
			{settingsSlot && <div className="shrink-0">{settingsSlot}</div>}
		</div>
	)
}

// ---- 主组件 ----

export function NavGrid({
	sites,
	searchQuery = '',
	enabledEngines = [],
	engineSettings,
	isStale = false,
	isLoading = false,
	hasFilter = false,
	onEdit,
	onDelete,
	onTogglePin,
}: NavGridProps & {
	enabledEngines?: Engine[]
	engineSettings?: React.ReactNode
	isStale?: boolean
	isLoading?: boolean
	hasFilter?: boolean
}) {
	const trimmedQuery = searchQuery.trim()
	// 仅在有搜索词时展示引擎卡片（分类筛选时不展示）
	const showEngineCards = trimmedQuery.length > 0
	const engineCards = showEngineCards ? enabledEngines : []

	// 总快捷键条目数 = 站点数 + 引擎数，前 9 个可用 Ctrl+N
	const siteRankCount = Math.min(sites.length, 9)

	// ---- 加载态 ----
	if (isLoading) {
		return (
			<div
				className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
				aria-busy="true"
			>
				{Array.from({ length: 8 }).map((_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
					<SkeletonCard key={i} />
				))}
			</div>
		)
	}

	// ---- 空状态（无匹配站点时，仍可能有引擎卡片） ----
	if (sites.length === 0 && engineCards.length === 0) {
		return (
			<div className="grid grid-cols-1">
				<EmptyState hasFilter={hasFilter} />
			</div>
		)
	}

	// ---- 网格模式 ----
	return (
		<div
			className={[
				'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3',
				'transition-opacity duration-200',
				isStale ? 'opacity-60' : 'opacity-100',
			].join(' ')}
		>
			{/* 站点卡片，搜索时前 9 个附加快捷键编号 */}
			{sites.map((site, i) => (
				<NavCard
					key={`${site.source}:${site.id}`}
					site={site}
					searchQuery={searchQuery}
					rank={trimmedQuery && i < 9 ? i + 1 : undefined}
					onEdit={onEdit}
					onDelete={onDelete}
					onTogglePin={onTogglePin}
				/>
			))}

			{/* 搜索引擎卡片区域 */}
			{engineCards.length > 0 && (
				<>
					{/* 无站点结果时显示空状态提示 + 引擎区分隔 */}
					{sites.length === 0 && <EmptyState hasFilter={hasFilter} />}
					<EngineSectionDivider settingsSlot={engineSettings} />
					{engineCards.map((engine, i) => {
						// rank 紧接站点编号之后，总数不超过 9
						const engineRank = siteRankCount + i + 1
						return (
							<EngineCard
								key={engine.id}
								engine={engine}
								query={trimmedQuery}
								rank={engineRank <= 9 ? engineRank : undefined}
							/>
						)
					})}
				</>
			)}
		</div>
	)
}
