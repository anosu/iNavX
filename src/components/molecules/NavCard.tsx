import { useCallback, useRef, useState } from 'react'
import { Badge } from '@/components/atoms/Badge'
import {
	CheckIcon,
	CopyIcon,
	EditIcon,
	ExternalLinkIcon,
	PinIcon,
	PinOffIcon,
	TrashIcon,
} from '@/components/atoms/Icons'
import { ResourceImage } from '@/components/atoms/ResourceImage'
import {
	buildSiteActions,
	ContextMenu,
	useContextMenu,
} from '@/components/molecules/ContextMenu'
import { SiteTags } from '@/components/molecules/SiteTags'
import { useCopyLink } from '@/hooks/useCopyLink'
import { useSiteIconUrl } from '@/hooks/useImageUrl'
import { useIsIOS } from '@/hooks/useIsIOS'
import { usePublicCatalog } from '@/hooks/usePublicCatalog'
import type { SiteCardProps } from '@/types'

function hashString(str: string): number {
	let hash = 0
	for (let i = 0; i < str.length; i++) {
		hash = (hash * 31 + str.charCodeAt(i)) | 0
	}
	return Math.abs(hash)
}

const AVATAR_COLORS = [
	{ bg: 'bg-blue-500/15', text: 'text-blue-600 dark:text-blue-400' },
	{ bg: 'bg-purple-500/15', text: 'text-purple-600 dark:text-purple-400' },
	{ bg: 'bg-green-500/15', text: 'text-green-600 dark:text-green-400' },
	{ bg: 'bg-orange-500/15', text: 'text-orange-600 dark:text-orange-400' },
	{ bg: 'bg-pink-500/15', text: 'text-pink-600 dark:text-pink-400' },
	{ bg: 'bg-teal-500/15', text: 'text-teal-600 dark:text-teal-400' },
	{ bg: 'bg-red-500/15', text: 'text-red-600 dark:text-red-400' },
	{ bg: 'bg-indigo-500/15', text: 'text-indigo-600 dark:text-indigo-400' },
]

function getAvatarStyle(name: string) {
	return (
		AVATAR_COLORS[hashString(name) % AVATAR_COLORS.length] ?? AVATAR_COLORS[0]
	)
}

function highlightText(text: string, query: string): React.ReactNode {
	if (!query.trim()) return text
	try {
		const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
		const regex = new RegExp(`(${escaped})`, 'gi')
		const parts = text.split(regex)
		return parts.map((part, i) =>
			regex.test(part) ? (
				// biome-ignore lint/suspicious/noArrayIndexKey: highlight split
				<mark key={i} className="search-highlight not-italic font-medium">
					{part}
				</mark>
			) : (
				// biome-ignore lint/suspicious/noArrayIndexKey: highlight split
				<span key={i}>{part}</span>
			),
		)
	} catch {
		return text
	}
}

interface SiteIconProps {
	name: string
	iconUrl?: string
	siteUrl: string
	size?: 'sm' | 'md'
}

function SiteIcon({
	name,
	iconUrl: customIconUrl,
	siteUrl,
	size = 'md',
}: SiteIconProps) {
	const iconUrl = useSiteIconUrl(customIconUrl, siteUrl)
	const [loadedIconUrl, setLoadedIconUrl] = useState<string | null>(null)
	const imgOk = loadedIconUrl === iconUrl

	const initial = [...name][0]?.toUpperCase() ?? '?'
	const style = getAvatarStyle(name)
	const dim = size === 'md' ? 'h-8 w-8' : 'h-6 w-6'
	const textSize = size === 'md' ? 'text-sm' : 'text-xs'
	const px = size === 'md' ? 32 : 24

	const avatar = (
		<div
			className={[
				'flex items-center justify-center shrink-0 rounded-lg select-none',
				dim,
				style.bg,
				style.text,
				textSize,
				'font-semibold',
			].join(' ')}
			aria-hidden="true"
		>
			{initial}
		</div>
	)

	if (!iconUrl) return avatar

	return (
		<div className={`${dim} relative shrink-0`}>
			{!imgOk && (
				<div
					className={[
						'absolute inset-0 flex items-center justify-center rounded-lg select-none',
						style.bg,
						style.text,
						textSize,
						'font-semibold',
					].join(' ')}
					aria-hidden="true"
				>
					{initial}
				</div>
			)}
			<ResourceImage
				key={iconUrl}
				src={iconUrl}
				alt=""
				width={px}
				height={px}
				className={[
					'w-full h-full rounded-lg object-contain',
					'transition-opacity duration-150',
					imgOk ? 'opacity-100' : 'opacity-0',
				].join(' ')}
				onLoad={() => setLoadedIconUrl(iconUrl)}
				onError={() => setLoadedIconUrl(null)}
				loading="eager"
				decoding="async"
			/>
		</div>
	)
}

