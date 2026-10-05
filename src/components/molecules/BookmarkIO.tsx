import { useRef, useState } from 'react'
import { Button } from '@/components/atoms/Button'
import {
	CheckIcon,
	DownloadIcon,
	TrashIcon,
	UploadIcon,
	XIcon,
} from '@/components/atoms/Icons'
import type { UseBookmarksReturn } from '@/hooks/useBookmarks'
import type { Site } from '@/types'

/* ---- 图标 ---- */

function EyeOffIcon() {
	return (
		<svg
			width="13"
			height="13"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
			<path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
			<line x1="1" y1="1" x2="23" y2="23" />
		</svg>
	)
}

/* ---- 主组件 ---- */

interface BookmarkIOProps {
	/** 当前所有可见站点（内置未隐藏 + 自定义 + 导入），用于导出 */
	visibleSites: Site[]
	importedCount: number
	bookmarks: {
		/** 为 undefined 时隐藏导入入口（feature flag 控制） */
		importFromHtml?: UseBookmarksReturn['importFromHtml']
		importFromJson?: UseBookmarksReturn['importFromJson']
		exportPersonal?: () => void
		clearImported?: UseBookmarksReturn['clearImported']
		/** 为 undefined 时隐藏导出入口 */
		exportToJson?: UseBookmarksReturn['exportToJson']
		/** 为 undefined 时隐藏导出入口 */
		exportToHtml?: UseBookmarksReturn['exportToHtml']
	}
	/** 已本地隐藏的内置站点数量 */
	hiddenBuiltinCount?: number
	/** 恢复所有本地隐藏的内置站点（为 undefined 则不显示按钮） */
	onRestoreBuiltin?: () => void
	/** 外部 toast 回调（由 Home 统一管理） */
	onShowToast?: (message: string, type: 'success' | 'error' | 'info') => void
}

