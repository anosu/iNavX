import { useEffect, useId, useRef, useState } from 'react'
import { TagInput } from '@/components/molecules/TagInput'
import { requestAdminApi } from '@/utils/adminApi'
import type {
	Application,
	ApplicationList,
	Catalog,
	SiteInput,
} from '../../../shared/catalog'
import { httpUrl, normalizeUrl, reviewSchema } from '../../../shared/catalog'
import { parseTagInput } from '../../../shared/tags'
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
	useDirtyForm,
} from './ui'

const labels: Record<Application['status'], string> = {
	pending: '待审核',
	approved: '已批准',
	rejected: '已拒绝',
	duplicate: '重复申请',
}
const date = (value: string) =>
	new Date(value).toLocaleString('zh-CN', { hour12: false })

function ReviewDialog({
	item,
	data,
	busy,
	runAction,
	csrf,
	onClose,
	saved,
}: {
	item: Application
	data: Catalog
	busy: boolean
	runAction: RunAdminAction
	csrf: string
	onClose: () => void
	saved: () => void
}) {
	const formId = useId()
	const initialDuplicate = data.sites.find(
		(s) => !s.deletedAt && normalizeUrl(s.url) === normalizeUrl(item.url),
	)
	const [action, setAction] = useState<'approved' | 'rejected' | 'duplicate'>(
		initialDuplicate ? 'duplicate' : 'approved',
	)
	const [site, setSite] = useState<SiteInput>({
		name: item.name,
		url: item.url,
		description: item.description,
		categoryId:
			data.categories.find((c) => c.name === item.suggestedCategory)?.id ||
			data.categories[0]?.id ||
			'',
		iconUrl: '',
		tags: item.tags,
		pinned: false,
		sortOrder: data.sites.length,
	})
	const [siteId, setSiteId] = useState(initialDuplicate?.id || '')
	const [tags, setTags] = useState(item.tags.join(', '))
	const currentUrl = httpUrl.safeParse(site.url)
	const duplicate = currentUrl.success
		? data.sites.find(
				(entry) =>
					!entry.deletedAt &&
					normalizeUrl(entry.url) === normalizeUrl(currentUrl.data),
			)
		: undefined
	const [note, setNote] = useState('')
	const [error, setError] = useState('')
	const [discard, setDiscard] = useState(false)
	const initial = useRef(JSON.stringify({ action, site, siteId, note, tags }))
	const dirty =
		item.status === 'pending' &&
		initial.current !== JSON.stringify({ action, site, siteId, note, tags })
	useDirtyForm(dirty)
	const cancel = () => {
		if (dirty) setDiscard(true)
		else onClose()
	}
	const linked = data.sites.find((s) => s.id === item.siteId)
	return (
		<Dialog
			size="lg"
			title={item.status === 'pending' ? '审核收录申请' : '申请详情'}
			description={`提交于 ${date(item.createdAt)}`}
			onClose={cancel}
			busy={busy}
			footer={
				item.status === 'pending' ? (
					<div className="space-y-3">
						{error && (
							<p className="text-sm text-error" role="alert">
								{error}
							</p>
						)}
						{discard ? (
							<div className="flex flex-wrap gap-2 items-center">
								<span role="alert" className="text-sm mr-auto">
									放弃未保存的审核修改？
								</span>
								<button
									type="button"
									className={buttonClass}
									disabled={busy}
									onClick={(event) => {
										event.preventDefault()
										setDiscard(false)
									}}
								>
									继续审核
								</button>
								<button
									type="button"
									className={dangerClass}
									disabled={busy}
									onClick={onClose}
								>
									放弃修改
								</button>
							</div>
						) : (
							<div className="flex flex-wrap justify-end gap-2">
								<button
									type="button"
									className={buttonClass}
									disabled={busy}
									onClick={cancel}
								>
									取消
								</button>
								<button
									className={primaryClass}
									type="submit"
									form={formId}
									disabled={
										busy || (action === 'approved' && !data.categories.length)
									}
								>
									{busy
										? '正在处理…'
										: action === 'approved'
											? '批准并公开'
											: action === 'rejected'
												? '确认拒绝'
												: '确认标记重复'}
								</button>
							</div>
						)}
					</div>
				) : (
					<div className="flex justify-end">
						<button type="button" className={buttonClass} onClick={onClose}>
							关闭详情
						</button>
					</div>
				)
			}
		>
			<div className="mb-5 rounded-md bg-muted/50 p-4 text-sm space-y-2">
				<div className="flex items-start justify-between gap-3">
					<strong className="min-w-0 break-words">{item.name}</strong>
					<span className="shrink-0 rounded-full bg-primary/10 text-primary px-2 py-1 text-xs">
						{labels[item.status]}
					</span>
				</div>
				<a
					href={item.url}
					target="_blank"
					rel="noreferrer"
					className="text-primary break-all"
				>
					{item.url}
				</a>
				<p className="text-muted-foreground whitespace-pre-wrap break-words">
					{item.description || '未填写描述'}
				</p>
				<p className="text-xs text-muted-foreground break-words">
					建议分类：{item.suggestedCategory || '未指定'}
				</p>
				<p className="text-xs text-muted-foreground break-words">
					建议标签：{item.tags.join('、') || '未填写'}
				</p>
			</div>
			{item.status !== 'pending' ? (
				<div className="text-sm space-y-3">
					<p>处理于 {item.reviewedAt && date(item.reviewedAt)}</p>
					<p className="whitespace-pre-wrap break-words">
						审核备注：{item.reviewNote || '无'}
					</p>
					{linked && (
						<p className="break-words">
							关联站点：{linked.name}
							{linked.deletedAt ? '（已移入回收站）' : ''}
						</p>
					)}
					{item.siteDeletedAt && <p>关联站点已永久删除</p>}
				</div>
			) : (
				<form
					id={formId}
					onSubmit={(event) => {
						event.preventDefault()
						const value = reviewSchema.safeParse({
							action,
							expectedUpdatedAt: item.updatedAt,
							reviewNote: note,
							...(action === 'approved'
								? { site: { ...site, tags: parseTagInput(tags) } }
								: action === 'duplicate'
									? { siteId }
									: {}),
						})
						if (!value.success) {
							setError(
								value.error.issues.map((issue) => issue.message).join('；'),
							)
							return
						}
						setError('')
						void runAction(
							async () => {
								try {
									await requestAdminApi(
										`admin/applications/${item.id}/review`,
										csrf,
										value.data,
									)
								} catch (error) {
									setError(error instanceof Error ? error.message : '审核失败')
									throw error
								}
							},
							action === 'approved' ? '申请已批准，站点已公开' : '申请已处理',
						).then((ok) => {
							if (ok) {
								saved()
								onClose()
							}
						})
					}}
				>
					<fieldset disabled={busy} className="grid sm:grid-cols-2 gap-4">
						<div className="sm:col-span-2">
							<Field label="处理方式">
								<select
									className={inputClass}
									value={action}
									onChange={(e) => setAction(e.target.value as typeof action)}
								>
									<option value="approved">编辑并批准收录</option>
									<option value="rejected">拒绝申请</option>
									<option value="duplicate">标记为重复申请</option>
								</select>
							</Field>
						</div>
						{action === 'approved' && (
							<>
								<Field label="站点名称">
									<input
										className={inputClass}
										required
										maxLength={100}
										value={site.name}
										onChange={(e) => setSite({ ...site, name: e.target.value })}
									/>
								</Field>
								<Field label="站点 URL">
									<input
										className={inputClass}
										required
										type="url"
										maxLength={4096}
										value={site.url}
										onChange={(e) => setSite({ ...site, url: e.target.value })}
									/>
								</Field>
								<Field
									label="收录分类"
									hint={
										data.categories.length
											? undefined
											: '暂无公共分类，请先在分类管理中新增后批准。'
									}
								>
									<select
										className={inputClass}
										value={site.categoryId}
										onChange={(e) =>
											setSite({ ...site, categoryId: e.target.value })
										}
									>
										{!data.categories.length && (
											<option value="">请先新增公共分类</option>
										)}
										{data.categories.map((c) => (
											<option key={c.id} value={c.id}>
												{c.name}
											</option>
										))}
									</select>
								</Field>
								<Field label="图标 URL（可留空）">
									<input
										className={inputClass}
										value={site.iconUrl}
										onChange={(e) =>
											setSite({ ...site, iconUrl: e.target.value })
										}
									/>
								</Field>
								<div className="sm:col-span-2">
									<Field
										label="公开标签"
										hint="以申请建议为初始值，可以增删或修改。"
									>
										<TagInput value={tags} onChange={setTags} />
									</Field>
								</div>
								<div className="sm:col-span-2">
									<Field label="公开描述">
										<textarea
											className={inputClass}
											rows={3}
											maxLength={1000}
											value={site.description}
											onChange={(e) =>
												setSite({ ...site, description: e.target.value })
											}
										/>
									</Field>
								</div>
							</>
						)}
						{action === 'duplicate' && (
							<div className="sm:col-span-2">
								<Field
									label="关联已收录站点"
									hint="标记重复会结束审核，保留申请记录。"
								>
									<select
										className={inputClass}
										required
										value={siteId}
										onChange={(e) => setSiteId(e.target.value)}
									>
										<option value="">请选择已收录站点</option>
										{data.sites
											.filter((s) => !s.deletedAt)
											.map((s) => (
												<option key={s.id} value={s.id}>
													{s.name} · {s.url}
												</option>
											))}
									</select>
								</Field>
							</div>
						)}
						<div className="sm:col-span-2">
							<Field label="审核备注（仅管理员可见）">
								<textarea
									className={inputClass}
									rows={2}
									maxLength={1000}
									value={note}
									onChange={(e) => setNote(e.target.value)}
								/>
							</Field>
						</div>
						{duplicate && action === 'approved' && (
							<p className="sm:col-span-2 text-sm text-error">
								已收录相同 URL：{duplicate.name}。可标记重复，或修正地址后批准。
							</p>
						)}
					</fieldset>
				</form>
			)}
		</Dialog>
	)
}