// 绿色小草芽 SVG，custom 与 imported 共用
function SproutIcon() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
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
			<path d="M12 22V12" />
			<path d="M12 12C12 12 7 10 5 6c3 0 6 2 7 6z" />
			<path d="M12 12C12 12 17 10 19 6c-3 0-6 2-7 6z" />
		</svg>
	)
}

function SourceBadge({ source }: { source?: string }) {
	if (source === 'imported') {
		return (
			<span
				className="inline-flex items-center gap-0.5 text-[10px] leading-none"
				style={{ color: '#22c55e' }}
				title="书签导入"
			>
				<SproutIcon />
			</span>
		)
	}
	if (source === 'custom') {
		return (
			<span
				className="inline-flex items-center gap-0.5 text-[10px] leading-none"
				style={{ color: '#22c55e' }}
				title="自定义站点"
			>
				<SproutIcon />
			</span>
		)
	}
	return null
}

interface QuickActionProps {
	icon: React.ReactNode
	label: string
	onClick: (e: React.MouseEvent) => void
	destructive?: boolean
}

function QuickAction({ icon, label, onClick, destructive }: QuickActionProps) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			onClick={onClick}
			className={[
				'flex items-center justify-center',
				'h-6 w-6 rounded-md',
				'transition-colors duration-100',
				'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary',
				destructive
					? 'text-muted-foreground hover:text-error hover:bg-error/10'
					: 'text-muted-foreground hover:text-foreground hover:bg-muted',
			].join(' ')}
		>
			{icon}
		</button>
	)
}

