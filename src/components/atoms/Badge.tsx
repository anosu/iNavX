import type { BadgeProps } from '@/types'

// variant → CSS class 映射
const variantClasses: Record<NonNullable<BadgeProps['variant']>, string> = {
	default: 'badge badge-default',
	primary: 'badge badge-primary',
	active: 'badge badge-active',
}

// 有 onClick → 渲染为 <button>（语义正确，键盘可聚焦）
// 无 onClick → 渲染为 <span>（纯展示，不占 tab 顺序）
export function Badge({
	children,
	variant = 'default',
	className = '',
	onClick,
	...rest
}: BadgeProps) {
	const baseClass = [variantClasses[variant], className]
		.filter(Boolean)
		.join(' ')

	if (onClick) {
		return (
			<button
				type="button"
				onClick={onClick}
				{...rest}
				className={[
					baseClass,
					'cursor-pointer',
					'transition-colors duration-100',
					'focus-visible:outline-none focus-visible:ring-2',
					'focus-visible:ring-primary focus-visible:ring-offset-1',
				].join(' ')}
			>
				{children}
			</button>
		)
	}

	return (
		<span className={baseClass} {...rest}>
			{children}
		</span>
	)
}