export function ApplicationsPanel({
	data,
	csrf,
	runAction,
	busy,
	onCount,
}: {
	data: Catalog
	csrf: string
	runAction: RunAdminAction
	busy: boolean
	onCount: (count: number) => void
}) {
	const [status, setStatus] = useState<Application['status'] | ''>('pending')
	const [query, setQuery] = useState('')
	const [search, setSearch] = useState('')
	const [page, setPage] = useState(1)
	const [result, setResult] = useState<ApplicationList | null>(null)
	const [error, setError] = useState('')
	const [loading, setLoading] = useState(true)
	const [refresh, setRefresh] = useState(0)
	const [selected, setSelected] = useState<Application | null>(null)
	const [deleting, setDeleting] = useState<Application | null>(null)
	const [deleteError, setDeleteError] = useState('')
	useEffect(() => {
		const timer = setTimeout(() => {
			setSearch(query)
			setPage(1)
		}, 200)
		return () => clearTimeout(timer)
	}, [query])
	// biome-ignore lint/correctness/useExhaustiveDependencies: refresh explicitly reloads the review queue after actions.
	useEffect(() => {
		let active = true
		setLoading(true)
		setError('')
		const params = new URLSearchParams({
			page: String(page),
			q: search,
			...(status ? { status } : {}),
		})
		void requestAdminApi<ApplicationList>(`admin/applications?${params}`)
			.then((next) => {
				if (active) {
					setResult(next)
					onCount(next.counts.pending)
					if (page > Math.max(1, Math.ceil(next.total / 25)))
						setPage(Math.max(1, Math.ceil(next.total / 25)))
				}
			})
			.catch((error: unknown) => {
				if (active)
					setError(error instanceof Error ? error.message : '加载失败')
			})
			.finally(() => {
				if (active) setLoading(false)
			})
		return () => {
			active = false
		}
	}, [page, search, status, refresh, onCount])
	return (
		<>
			<Panel
				title="访客申请"
				description="申请审核后才会公开。所有状态的申请记录均可永久删除。"
			>
				<div className="flex flex-wrap gap-2">
					{(['pending', 'approved', 'rejected', 'duplicate'] as const).map(
						(value) => (
							<button
								className={status === value ? primaryClass : buttonClass}
								type="button"
								key={value}
								onClick={() => {
									setStatus(value)
									setPage(1)
								}}
								aria-pressed={status === value}
							>
								{labels[value]}
								{result ? ` (${result.counts[value]})` : ''}
							</button>
						),
					)}
					<button
						className={status === '' ? primaryClass : buttonClass}
						type="button"
						onClick={() => {
							setStatus('')
							setPage(1)
						}}
						aria-pressed={status === ''}
					>
						全部
					</button>
				</div>
				<div className="flex items-center gap-2">
					<input
						className={inputClass}
						aria-label="搜索收录申请"
						placeholder="搜索申请名称或 URL"
						value={query}
						maxLength={100}
						onChange={(e) => setQuery(e.target.value)}
					/>
					<button
						type="button"
						className={`${buttonClass} shrink-0`}
						disabled={loading || busy}
						onClick={() => setRefresh((n) => n + 1)}
					>
						刷新
					</button>
				</div>
				{error ? (
					<div role="alert" className="text-sm text-error">
						{error}
						<button
							className={`${buttonClass} ml-3`}
							type="button"
							onClick={() => setRefresh((n) => n + 1)}
						>
							重试
						</button>
					</div>
				) : loading ? (
					<output className="block py-10 text-center text-sm text-muted-foreground">
						正在加载申请…
					</output>
				) : result?.items.length ? (
					<div className="divide-y divide-border">
						{result.items.map((item) => (
							<article
								key={item.id}
								className="flex flex-wrap items-center gap-3 py-4"
							>
								<div className="min-w-0 flex-1 basis-48">
									<div className="flex flex-wrap items-center gap-2">
										<h3 className="min-w-0 text-sm font-semibold break-words">
											{item.name}
										</h3>
										<span
											className={
												'rounded-full px-2 py-0.5 text-[11px] ' +
												(item.status === 'pending'
													? 'bg-primary/10 text-primary'
													: 'bg-muted text-muted-foreground')
											}
										>
											{labels[item.status]}
										</span>
									</div>
									<p className="text-xs text-muted-foreground truncate mt-1">
										{item.url}
									</p>
									<p className="text-xs text-muted-foreground mt-2 break-words">
										{date(item.createdAt)} ·{' '}
										{item.suggestedCategory || '未指定分类'}
									</p>
								</div>
								<button
									type="button"
									disabled={busy}
									className={
										item.status === 'pending' ? primaryClass : buttonClass
									}
									onClick={() => setSelected(item)}
								>
									{item.status === 'pending' ? '审核申请' : '查看详情'}
								</button>
								<button
									type="button"
									disabled={busy}
									className={dangerClass}
									onClick={() => {
										setDeleteError('')
										setDeleting(item)
									}}
								>
									永久删除
								</button>
							</article>
						))}
					</div>
				) : (
					<EmptyState
						title={
							search
								? '没有匹配的申请'
								: status === 'pending'
									? '暂时没有待审核申请'
									: '暂无申请记录'
						}
						description={
							search
								? '试试其他名称或地址。'
								: '访客通过首页的收录申请入口提交后，会出现在这里。'
						}
					/>
				)}
				<Pagination
					page={page}
					total={result?.total || 0}
					onPageChange={setPage}
					busy={loading}
				/>
			</Panel>
			{selected && (
				<ReviewDialog
					key={selected.id}
					item={selected}
					data={data}
					csrf={csrf}
					runAction={runAction}
					busy={busy}
					onClose={() => setSelected(null)}
					saved={() => setRefresh((n) => n + 1)}
				/>
			)}
			{deleting && (
				<Dialog
					title="永久删除申请"
					description="申请内容与审核结果会一起删除，已收录站点不受影响。此操作无法撤销。"
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
												`admin/applications/${deleting.id}`,
												csrf,
												{ expectedUpdatedAt: deleting.updatedAt },
												'DELETE',
											)
										} catch (error) {
											setDeleteError(
												error instanceof Error ? error.message : '申请删除失败',
											)
											throw error
										}
									}, '申请已永久删除').then((ok) => {
										if (ok) {
											setDeleting(null)
											setRefresh((n) => n + 1)
										}
									})
								}
							>
								{busy ? '正在删除…' : '永久删除'}
							</button>
						</div>
					}
				>
					<p className="text-sm break-words">{deleting.name}</p>
					{deleteError && (
						<p role="alert" className="mt-3 text-sm text-error">
							{deleteError}
						</p>
					)}
				</Dialog>
			)}
		</>
	)
}