export function NavCard({
	site,
	className = '',
	searchQuery = '',
	rank,
	onEdit,
	onDelete,
	onTogglePin,
	activeTag,
	onTagSelect,
}: SiteCardProps) {
	const { features } = usePublicCatalog().settings
	const ALLOW_HIDE_BUILTIN = features.hideBuiltin
	const { name, url, description, iconUrl, category, pinned, source } = site

	const { copied, copyFailed, copyLink } = useCopyLink(url)
	const tags = [...new Set(site.tags ?? [])]

	const isIOS = useIsIOS()

	const {
		menuState,
		onContextMenu,
		onTouchStart,
		onTouchEnd,
		onTouchMove,
		closeMenu,
		openAt,
	} = useContextMenu()

	// iOS three-dot button ref — used to compute menu anchor position on open
	const dotsBtnRef = useRef<HTMLButtonElement>(null)
	// Track whether the touch moved (scroll) so we don't open on scroll-end
	const dotsTouchMoved = useRef(false)

	const openIOSMenu = useCallback(() => {
		const btn = dotsBtnRef.current
		if (!btn) return
		const rect = btn.getBoundingClientRect()
		// right-align menu below the button; ContextMenu will flip up if needed
		openAt(rect.right, rect.bottom + 4)
	}, [openAt])

	const handleCopy = useCallback(
		(e?: React.MouseEvent) => {
			e?.preventDefault()
			e?.stopPropagation()

			void copyLink()
		},
		[copyLink],
	)

	const handleEdit = useCallback(
		(e?: React.MouseEvent) => {
			e?.preventDefault()
			e?.stopPropagation()
			onEdit?.(site)
		},
		[site, onEdit],
	)

	const handleDelete = useCallback(
		(e?: React.MouseEvent) => {
			e?.preventDefault()
			e?.stopPropagation()
			onDelete?.(site)
		},
		[site, onDelete],
	)

	const handleTogglePin = useCallback(
		(e?: React.MouseEvent) => {
			e?.preventDefault()
			e?.stopPropagation()
			onTogglePin?.(site)
		},
		[site, onTogglePin],
	)

	const canEdit =
		features.customSites && (source === 'custom' || source === 'imported')
	const isBuiltin = source === 'builtin'

	const contextActions = buildSiteActions(
		{ url, pinned, source },
		{
			onOpen: () => window.open(url, '_blank', 'noopener,noreferrer'),
			onCopyUrl: () => handleCopy(),
			onEdit: onEdit && canEdit ? () => handleEdit() : undefined,
			// builtin 站点不在右键菜单中提供 pin
			onTogglePin:
				onTogglePin && !isBuiltin ? () => handleTogglePin() : undefined,
			// builtin 站点：右键菜单提供"本地隐藏"；custom/imported：右键菜单提供"删除"
			onDelete: onDelete
				? isBuiltin && ALLOW_HIDE_BUILTIN
					? () => handleDelete()
					: canEdit
						? () => handleDelete()
						: undefined
				: undefined,
		},
	)

	return (
		<>
			<div
				className={`card-interactive group relative flex min-w-0 flex-col ${className}`}
			>
				<div className="flex min-w-0 flex-col gap-2 p-3 pb-2">
					<div className="flex h-10 shrink-0 items-center gap-2.5">
						<a
							href={url}
							target="_blank"
							rel="noopener noreferrer"
							title={`${name} — ${category}\n${description}`}
							aria-label={`${name} — ${description}（在新标签页中打开）`}
							className={[
								"flex min-w-0 flex-1 items-center gap-2.5 after:absolute after:inset-0 after:rounded-card after:content-['']",
								'no-underline text-foreground no-tap-highlight',
								'focus-visible:outline-none focus-visible:after:ring-2',
								'focus-visible:after:ring-primary focus-visible:after:ring-offset-2',
							]
								.filter(Boolean)
								.join(' ')}
							style={{
								WebkitTouchCallout: 'none',
								userSelect: 'none',
								touchAction: 'manipulation',
							}}
							onContextMenu={isIOS ? undefined : onContextMenu}
							onTouchStart={isIOS ? undefined : onTouchStart}
							onTouchEnd={isIOS ? undefined : onTouchEnd}
							onTouchMove={isIOS ? undefined : onTouchMove}
						>
							<SiteIcon name={name} iconUrl={iconUrl} siteUrl={url} />
							<div className="relative z-1 min-w-0 flex-1">
								<div className="flex items-center gap-1.5 min-w-0">
									<span
										className="truncate text-sm font-medium text-foreground group-hover:text-primary transition-colors duration-100 leading-snug"
										title={name}
									>
										{highlightText(name, searchQuery)}
									</span>
									<span className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-50 transition-opacity duration-100">
										<ExternalLinkIcon size={10} />
									</span>
									{pinned && (
										<span
											className="inline-flex shrink-0 text-primary"
											title="已置顶"
										>
											<PinIcon size={10} />
										</span>
									)}
									<SourceBadge source={source} />
								</div>
							</div>
						</a>
						{/* iOS-only: three-dot menu button, always visible in top-right */}
						{isIOS && contextActions.length > 0 && (
							<button
								ref={dotsBtnRef}
								type="button"
								aria-label="更多操作"
								aria-haspopup="menu"
								aria-expanded={menuState.open}
								onTouchStart={() => {
									dotsTouchMoved.current = false
								}}
								onTouchMove={() => {
									dotsTouchMoved.current = true
								}}
								onTouchEnd={(e) => {
									// Only open if the finger didn't scroll away
									if (dotsTouchMoved.current) return
									e.preventDefault() // prevent ghost click on card beneath
									e.stopPropagation()
									openIOSMenu()
								}}
								onClick={(e) => {
									// Fallback for non-touch iOS (e.g. iPad with mouse)
									e.preventDefault()
									e.stopPropagation()
									openIOSMenu()
								}}
								className="
								relative z-10 shrink-0
							flex items-center justify-center
							h-6 w-6 rounded-md
							text-muted-foreground
							bg-surface/80 backdrop-blur-sm
							border border-border/60
							transition-colors duration-100
							active:bg-muted
							focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary
						"
							>
								<svg
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="currentColor"
									aria-hidden="true"
								>
									<circle cx="5" cy="12" r="2" />
									<circle cx="12" cy="12" r="2" />
									<circle cx="19" cy="12" r="2" />
								</svg>
							</button>
						)}
						{!isIOS && (
							<div
								className="
								relative z-10 shrink-0 flex items-center gap-0.5
									opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100
							transition-opacity duration-100
						"
								onClick={(e) => e.preventDefault()}
								onKeyDown={(e) => e.stopPropagation()}
								role="toolbar"
								aria-label="快捷操作"
							>
								{/* builtin：复制 + 隐藏 */}
								{isBuiltin && (
									<>
										<QuickAction
											icon={
												copied ? (
													<CheckIcon size={12} />
												) : (
													<CopyIcon size={12} />
												)
											}
											label={
												copied
													? '已复制'
													: copyFailed
														? '复制失败，请手动复制'
														: '复制链接'
											}
											onClick={handleCopy}
										/>

										{onDelete && ALLOW_HIDE_BUILTIN && (
											<QuickAction
												icon={<TrashIcon size={12} />}
												label="本地隐藏"
												onClick={handleDelete}
												destructive
											/>
										)}
									</>
								)}

								{/* custom / imported：复制 + 编辑 + pin */}
								{!isBuiltin && (
									<>
										<QuickAction
											icon={
												copied ? (
													<CheckIcon size={12} />
												) : (
													<CopyIcon size={12} />
												)
											}
											label={
												copied
													? '已复制'
													: copyFailed
														? '复制失败，请手动复制'
														: '复制链接'
											}
											onClick={handleCopy}
										/>

										{onEdit && canEdit && (
											<QuickAction
												icon={<EditIcon size={12} />}
												label="编辑"
												onClick={handleEdit}
											/>
										)}

										{onTogglePin && (
											<QuickAction
												icon={
													pinned ? (
														<PinOffIcon size={12} />
													) : (
														<PinIcon size={12} />
													)
												}
												label={pinned ? '取消置顶' : '置顶'}
												onClick={handleTogglePin}
											/>
										)}
									</>
								)}
							</div>
						)}
					</div>

					<p
						className="h-[3.25em] line-clamp-2 text-xs text-muted-foreground leading-relaxed break-words"
						title={description}
					>
						{highlightText(description, searchQuery)}
					</p>
				</div>
				<output className="sr-only">
					{copyFailed ? '复制失败，请手动复制链接' : copied ? '链接已复制' : ''}
				</output>
				<div className="relative z-10 flex h-8 min-w-0 shrink-0 items-center gap-3 px-3 pb-3">
					<Badge
						variant="primary"
						className="min-w-0 max-w-[40%] text-xs py-0.5 border border-primary/15"
						title={category}
					>
						<span className="truncate">{category}</span>
					</Badge>
					<SiteTags
						name={name}
						tags={tags}
						activeTag={activeTag}
						onTagSelect={onTagSelect}
					/>
					{rank !== undefined && (
						<span
							className="
								inline-flex shrink-0 items-center justify-center
								h-5 min-w-4 px-1
								rounded text-[10px] font-semibold tabular-nums leading-none
								bg-muted text-muted-foreground
								border border-border
								select-none
							"
							title={`Ctrl+${rank} 打开`}
						>
							{rank}
						</span>
					)}
				</div>
			</div>

			{menuState.open && contextActions.length > 0 && (
				<ContextMenu
					x={menuState.x}
					y={menuState.y}
					actions={contextActions}
					onClose={closeMenu}
				/>
			)}
		</>
	)
}
