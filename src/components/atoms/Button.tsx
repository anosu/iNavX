import type { ButtonProps } from '@/types'

// variant/size → Tailwind class 映射表
const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
	primary:
		'bg-primary text-primary-foreground hover:bg-primary-hover active:opacity-80',
	secondary:
		'bg-transparent border border-border text-foreground hover:bg-muted active:bg-muted/80',
	ghost: 'bg-transparent text-foreground hover:bg-muted active:bg-muted/80',
	icon: 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/80',
	danger:
		'border border-error/30 bg-transparent text-error hover:bg-error-bg active:bg-error-bg/80',
}

const sizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
	sm: 'h-8 px-2.5 text-xs gap-1.5',
	md: 'h-9 px-3.5 text-sm gap-2',
	lg: 'h-11 px-5 text-base gap-2.5',
}

// icon variant 使用正方形尺寸（无水平 padding）
const iconSizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
	sm: 'h-8 w-8',
	md: 'h-9 w-9',
	lg: 'h-11 w-11',
}

/** 根据变体与尺寸计算按钮样式。 */
export function buttonVariants({
	variant = 'primary',
	size = 'md',
	className = '',
}: {
	variant?: ButtonProps['variant']
	size?: ButtonProps['size']
	className?: string
} = {}): string {
	const isIcon = variant === 'icon'
	const sizeClass = isIcon
		? iconSizeClasses[size ?? 'md']
		: sizeClasses[size ?? 'md']

	return [
		'inline-flex items-center justify-center',
		'rounded-md font-medium leading-none shrink-0 whitespace-nowrap',
		'transition-colors duration-100',
		'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
		'disabled:cursor-not-allowed disabled:opacity-50',
		variantClasses[variant ?? 'primary'],
		sizeClass,
		className,
	]
		.filter(Boolean)
		.join(' ')
}

export function Button({
	variant = 'primary',
	size = 'md',
	loading = false,
	disabled,
	children,
	className,
	...rest
}: ButtonProps) {
	return (
		<button
			type="button"
			disabled={disabled || loading}
			className={buttonVariants({ variant, size, className })}
			{...rest}
		>
			{loading ? (
				<>
					<svg
						className="h-4 w-4 animate-spin"
						viewBox="0 0 24 24"
						fill="none"
						aria-hidden="true"
					>
						<circle
							className="opacity-25"
							cx="12"
							cy="12"
							r="10"
							stroke="currentColor"
							strokeWidth="4"
						/>
						<path
							className="opacity-75"
							fill="currentColor"
							d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
						/>
					</svg>
					<span className="sr-only">加载中</span>
				</>
			) : (
				children
			)}
		</button>
	)
}
