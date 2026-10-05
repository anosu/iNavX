import { createContext, type ReactNode, useContext, useEffect } from 'react'
import { buttonVariants } from '@/components/atoms/Button'
import { inputVariants } from '@/components/atoms/Input'

export { Dialog } from '@/components/atoms/Dialog'
export { Switch } from '@/components/atoms/Switch'

import { ADMIN_PAGE_SIZE } from '../../../shared/limits'

export const inputClass = inputVariants()
export const buttonClass = buttonVariants({ variant: 'secondary' })
export const primaryClass = buttonVariants({ variant: 'primary' })
export const dangerClass = buttonVariants({ variant: 'danger' })
export function Field({
	label,
	children,
	hint,
}: {
	label: string
	children: ReactNode
	hint?: string
}) {
	return (
		// biome-ignore lint/a11y/noLabelWithoutControl: Callers supply an input, select or textarea inside this wrapping label.
		<label className="grid min-w-0 content-start gap-1.5 text-sm">
			<span className="font-medium">{label}</span>
			{children}
			{hint && (
				<span className="text-xs text-muted-foreground font-normal leading-relaxed">
					{hint}
				</span>
			)}
		</label>
	)
}
export function Panel({
	title,
	children,
	description,
}: {
	title: string
	children: ReactNode
	description?: string
}) {
	return (
		<section className="rounded-card border border-border bg-surface p-4 sm:p-5 space-y-4">
			<div>
				<h2 className="text-base font-semibold tracking-tight">{title}</h2>
				{description && (
					<p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
						{description}
					</p>
				)}
			</div>
			{children}
		</section>
	)
}
export type RunAdminAction = (
	action: () => Promise<unknown>,
	successMessage: string,
) => Promise<boolean>

export const DirtyContext = createContext<(dirty: boolean) => void>(
	() => undefined,
)
export function useDirtyForm(dirty: boolean) {
	const setDirty = useContext(DirtyContext)
	useEffect(() => {
		setDirty(dirty)
		return () => setDirty(false)
	}, [dirty, setDirty])
}
export function EmptyState({
	title,
	description,
}: {
	title: string
	description: string
}) {
	return (
		<div className="rounded-md border border-dashed border-border px-5 py-12 text-center">
			<p className="font-medium text-sm">{title}</p>
			<p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground leading-relaxed">
				{description}
			</p>
		</div>
	)
}
export function Pagination({
	page,
	total,
	size = ADMIN_PAGE_SIZE,
	onPageChange,
	busy = false,
}: {
	page: number
	total: number
	size?: number
	onPageChange: (page: number) => void
	busy?: boolean
}) {
	const pages = Math.max(1, Math.ceil(total / size))
	return (
		<div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-border">
			<p className="text-xs text-muted-foreground">
				共 {total} 项 · 第 {page} / {pages} 页
			</p>
			<div className="flex gap-2">
				<button
					type="button"
					className={buttonClass}
					disabled={busy || page <= 1}
					onClick={() => onPageChange(page - 1)}
				>
					上一页
				</button>
				<button
					type="button"
					className={buttonClass}
					disabled={busy || page >= pages}
					onClick={() => onPageChange(page + 1)}
				>
					下一页
				</button>
			</div>
		</div>
	)
}
export function SaveBar({
	dirty,
	busy,
	label = '保存修改',
}: {
	dirty: boolean
	busy: boolean
	label?: string
}) {
	return (
		<div className="sm:col-span-2 sticky bottom-3 z-10 flex flex-wrap justify-between items-center gap-3 rounded-md border border-border bg-surface/95 px-4 py-3 shadow-sm backdrop-blur">
			<span className="text-xs text-muted-foreground">
				{dirty ? '有未保存的修改' : '所有修改已保存'}
			</span>
			<button type="submit" className={primaryClass} disabled={!dirty || busy}>
				{busy ? '正在保存…' : label}
			</button>
		</div>
	)
}
