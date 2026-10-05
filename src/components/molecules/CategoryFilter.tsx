import { Badge } from '@/components/atoms/Badge'
import type { CategoryFilterProps, SiteCategory } from '@/types'

export function CategoryFilter({
	categories,
	activeCategory,
	onChange,
}: CategoryFilterProps) {
	// 点击已选中的分类 → 取消选中（回到"全部"）；否则选中该分类
	const handleSelect = (category: SiteCategory | null) => {
		onChange(category === activeCategory ? null : category)
	}

	return (
		<fieldset
			aria-label="按分类筛选"
			className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1"
		>
			<Badge
				variant={activeCategory === null ? 'active' : 'default'}
				onClick={() => handleSelect(null)}
				className="shrink-0 whitespace-nowrap badge-desktop-md"
				aria-pressed={activeCategory === null}
			>
				全部
			</Badge>

			{categories.map((category) => {
				const isActive = activeCategory === category
				return (
					<Badge
						key={category}
						title={category}
						variant={isActive ? 'active' : 'primary'}
						onClick={() => handleSelect(category)}
						className="max-w-48 shrink-0 whitespace-nowrap badge-desktop-md"
						aria-pressed={isActive}
					>
						<span className="truncate">{category}</span>
					</Badge>
				)
			})}
		</fieldset>
	)
}
