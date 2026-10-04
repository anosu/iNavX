import type { InputProps } from '@/types'

export function Input({
	leftIcon,
	rightIcon,
	error,
	className = '',
	id,
	ref,
	...rest
}: InputProps) {
	const errorId = id ? `${id}-error` : undefined

	return (
		<div className={['relative w-full', className].filter(Boolean).join(' ')}>
			{leftIcon && (
				<div
					className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-muted-foreground"
					aria-hidden="true"
				>
					{leftIcon}
				</div>
			)}

			<input
				ref={ref}
				id={id}
				className={[
					'input-base',
					leftIcon ? 'pl-8' : 'pl-3',
					rightIcon ? 'pr-8' : 'pr-3',
					'py-1.5',
					'text-base sm:text-sm',
					error ? 'border-error focus:border-error focus:ring-error/20' : '',
				]
					.filter(Boolean)
					.join(' ')}
				aria-describedby={error ? errorId : undefined}
				aria-invalid={error ? true : undefined}
				{...rest}
			/>

			{rightIcon && (
				<div className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground">
					{rightIcon}
				</div>
			)}

			{error && (
				<p id={errorId} role="alert" className="mt-1 text-xs text-error">
					{error}
				</p>
			)}
		</div>
	)
}

Input.displayName = 'Input'
