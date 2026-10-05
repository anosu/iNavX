import { type ReactNode, useId } from 'react'
import { useDialogLifecycle } from '@/hooks/useDialogLifecycle'
import { buttonVariants } from './Button'
import { XIcon } from './Icons'

const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }

export function Dialog({
	title,
	description,
	children,
	footer,
	onClose,
	busy = false,
	size = 'md',
	role,
}: {
	title: string
	description?: ReactNode
	children?: ReactNode
	footer?: ReactNode
	onClose: () => void
	busy?: boolean
	size?: keyof typeof widths
	role?: 'dialog' | 'alertdialog'
}) {
	const ref = useDialogLifecycle()
	const titleId = useId()
	return (
		<dialog
			ref={ref}
			role={role}
			aria-labelledby={titleId}
			aria-describedby={description ? `${titleId}-description` : undefined}
			onCancel={(event) => {
				event.preventDefault()
				if (!busy) onClose()
			}}
			className={`dialog-panel ${widths[size]}`}
		>
			<div className="flex max-h-[calc(100dvh_-_2rem)] flex-col">
				<div className="dialog-header flex shrink-0 items-start justify-between gap-3">
					<div className="min-w-0">
						<h2 id={titleId} className="text-base font-semibold break-words">
							{title}
						</h2>
						{description && (
							<p
								id={`${titleId}-description`}
								className="mt-1 text-sm text-muted-foreground leading-relaxed break-words"
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
						<XIcon size={16} />
					</button>
				</div>
				{children && (
					<div className="dialog-body min-h-0 flex-1 overflow-y-auto overscroll-contain">
						{children}
					</div>
				)}
				{footer && <div className="dialog-footer shrink-0">{footer}</div>}
			</div>
		</dialog>
	)
}
