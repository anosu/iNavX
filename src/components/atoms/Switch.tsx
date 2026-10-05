import { useId } from 'react'

interface SwitchProps {
	checked: boolean
	onChange: (checked: boolean) => void
	label: string
	disabled?: boolean
	hint?: string
	className?: string
	labelHidden?: boolean
}

export function Switch({
	checked,
	onChange,
	label,
	disabled = false,
	hint,
	className = '',
	labelHidden = false,
}: SwitchProps) {
	const id = useId()
	return (
		<div
			className={`flex items-center justify-between gap-3 ${labelHidden ? '' : 'py-1.5'} ${className}`}
		>
			<div className={labelHidden ? 'sr-only' : 'min-w-0'}>
				<label
					htmlFor={id}
					className="cursor-pointer text-sm font-medium leading-5"
				>
					{label}
				</label>
				{hint && (
					<p
						id={`${id}-hint`}
						className="mt-1 text-xs leading-relaxed text-muted-foreground"
					>
						{hint}
					</p>
				)}
			</div>
			<button
				id={id}
				type="button"
				role="switch"
				aria-checked={checked}
				aria-describedby={hint ? `${id}-hint` : undefined}
				disabled={disabled}
				onClick={() => onChange(!checked)}
				className="inline-flex h-9 w-11 shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
			>
				<span
					aria-hidden="true"
					className={`inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-muted-foreground/30'}`}
				>
					<span
						className={`size-3.5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-4.5' : 'translate-x-0.5'}`}
					/>
				</span>
			</button>
		</div>
	)
}
