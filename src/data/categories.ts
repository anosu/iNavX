/** 站点分类列表 */
export const SITE_CATEGORIES = [
	'AI',
	'开源项目',
	'开发工具',
	'设计',
	'文档参考',
	'学习',
	'博客',
	'社区',
	'效率',
	'娱乐',
	'其他',
] as const

export type SiteCategory = string

/** 命令面板中分类匹配颜色 */
const CATEGORY_PALETTE = [
	'text-violet-500',
	'text-blue-500',
	'text-emerald-500',
	'text-pink-500',
	'text-amber-500',
	'text-cyan-500',
	'text-orange-500',
	'text-green-500',
	'text-teal-500',
	'text-rose-500',
	'text-indigo-500',
	'text-yellow-500',
] as const

/** 根据分类数组下标取颜色 */
export function getCategoryColor(category: string): string {
	const idx = (SITE_CATEGORIES as readonly string[]).indexOf(category)
	if (idx === -1) return 'text-gray-400'
	return CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length] ?? 'text-gray-400'
}
