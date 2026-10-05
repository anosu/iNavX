import { useId, useState } from 'react'
import { requestAdminApi } from '@/utils/adminApi'
import type { Catalog, Category } from '../../../shared/catalog'
import {
	buttonClass,
	Dialog,
	dangerClass,
	Field,
	inputClass,
	Panel,
	primaryClass,
	type RunAdminAction,
	useDirtyForm,
} from './ui'

function CategoryEditor({
	category,
	order,
	csrf,
	runAction,
	busy,
	onClose,
}: {
	category?: Category
	order: number
	csrf: string
	runAction: RunAdminAction
	busy: boolean
	onClose: () => void
}) {
	const formId = useId()
	const [name, setName] = useState(category?.name || '')
	const [sortOrder, setOrder] = useState(category?.sortOrder ?? order)
	const [error, setError] = useState('')
	const [discard, setDiscard] = useState(false)
	const dirty =
		name !== (category?.name || '') ||
		sortOrder !== (category?.sortOrder ?? order)
	useDirtyForm(dirty)
	const cancel = () => {
		if (dirty) setDiscard(true)
		else onClose()
	}
	return (
		<Dialog
			title={category ? `编辑分类：${category.name}` : '新增分类'}
			description="分类名称与排序保存后立即生效，数字越小越靠前。"
			onClose={cancel}
			busy={busy}
			footer={
				<div className="space-y-3">
					{error && (
						<p role="alert" className="text-sm text-error">
							{error}
						</p>
					)}
					{discard ? (
						<div className="flex flex-wrap items-center gap-2">
							<p role="alert" className="mr-auto text-sm">
								放弃未保存的分类修改？
							</p>
							<button
								type="button"
								className={buttonClass}
								disabled={busy}
								onClick={(event) => {
									event.preventDefault()
									setDiscard(false)
								}}
							>
								继续编辑
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
						<div className="flex justify-end gap-2">
							<button
								type="button"
								className={buttonClass}
								disabled={busy}
								onClick={cancel}
							>
								取消
							</button>
							<button
								type="submit"
								form={formId}
								className={primaryClass}
								disabled={busy || !dirty}
							>
								{busy ? '正在保存…' : '保存分类'}
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
					if (!name.trim()) {
						setError('请输入分类名称')
						return
					}
					setError('')
					void runAction(async () => {
						try {
							await requestAdminApi(
								`admin/categories${category ? `/${category.id}` : ''}`,
								csrf,
								{ name: name.trim(), sortOrder },
								category ? 'PUT' : 'POST',
							)
						} catch (error) {
							setError(error instanceof Error ? error.message : '分类保存失败')
							throw error
						}
					}, '分类已保存').then((ok) => {
						if (ok) onClose()
					})
				}}
			>
				<fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
					<Field label="分类名称">
						<input
							required
							maxLength={100}
							className={inputClass}
							value={name}
							onChange={(event) => setName(event.target.value)}
						/>
					</Field>
					<Field label="排序" hint="数字越小，分类显示越靠前。">
						<input
							type="number"
							required
							min={0}
							max={1000000}
							className={inputClass}
							value={sortOrder}
							onChange={(event) => setOrder(Number(event.target.value))}
						/>
					</Field>
				</fieldset>
			</form>
		</Dialog>
	)
}

function DeleteCategoryDialog({
	category,
	data,
	csrf,
	runAction,
	busy,
	onClose,
}: {
	category: Category
	data: Catalog
	csrf: string
	runAction: RunAdminAction
	busy: boolean
	onClose: () => void
}) {
	const formId = useId()
	const [target, setTarget] = useState('')
	const [deleteSites, setDeleteSites] = useState(false)
	const [error, setError] = useState('')
	const count = data.sites.filter(
		(site) => site.categoryId === category.id,
	).length
	return (
		<Dialog
			title={`删除分类：${category.name}`}
			description="永久删除无法撤销，请选择关联站点的处理方式。"
			onClose={onClose}
			busy={busy}
			footer={
				<div className="space-y-3">
					{error && (
						<p role="alert" className="text-sm text-error">
							{error}
						</p>
					)}
					<div className="flex justify-end gap-2">
						<button
							type="button"
							className={buttonClass}
							disabled={busy}
							onClick={onClose}
						>
							取消
						</button>
						<button
							type="submit"
							form={formId}
							className={dangerClass}
							disabled={busy || (count > 0 && !target && !deleteSites)}
						>
							{busy ? '正在删除…' : '确认删除分类'}
						</button>
					</div>
				</div>
			}
		>
			<form
				id={formId}
				className="space-y-4"
				onSubmit={(event) => {
					event.preventDefault()
					setError('')
					void runAction(async () => {
						try {
							await requestAdminApi(
								`admin/categories/${category.id}`,
								csrf,
								deleteSites
									? { deleteSites: true }
									: target
										? { targetId: target }
										: {},
								'DELETE',
							)
						} catch (error) {
							setError(error instanceof Error ? error.message : '分类删除失败')
							throw error
						}
					}, '分类已删除').then((ok) => {
						if (ok) onClose()
					})
				}}
			>
				<p className="text-sm text-muted-foreground leading-relaxed">
					此分类包含 {count} 个站点（含回收站）。
					{count > 0
						? '可以迁移站点，或连同站点一起永久删除。'
						: '可以直接删除空分类。'}
					个人浏览器中的旧分类继续保留。
				</p>
				{count > 0 && (
					<Field label="关联站点处理">
						<select
							required
							disabled={busy}
							className={inputClass}
							value={deleteSites ? '__delete__' : target}
							onChange={(event) => {
								setDeleteSites(event.target.value === '__delete__')
								setTarget(
									event.target.value === '__delete__' ? '' : event.target.value,
								)
							}}
						>
							<option value="">请选择迁移目标</option>
							<option value="__delete__">
								永久删除此分类的全部站点（含回收站）
							</option>
							{data.categories
								.filter((item) => item.id !== category.id)
								.map((item) => (
									<option key={item.id} value={item.id}>
										{item.name}
									</option>
								))}
						</select>
					</Field>
				)}
			</form>
		</Dialog>
	)
}

export function CategoriesPanel({
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
	const [editing, setEditing] = useState<Category | 'new' | null>(null)
	const [deleting, setDeleting] = useState<Category | null>(null)
	return (
		<Panel
			title="公共分类"
			description="管理公共目录的分类名称与顺序；编辑后立即生效。"
		>
			<div className="flex items-center justify-between gap-3">
				<p className="text-sm text-muted-foreground">
					共 {data.categories.length} 个分类
				</p>
				<button
					type="button"
					disabled={busy}
					className={primaryClass}
					onClick={() => setEditing('new')}
				>
					新增分类
				</button>
			</div>
			<ul className="divide-y divide-border">
				{data.categories.map((category) => (
					<li
						key={category.id}
						className="flex flex-wrap justify-between gap-3 items-center py-3"
					>
						<div className="min-w-0 flex-1 basis-40">
							<p className="font-medium break-words">{category.name}</p>
							<p className="mt-1 text-xs text-muted-foreground">
								排序 {category.sortOrder} ·{' '}
								{
									data.sites.filter(
										(site) =>
											site.categoryId === category.id && !site.deletedAt,
									).length
								}{' '}
								个站点
							</p>
						</div>
						<div className="flex shrink-0 gap-2">
							<button
								type="button"
								disabled={busy}
								className={buttonClass}
								onClick={() => setEditing(category)}
							>
								编辑
							</button>
							<button
								type="button"
								disabled={busy}
								className={dangerClass}
								onClick={() => setDeleting(category)}
							>
								删除
							</button>
						</div>
					</li>
				))}
			</ul>
			{editing && (
				<CategoryEditor
					category={editing === 'new' ? undefined : editing}
					order={Math.min(
						1000000,
						Math.max(
							-1,
							...data.categories.map((category) => category.sortOrder),
						) + 1,
					)}
					csrf={csrf}
					runAction={runAction}
					busy={busy}
					onClose={() => setEditing(null)}
				/>
			)}
			{deleting && (
				<DeleteCategoryDialog
					category={deleting}
					data={data}
					csrf={csrf}
					runAction={runAction}
					busy={busy}
					onClose={() => setDeleting(null)}
				/>
			)}
		</Panel>
	)
}
