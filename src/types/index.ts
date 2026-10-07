import type React from 'react'

// Personal categories keep display names, including legacy names.
// Public records also carry a stable categoryId managed by the backend.
export type SiteCategory = string

export interface Site {
	id: string
	name: string
	url: string
	description: string
	iconUrl?: string
	category: SiteCategory
	categoryId?: string
	pinned?: boolean
	tags?: string[]
	/** builtin = 公共目录（含静态内置） | imported = 个人导入 | custom = 个人添加 */
	source?: 'builtin' | 'imported' | 'custom'
	addedAt?: string
}

export interface BookmarkImportResult {
	handled?: boolean
	imported: number
	skipped: number
	sites: Site[]
}

export type ThemeMode = 'light' | 'dark' | 'system'

export interface UseThemeReturn {
	mode: ThemeMode
	resolvedTheme: 'light' | 'dark'
	isDark: boolean
	setTheme: (mode: ThemeMode) => void
	/** 在 light/dark 之间直接切换（不经过 system） */
	toggleTheme: () => void
}

/* ---- 组件 Props ---- */

export interface BadgeProps extends React.AriaAttributes {
	children: React.ReactNode
	variant?: 'default' | 'primary' | 'active'
	className?: string
	onClick?: () => void
	title?: string
}

export interface ButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: 'primary' | 'secondary' | 'ghost' | 'icon' | 'danger'
	size?: 'sm' | 'md' | 'lg'
	loading?: boolean
	children: React.ReactNode
}

export interface InputProps
	extends React.InputHTMLAttributes<HTMLInputElement> {
	leftIcon?: React.ReactNode
	rightIcon?: React.ReactNode
	error?: string
	ref?: React.Ref<HTMLInputElement>
}

export interface SearchBarProps {
	value: string
	onChange: (value: string) => void
	placeholder?: string
	inputRef?: React.RefObject<HTMLInputElement | null>
}

export interface CategoryFilterProps {
	categories: SiteCategory[]
	activeCategory: SiteCategory | null
	onChange: (category: SiteCategory | null) => void
}

export interface NavGridProps {
	sites: Site[]
	activeTag?: string | null
	onTagSelect?: (tag: string) => void
	searchQuery?: string
	onEdit?: (site: Site) => void
	onDelete?: (site: Site) => void
	onTogglePin?: (site: Site) => void
}

export interface SiteCardProps {
	site: Site
	activeTag?: string | null
	onTagSelect?: (tag: string) => void
	className?: string
	searchQuery?: string
	/** 搜索时显示的快捷键编号（1-9） */
	rank?: number
	onEdit?: (site: Site) => void
	onDelete?: (site: Site) => void
	onTogglePin?: (site: Site) => void
}
