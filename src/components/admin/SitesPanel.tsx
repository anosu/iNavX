import { useId, useRef, useState } from 'react'
import { TagInput } from '@/components/molecules/TagInput'
import { requestAdminApi } from '@/utils/adminApi'
import {
	type Catalog,
	type PublicSite,
	type SiteInput,
	siteInputSchema,
} from '../../../shared/catalog'
import { ADMIN_PAGE_SIZE } from '../../../shared/limits'
import { createTagInput, readTagInput } from '../../../shared/tags'
import {
	buttonClass,
	Dialog,
	dangerClass,
	EmptyState,
	Field,
	inputClass,
	Pagination,
	Panel,
	primaryClass,
	type RunAdminAction,
	Switch,
	useDirtyForm,
} from './ui'

function SiteEditor({
	site,
	data,
	save,
	cancel,
	busy,
	serverError,
}: {
	site?: PublicSite
	data: Catalog
	save: (input: SiteInput) => void
	cancel: () => void
	busy: boolean
	serverError: string
}) {
	const formId = useId()
	const [value, setValue] = useState<SiteInput>(() =>
		site
			? {
					name: site.name,
					url: site.url,
					description: site.description,
					categoryId: site.categoryId,
					iconUrl: site.iconUrl,
					tags: site.tags,
					pinned: site.pinned,
					sortOrder: site.sortOrder,
				}
			: {
					name: '',
					url: '',
					description: '',
					categoryId: data.categories[0]?.id || '',
					iconUrl: '',
					tags: [],
					pinned: false,
					sortOrder: data.sites.length,
				},
	)
	const [tags, setTags] = useState(createTagInput(value.tags))
	const initial = useRef(
		JSON.stringify({ ...value, tags: createTagInput(value.tags) }),
	)
	const dirty = JSON.stringify({ ...value, tags }) !== initial.current
	useDirtyForm(dirty)
	const [discard, setDiscard] = useState(false)
	const onClose = () => {
		if (dirty) setDiscard(true)
		else cancel()
	}
	const [error, setError] = useState('')
	return (
		<Dialog
			size="lg"
			title={site ? '编辑站点' : '新增站点'}
			description={
				site?.deletedAt
					? '编辑后仍保留在回收站，可修正 URL 冲突再恢复。'
					: '保存后立即展示在公共目录中。'
			}
			onClose={onClose}
			busy={busy}
			footer={
				<div className="space-y-3">
					{(error || serverError) && (
						<p role="alert" className="text-error text-sm">
							{error || serverError}
						</p>
					)}
					{discard ? (
						<div className="flex flex-wrap items-center gap-2">
							<p role="alert" className="text-sm mr-auto">
								放弃未保存的修改？
							</p>
							<button
								className={buttonClass}
								type="button"
								disabled={busy}
								onClick={(event) => {
									event.preventDefault()
									setDiscard(false)
								}}
							>
								继续编辑
							</button>
							<button
								className={dangerClass}
								type="button"
								disabled={busy}
								onClick={cancel}
							>
								放弃编辑
							</button>
						</div>
					) : (
						<div className="flex flex-wrap items-center justify-end gap-2">
							<span className="text-xs text-muted-foreground mr-auto">
								{dirty
									? '有未保存的修改'
									: site
										? '尚未修改'
										: '填写后保存到公共目录'}
							</span>
							<button
								className={buttonClass}
								type="button"
								disabled={busy}
								onClick={onClose}
							>
								取消
							</button>
							<button
								className={primaryClass}
								type="submit"
								form={formId}
								disabled={busy}
							>
								{busy ? '正在保存…' : '保存站点'}
							</button>
						</div>
					)}
				</div>
			}
		>
			<form
				id={formId}
				onSubmit={(event) => {
					event.preventDefault()
					const parsed = siteInputSchema.safeParse({
						...value,
						tags: readTagInput(tags),
					})
					if (!parsed.success)
						setError(
							parsed.error.issues.map((issue) => issue.message).join('；'),
						)
					else {
						setError('')
						save(parsed.data)
					}
				}}
			>
				<fieldset disabled={busy} className="grid sm:grid-cols-2 gap-4">
					<Field label="名称">
						<input
							required
							className={inputClass}
							value={value.name}
							maxLength={100}
							onChange={(e) => setValue({ ...value, name: e.target.value })}
						/>
					</Field>
					<Field label="URL">
						<input
							required
							type="url"
							className={inputClass}
							value={value.url}
							onChange={(e) => setValue({ ...value, url: e.target.value })}
						/>
					</Field>
					<Field
						label="分类"
						hint={
							data.categories.length
								? undefined
								: '暂无公共分类，请先在分类管理中新增。'
						}
					>
						<select
							className={inputClass}
							required
							value={value.categoryId}
							onChange={(e) =>
								setValue({ ...value, categoryId: e.target.value })
							}
						>
							{!data.categories.length && (
								<option value="">请先新增公共分类</option>
							)}
							{data.categories.map((category) => (
								<option key={category.id} value={category.id}>
									{category.name}
								</option>
							))}
						</select>
					</Field>
					<Field label="图标 URL（可留空）">
						<input
							className={inputClass}
							value={value.iconUrl}
							onChange={(e) => setValue({ ...value, iconUrl: e.target.value })}
						/>
					</Field>
					<Field label="描述">
						<textarea
							className={inputClass}
							rows={3}
							value={value.description}
							maxLength={1000}
							onChange={(e) =>
								setValue({ ...value, description: e.target.value })
							}
						/>
					</Field>
					<TagInput label="标签" value={tags} onChange={setTags} />
					<Field label="排序（数字越小越靠前）">
						<input
							type="number"
							min={0}
							max={1000000}
							className={inputClass}
							value={value.sortOrder}
							onChange={(e) =>
								setValue({ ...value, sortOrder: Number(e.target.value) })
							}
						/>
					</Field>
					<Switch
						className="sm:col-span-2 border-t border-border pt-3"
						label="置顶"
						hint="置顶站点优先显示在公共目录中。"
						checked={value.pinned}
						onChange={(checked) => setValue({ ...value, pinned: checked })}
					/>
				</fieldset>
			</form>
		</Dialog>
	)
}

