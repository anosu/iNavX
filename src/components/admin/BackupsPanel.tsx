import { useCallback, useEffect, useRef, useState } from 'react'
import { requestAdminApi } from '@/utils/adminApi'
import { parseCatalogImport } from '@/utils/catalogImport'
import type { Catalog, MigrationPackage } from '../../../shared/catalog'
import { MAX_API_BODY_BYTES } from '../../../shared/limits'
import {
	buttonClass,
	Dialog,
	dangerClass,
	inputClass,
	Panel,
	primaryClass,
	type RunAdminAction,
} from './ui'

interface ImportPreview {
	categories: number
	sites: number
	trash: number
	engines: number
	revision: string
	applications: number
}
interface DatabaseBackup {
	name: string
	size: number
}

export function BackupsPanel({
	data,
	csrf,
	runAction,
	busy,
}: {
	data: Catalog
	csrf: string
	runAction: RunAdminAction
	busy: boolean
}) {
	const [backups, setBackups] = useState<DatabaseBackup[]>([])
	const [deleting, setDeleting] = useState<DatabaseBackup | null>(null)
	const [deleteError, setDeleteError] = useState('')
	const [error, setError] = useState('')
	const [backupError, setBackupError] = useState('')
	const [previewing, setPreviewing] = useState(false)
	const previewGeneration = useRef(0)
	const [report, setReport] = useState('')
	const [pending, setPending] = useState<{
		package: MigrationPackage
		preview: ImportPreview
		canReplace: boolean
		filename: string
	} | null>(null)
	const [mode, setMode] = useState<'merge' | 'replace'>('merge')
	const [confirmation, setConfirmation] = useState('')
	const load = useCallback(() => {
		requestAdminApi<DatabaseBackup[]>('admin/backups')
			.then((next) => {
				setBackups(next)
				setBackupError('')
			})
			.catch((error: unknown) =>
				setBackupError(
					error instanceof Error ? error.message : '备份列表不可用',
				),
			)
	}, [])
	useEffect(load, [load])
	useEffect(
		() => () => {
			previewGeneration.current++
		},
		[],
	)
	return (
		<div className="space-y-4">
			<Panel title="导出与备份">
				<p className="text-sm text-muted-foreground">
					迁移包包含公共内容、配置和申请审核记录，排除管理员凭据和会话。数据库备份用于同类实例完整恢复，包含管理员配置。
				</p>
				<div className="flex flex-wrap gap-2">
					<a className={buttonClass} href="/api/admin/export" download>
						导出迁移包
					</a>
					<button
						type="button"
						disabled={busy}
						className={primaryClass}
						onClick={() =>
							void runAction(async () => {
								await requestAdminApi('admin/backups', csrf, {})
								load()
							}, '数据库备份已生成')
						}
					>
						备份数据库
					</button>
					<button type="button" className={buttonClass} onClick={load}>
						刷新列表
					</button>
				</div>
				{backupError && (
					<p role="alert" className="text-error text-sm">
						{backupError}
					</p>
				)}
				<ul className="divide-y divide-border">
					{backups.map((backup) => (
						<li
							key={backup.name}
							className="py-3 flex flex-wrap justify-between gap-2 items-center"
						>
							<div className="min-w-0">
								<p className="text-sm break-all">{backup.name}</p>
								<p className="text-xs text-muted-foreground">
									{(backup.size / 1024).toFixed(1)} KB
								</p>
							</div>
							<div className="flex gap-2">
								<a
									className={buttonClass}
									href={`/api/admin/backups/${encodeURIComponent(backup.name)}`}
									download
								>
									下载
								</a>
								<button
									type="button"
									className={dangerClass}
									disabled={busy}
									onClick={() => {
										setDeleteError('')
										setDeleting(backup)
									}}
								>
									删除
								</button>
							</div>
						</li>
					))}
				</ul>
				<p className="text-xs text-muted-foreground">
					原生数据库恢复需要停站后执行容器 restore 命令，操作步骤见部署文档。
				</p>
			</Panel>
			<Panel title="导入与恢复">
				{report && (
					<output className="block text-sm text-muted-foreground">
						{report}
					</output>
				)}
				<p className="text-sm text-muted-foreground">
					选择迁移包、站点 JSON、个人备份或书签
					HTML。先检查内容，再选择合并或覆盖；执行前会自动备份。
				</p>
				<input
					aria-label="选择公共数据导入文件"
					type="file"
					accept=".json,.html,.htm"
					disabled={busy}
					className={inputClass}
					onChange={(event) => {
						const file = event.target.files?.[0]
						const generation = ++previewGeneration.current
						event.target.value = ''
						setPreviewing(false)
						setPending(null)
						setConfirmation('')
						setError('')
						setReport('')
						if (!file) return
						if (file.size > MAX_API_BODY_BYTES) {
							setError('文件最大 8 MB')
							return
						}
						setPreviewing(true)
						void file
							.text()
							.then(async (text) => {
								if (generation !== previewGeneration.current) return
								const parsedImport = parseCatalogImport(text, file.name, data)
								const preview = await requestAdminApi<ImportPreview>(
									'admin/import/preview',
									csrf,
									parsedImport.package,
								)
								if (generation !== previewGeneration.current) return
								setPending({
									...parsedImport,
									preview,
									filename: file.name,
								})
								setMode('merge')
							})
							.catch((error: unknown) => {
								if (generation === previewGeneration.current)
									setError(
										error instanceof Error ? error.message : '文件解析失败',
									)
							})
							.finally(() => {
								if (generation === previewGeneration.current)
									setPreviewing(false)
							})
					}}
				/>
				{previewing && (
					<output className="block text-sm text-muted-foreground">
						正在解析与校验所选文件…
					</output>
				)}
				{error && (
					<p role="alert" className="text-error text-sm">
						{error}
					</p>
				)}
				{pending && (
					<div className="space-y-3">
						<p className="text-sm font-medium break-all">
							预览文件：{pending.filename}
						</p>
						<p className="text-sm">
							{pending.preview.sites} 个站点 · {pending.preview.trash}{' '}
							个回收站条目 · {pending.preview.categories} 个分类 ·{' '}
							{pending.preview.engines} 个搜索引擎 ·{' '}
							{pending.preview.applications} 条申请记录
						</p>
						<select
							aria-label="导入模式"
							disabled={busy}
							className={inputClass}
							value={mode}
							onChange={(e) => setMode(e.target.value as 'merge' | 'replace')}
						>
							<option value="merge">
								合并导入（保留当前配置，相同 URL 跳过）
							</option>
							{pending.canReplace && (
								<option value="replace">
									覆盖恢复（替换公共内容、配置与申请）
								</option>
							)}
						</select>
						{mode === 'replace' && (
							<label className="block space-y-2 text-sm">
								<span>
									将替换当前公共内容与申请历史。旧版迁移包不含申请，恢复时会清空当前申请。请输入
									REPLACE 确认：
								</span>
								<input
									className={inputClass}
									disabled={busy}
									value={confirmation}
									onChange={(e) => setConfirmation(e.target.value)}
								/>
							</label>
						)}
						<button
							type="button"
							disabled={
								busy ||
								previewing ||
								(mode === 'replace' && confirmation !== 'REPLACE')
							}
							className={primaryClass}
							onClick={() =>
								void runAction(
									async () => {
										setError('')
										try {
											const result = await requestAdminApi<{
												added?: number
												skipped?: number
												conflicts?: string[]
												backup: string
												applicationsAdded?: number
												applicationsSkipped?: number
											}>('admin/import', csrf, {
												package: pending.package,
												mode,
												revision: pending.preview.revision,
												confirmation,
											})
											setPending(null)
											load()
											if (result.added !== undefined)
												setReport(
													'导入结果：新增 ' +
														result.added +
														'，跳过 ' +
														result.skipped +
														'，内容冲突 ' +
														(result.conflicts?.join('、') || '无') +
														'；申请新增 ' +
														(result.applicationsAdded || 0) +
														'，跳过 ' +
														(result.applicationsSkipped || 0),
												)
										} catch (error) {
											setError(
												error instanceof Error ? error.message : '导入失败',
											)
											throw error
										}
									},
									mode === 'replace' ? '公共数据已恢复' : '公共数据已合并',
								)
							}
						>
							{mode === 'replace' ? '确认覆盖恢复' : '确认合并导入'}
						</button>
					</div>
				)}
			</Panel>
			{deleting && (
				<Dialog
					title="永久删除备份"
					description="只删除此备份文件，当前站点数据不受影响。删除后无法恢复。"
					busy={busy}
					onClose={() => setDeleting(null)}
					footer={
						<div className="flex justify-end gap-2">
							<button
								type="button"
								className={buttonClass}
								disabled={busy}
								onClick={() => setDeleting(null)}
							>
								取消
							</button>
							<button
								type="button"
								className={dangerClass}
								disabled={busy}
								onClick={() =>
									void runAction(async () => {
										setDeleteError('')
										try {
											await requestAdminApi(
												`admin/backups/${encodeURIComponent(deleting.name)}`,
												csrf,
												{},
												'DELETE',
											)
										} catch (error) {
											setDeleteError(
												error instanceof Error ? error.message : '备份删除失败',
											)
											throw error
										}
										load()
									}, '备份已永久删除').then((ok) => {
										if (ok) setDeleting(null)
									})
								}
							>
								{busy ? '正在删除…' : '永久删除'}
							</button>
						</div>
					}
				>
					<p className="text-sm break-all">{deleting.name}</p>
					{deleteError && (
						<p role="alert" className="mt-3 text-sm text-error">
							{deleteError}
						</p>
					)}
				</Dialog>
			)}
		</div>
	)
}