export function BookmarkIO({
	visibleSites,
	importedCount,
	bookmarks,
	hiddenBuiltinCount = 0,
	onRestoreBuiltin,
	onShowToast,
}: BookmarkIOProps) {
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [importing, setImporting] = useState(false)
	const [showExportMenu, setShowExportMenu] = useState(false)
	const [showClearConfirm, setShowClearConfirm] = useState(false)
	const [showRestoreConfirm, setShowRestoreConfirm] = useState(false)

	function showToast(
		message: string,
		type: 'success' | 'error' | 'info' = 'success',
	) {
		onShowToast?.(message, type)
	}

	function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0]
		if (!file) return
		const importFile = file.name.toLowerCase().endsWith('.json')
			? bookmarks.importFromJson
			: bookmarks.importFromHtml
		if (!importFile) return

		setImporting(true)
		const reader = new FileReader()

		reader.onload = (evt) => {
			const fileContents = evt.target?.result
			try {
				if (typeof fileContents !== 'string') throw new Error('文件读取失败')
				const result = importFile(fileContents)
				if (result.handled) return
				if (result.imported === 0) {
					showToast(
						result.skipped > 0
							? `没有新书签（已跳过 ${result.skipped} 条无效链接）`
							: '未在文件中找到有效书签',
						'error',
					)
				} else {
					showToast(
						`成功导入 ${result.imported} 个书签${result.skipped > 0 ? `（跳过 ${result.skipped} 条）` : ''}`,
						'success',
					)
				}
			} catch {
				showToast(
					'文件解析失败，请确认是有效的书签 HTML 或个人 JSON 文件',
					'error',
				)
			} finally {
				setImporting(false)
				if (fileInputRef.current) fileInputRef.current.value = ''
			}
		}

		reader.onerror = () => {
			showToast('文件读取失败', 'error')
			setImporting(false)
		}

		reader.readAsText(file, 'utf-8')
	}

	const hasExport = Boolean(bookmarks.exportToJson || bookmarks.exportToHtml)
	const hasImport = Boolean(bookmarks.importFromHtml)

	return (
		<div className="relative flex items-center gap-1">
			{/* 隐藏的文件输入 */}
			{hasImport && (
				<input
					ref={fileInputRef}
					type="file"
					accept=".html,.htm,.json"
					className="sr-only"
					aria-label="选择书签 HTML 或个人 JSON 文件"
					onChange={handleFileChange}
				/>
			)}

			{/* 导入按钮 */}
			{hasImport && (
				<Button
					variant="ghost"
					size="sm"
					onClick={() => fileInputRef.current?.click()}
					loading={importing}
					aria-label="导入浏览器书签"
					title="导入书签 HTML、站点 JSON 或个人备份"
					className="gap-1.5 text-muted-foreground hover:text-foreground"
				>
					<UploadIcon size={14} />
					<span className="hidden sm:inline">导入书签</span>
				</Button>
			)}

			{/* 导出按钮 */}
			{hasExport && (
				<div className="relative">
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setShowExportMenu((v) => !v)}
						aria-label="导出站点数据"
						title="导出站点数据"
						className="gap-1.5 text-muted-foreground hover:text-foreground"
					>
						<DownloadIcon size={14} />
						<span className="hidden sm:inline">导出</span>
					</Button>

					{showExportMenu && (
						<>
							{/* 点击外层关闭 */}
							<div
								className="fixed inset-0 z-40"
								onClick={() => setShowExportMenu(false)}
								aria-hidden="true"
							/>
							<div
								className="absolute left-0 sm:left-auto sm:right-0 top-full mt-1 z-50 w-52 bg-surface border border-border rounded-lg overflow-hidden shadow-md animate-in"
								role="menu"
							>
								{bookmarks.exportPersonal && (
									<button
										type="button"
										role="menuitem"
										className="w-full px-3 py-2 text-xs text-left hover:bg-muted"
										onClick={() => {
											try {
												bookmarks.exportPersonal?.()
												setShowExportMenu(false)
											} catch {
												showToast('个人数据导出失败', 'error')
											}
										}}
									>
										备份个人数据与偏好
									</button>
								)}
								{/* 导出范围说明 */}
								<div className="px-3 py-2 border-b border-border">
									<p className="text-[11px] text-muted-foreground leading-snug">
										导出全部可见站点
										<span className="ml-1 tabular-nums text-foreground font-medium">
											({visibleSites.length})
										</span>
									</p>
								</div>

								{bookmarks.exportToJson && (
									<button
										type="button"
										role="menuitem"
										className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors duration-100 text-left"
										onClick={() => {
											// biome-ignore  lint/style/noNonNullAssertion: none
											bookmarks.exportToJson!(visibleSites)
											setShowExportMenu(false)
											showToast(
												`已导出 ${visibleSites.length} 个站点（JSON）`,
												'success',
											)
										}}
									>
										<DownloadIcon size={14} />
										导出为 JSON
									</button>
								)}
								{bookmarks.exportToHtml && (
									<button
										type="button"
										role="menuitem"
										className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors duration-100 text-left"
										onClick={() => {
											// biome-ignore  lint/style/noNonNullAssertion: none
											bookmarks.exportToHtml!(visibleSites)
											setShowExportMenu(false)
											showToast(
												`已导出 ${visibleSites.length} 个站点（书签 HTML）`,
												'success',
											)
										}}
									>
										<DownloadIcon size={14} />
										导出为书签 HTML
									</button>
								)}
							</div>
						</>
					)}
				</div>
			)}

			{/* 清除导入（只有存在导入书签时显示） */}
			{importedCount > 0 &&
				bookmarks.clearImported &&
				(showClearConfirm ? (
					<div className="flex flex-wrap items-center gap-1 border border-border rounded-md px-2 py-1 bg-surface animate-in">
						<span className="text-xs text-muted-foreground whitespace-nowrap">
							清除 {importedCount} 条导入？
						</span>
						<Button
							variant="danger"
							size="sm"
							onClick={() => {
								bookmarks.clearImported?.()
								setShowClearConfirm(false)
								showToast('已清除所有导入书签', 'success')
							}}
							aria-label="确认清除"
						>
							<CheckIcon size={14} />
						</Button>
						<Button
							variant="icon"
							size="sm"
							onClick={() => setShowClearConfirm(false)}
							aria-label="取消"
						>
							<XIcon size={14} />
						</Button>
					</div>
				) : (
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setShowClearConfirm(true)}
						aria-label={`清除 ${importedCount} 条导入书签`}
						title={`清除导入书签（${importedCount} 条）`}
						className="gap-1.5 text-muted-foreground hover:text-error"
					>
						<TrashIcon size={13} />
						<span className="hidden sm:inline tabular-nums">
							{importedCount}
						</span>
					</Button>
				))}

			{/* 恢复隐藏内置站点（只有存在隐藏站点时显示） */}
			{onRestoreBuiltin &&
				hiddenBuiltinCount > 0 &&
				(showRestoreConfirm ? (
					<div className="flex flex-wrap items-center gap-1 border border-border rounded-md px-2 py-1 bg-surface animate-in">
						<span className="text-xs text-muted-foreground whitespace-nowrap">
							恢复 {hiddenBuiltinCount} 个隐藏？
						</span>
						<Button
							size="sm"
							onClick={() => {
								onRestoreBuiltin()
								setShowRestoreConfirm(false)
								showToast(`已恢复 ${hiddenBuiltinCount} 个内置站点`, 'success')
							}}
							aria-label="确认恢复"
						>
							<CheckIcon size={14} />
						</Button>
						<Button
							variant="icon"
							size="sm"
							onClick={() => setShowRestoreConfirm(false)}
							aria-label="取消"
						>
							<XIcon size={14} />
						</Button>
					</div>
				) : (
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setShowRestoreConfirm(true)}
						aria-label={`恢复 ${hiddenBuiltinCount} 个本地隐藏的内置站点`}
						title={`恢复隐藏的内置站点（${hiddenBuiltinCount} 个）`}
						className="gap-1.5 text-muted-foreground hover:text-primary"
					>
						<EyeOffIcon />
						<span className="hidden sm:inline tabular-nums">
							{hiddenBuiltinCount}
						</span>
					</Button>
				))}
		</div>
	)
}