export function SitesPanel({
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
	const [filter, setFilter] = useState('')
	const [trash, setTrash] = useState(false)
	const [editing, setEditing] = useState<PublicSite | 'new' | null>(null)
	const [category, setCategory] = useState('')
	const [page, setPage] = useState(1)
	const [deleting, setDeleting] = useState<PublicSite | null>(null)
	const [saveError, setSaveError] = useState('')
	const [deleteError, setDeleteError] = useState('')
	const selected = data.sites.filter(
		(site) =>
			Boolean(site.deletedAt) === trash &&
			(!category || site.categoryId === category) &&
			(site.name + site.url + site.description + site.tags.join(' '))
				.toLowerCase()
				.includes(filter.toLowerCase()),
	)
	const currentPage = Math.min(
		page,
		Math.max(1, Math.ceil(selected.length / ADMIN_PAGE_SIZE)),
	)
	const rows = selected.slice(
		(currentPage - 1) * ADMIN_PAGE_SIZE,
		currentPage * ADMIN_PAGE_SIZE,
	)
	const actions = (site: PublicSite) => (
		<div className="flex gap-2">
			<button
				type="button"
				disabled={busy}
				className={buttonClass}
				onClick={() => {
					setSaveError('')
					setEditing(site)
				}}
			>
				编辑
			</button>
			{trash && (
				<button
					type="button"
					disabled={busy}
					className={buttonClass}
					onClick={() =>
						void runAction(
							() => requestAdminApi(`admin/sites/${site.id}/restore`, csrf, {}),
							'站点已恢复',
						)
					}
				>
					恢复
				</button>
			)}
			<button
				type="button"
				disabled={busy}
				className={dangerClass}
				onClick={() => {
					setDeleteError('')
					setDeleting(site)
				}}
			>
				{trash ? '永久删除' : '移入回收站'}
			</button>
		</div>
	)
	return (
		<div className="space-y-4">
			{editing && (
				<SiteEditor
					key={editing === 'new' ? 'new' : editing.id}
					site={editing === 'new' ? undefined : editing}
					data={data}
					busy={busy}
					serverError={saveError}
					cancel={() => setEditing(null)}
					save={(input) => {
						setSaveError('')
						void runAction(
							() =>
								requestAdminApi(
									`admin/sites${editing === 'new' ? '' : `/${editing.id}`}`,
									csrf,
									input,
									editing === 'new' ? 'POST' : 'PUT',
								).catch((error: unknown) => {
									setSaveError(
										error instanceof Error ? error.message : '保存失败',
									)
									throw error
								}),
							'站点已保存',
						).then((ok) => {
							if (ok) setEditing(null)
						})
					}}
				/>
			)}
			<Panel
				title={trash ? '回收站' : '公共目录'}
				description={
					trash
						? '条目可以编辑、恢复或永久删除。永久删除后只能通过备份恢复。'
						: '搜索名称、地址、描述或标签，按分类快速定位。'
				}
			>
				<div className="flex flex-wrap items-center gap-2">
					<input
						aria-label="搜索公共站点"
						className={`${inputClass} sm:max-w-xs`}
						placeholder="搜索站点、URL 或标签"
						value={filter}
						onChange={(e) => {
							setFilter(e.target.value)
							setPage(1)
						}}
					/>
					<select
						aria-label="筛选分类"
						className={`${inputClass} sm:max-w-40`}
						value={category}
						onChange={(e) => {
							setCategory(e.target.value)
							setPage(1)
						}}
					>
						<option value="">全部分类</option>
						{data.categories.map((item) => (
							<option key={item.id} value={item.id}>
								{item.name}
							</option>
						))}
					</select>
					<button
						type="button"
						className={buttonClass}
						onClick={() => {
							setTrash(!trash)
							setEditing(null)
							setPage(1)
						}}
					>
						{trash
							? '返回站点'
							: `回收站 (${data.sites.filter((s) => s.deletedAt).length})`}
					</button>
					{!trash && (
						<button
							type="button"
							className={primaryClass}
							onClick={() => {
								setSaveError('')
								setEditing('new')
							}}
						>
							新增站点
						</button>
					)}
				</div>
				<div className="sm:hidden space-y-3">
					{rows.map((site) => (
						<article
							key={site.id}
							className="rounded-card border border-border p-3 space-y-3"
						>
							<div>
								<a
									className="text-sm font-medium hover:text-primary break-words"
									href={site.url}
									target="_blank"
									rel="noreferrer"
								>
									{site.pinned && '★ '}
									{site.name}
								</a>
								<p className="text-xs text-muted-foreground truncate mt-1">
									{site.url}
								</p>
							</div>
							<div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
								<span>
									{data.categories.find((c) => c.id === site.categoryId)?.name}
								</span>
								<span>排序 {site.sortOrder}</span>
							</div>
							{actions(site)}
						</article>
					))}
				</div>
				<div className="overflow-x-auto">
					<table
						className="hidden sm:table w-full text-sm text-left"
						aria-label={trash ? '回收站条目' : '公共站点列表'}
					>
						<thead>
							<tr className="border-b border-border text-muted-foreground">
								<th className="py-3">站点</th>
								<th>分类</th>
								<th>排序</th>
								<th className="min-w-40">操作</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((site) => (
								<tr
									key={site.id}
									className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
								>
									<td className="py-3 pr-3">
										<a
											href={site.url}
											target="_blank"
											rel="noreferrer"
											className="font-medium hover:text-primary"
										>
											{site.pinned && (
												<span
													className="text-primary"
													role="img"
													aria-label="已置顶"
												>
													★{' '}
												</span>
											)}
											{site.name}
										</a>
										<p className="text-xs text-muted-foreground max-w-36 sm:max-w-xs truncate mt-1">
											{site.url}
										</p>
									</td>
									<td className="pr-3 whitespace-nowrap">
										{
											data.categories.find((c) => c.id === site.categoryId)
												?.name
										}
									</td>
									<td>{site.sortOrder}</td>
									<td>{actions(site)}</td>
								</tr>
							))}
						</tbody>
					</table>
					{selected.length === 0 && (
						<EmptyState
							title={
								filter || category
									? '没有匹配的条目'
									: trash
										? '回收站为空'
										: '公共目录为空'
							}
							description={
								filter || category
									? '试试其他关键词，或切换到全部分类。'
									: trash
										? '移入回收站的条目会显示在这里。'
										: '新增第一个站点，或在备份与迁移中导入内容。'
							}
						/>
					)}
				</div>
				<Pagination
					page={currentPage}
					total={selected.length}
					onPageChange={setPage}
					busy={busy}
				/>
			</Panel>
			{deleting && (
				<Dialog
					title={deleting.deletedAt ? '永久删除站点？' : '移入回收站？'}
					description={
						deleting.deletedAt
							? `「${deleting.name}」将被永久删除，无法在回收站恢复；相关审核历史会保留。`
							: `「${deleting.name}」将从公共目录中隐藏，可以在回收站恢复。`
					}
					busy={busy}
					onClose={() => setDeleting(null)}
				>
					{deleteError && (
						<p role="alert" className="mb-4 text-sm text-error">
							{deleteError}
						</p>
					)}
					<div className="flex justify-end gap-2">
						<button
							className={buttonClass}
							type="button"
							disabled={busy}
							onClick={() => setDeleting(null)}
						>
							取消
						</button>
						<button
							className={primaryClass}
							type="button"
							disabled={busy}
							onClick={() => {
								setDeleteError('')
								void runAction(
									async () => {
										try {
											await requestAdminApi(
												`admin/sites/${deleting.id}${deleting.deletedAt ? '/permanent' : ''}`,
												csrf,
												deleting.deletedAt
													? { expectedUpdatedAt: deleting.updatedAt }
													: {},
												'DELETE',
											)
										} catch (error) {
											setDeleteError(
												error instanceof Error ? error.message : '删除失败',
											)
											throw error
										}
									},
									deleting.deletedAt ? '站点已永久删除' : '已移入回收站',
								).then((ok) => {
									if (ok) setDeleting(null)
								})
							}}
						>
							{busy
								? '正在处理…'
								: deleting.deletedAt
									? '永久删除'
									: '移入回收站'}
						</button>
					</div>
				</Dialog>
			)}
		</div>
	)
}
