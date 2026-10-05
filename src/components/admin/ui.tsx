import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useId,
} from 'react'
import { buttonVariants } from '@/components/atoms/Button'
import { useDialogLifecycle } from '@/hooks/useDialogLifecycle'

export { Switch } from '@/components/atoms/Switch'

import { ADMIN_PAGE_SIZE } from '../../../shared/limits'

export const inputClass =
	'admin-input w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm leading-5 transition-shadow placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60 focus:ring-3 focus:ring-primary/10 disabled:opacity-50 disabled:cursor-not-allowed'
export const buttonClass = buttonVariants({ variant: 'secondary' })
export const primaryClass = buttonVariants({ variant: 'primary' })
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
		<label className="grid content-start gap-1.5 text-sm">
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
		<section className="rounded-2xl border border-border bg-surface p-4 sm:p-6 space-y-5 shadow-sm">
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
export function Dialog({
	title,
	description,
	children,
	footer,
	onClose,
	busy = false,
}: {
	title: string
	description?: string
	children: ReactNode
	footer?: ReactNode
	onClose: () => void
	busy?: boolean
}) {
	const ref = useDialogLifecycle()
	const titleId = useId()
	return (
		<dialog
			ref={ref}
			aria-labelledby={titleId}
			aria-describedby={description ? `${titleId}-description` : undefined}
			onCancel={(event) => {
				event.preventDefault()
				if (!busy) onClose()
			}}
			className="admin-dialog m-auto w-[calc(100%_-_2rem)] max-w-2xl max-h-[90dvh] overflow-hidden rounded-2xl border border-border bg-surface p-0 text-foreground shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm"
		>
			<div className="flex max-h-[90dvh] flex-col">
				<div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-7 sm:py-5">
					<div className="min-w-0">
						<h2 id={titleId} className="text-lg font-semibold break-words">
							{title}
						</h2>
						{description && (
							<p
								id={`${titleId}-description`}
								className="mt-1.5 text-sm text-muted-foreground leading-relaxed"
							>
								{description}
							</p>
						)}
					</div>
					<button
						type="button"
						className={buttonVariants({ variant: 'icon' })}
						disabled={busy}
						aria-label="关闭对话框"
						onClick={onClose}
					>
						✕
					</button>
				</div>
				<div className="admin-dialog-body min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-7">
					{children}
				</div>
				{footer && (
					<div className="shrink-0 border-t border-border bg-surface px-5 py-4 sm:px-7">
						{footer}
					</div>
				)}
			</div>
		</dialog>
	)
}
export function EmptyState({
	title,
	description,
}: {
	title: string
	description: string
}) {
	return (
		<div className="rounded-xl border border-dashed border-border px-5 py-12 text-center">
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
		<div className="sm:col-span-2 sticky bottom-3 z-10 flex flex-wrap justify-between items-center gap-3 rounded-xl border border-border bg-surface/95 px-4 py-3 shadow-sm backdrop-blur">
			<span className="text-xs text-muted-foreground">
				{dirty ? '有未保存的修改' : '所有修改已保存'}
			</span>
			<button type="submit" className={primaryClass} disabled={!dirty || busy}>
				{busy ? '正在保存…' : label}
			</button>
		</div>
	)
}
