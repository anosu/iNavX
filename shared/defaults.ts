import type { Category, Engine, Settings } from './catalog.js'

export const DEFAULT_CATEGORIES: Category[] = [
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
].map((name, index) => ({ id: `category-${index}`, name, sortOrder: index }))
export const DEFAULT_ENGINES: Engine[] = [
	{
		id: 'bing',
		name: 'Bing',
		searchUrl: 'https://www.bing.com/search?q={q}',
		iconUrl: '',
		enabled: true,
	},
	{
		id: 'google',
		name: 'Google',
		searchUrl: 'https://www.google.com/search?q={q}',
		iconUrl: '',
		enabled: true,
	},
	{
		id: 'duckduckgo',
		name: 'DuckDuckGo',
		searchUrl: 'https://duckduckgo.com/?q={q}',
		iconUrl: '',
		enabled: true,
	},
	{
		id: 'github-search',
		name: 'GitHub',
		searchUrl: 'https://github.com/search?q={q}',
		iconUrl: '',
		enabled: true,
	},
]
export const DEFAULT_SETTINGS: Settings = {
	name: 'iNav',
	description: '轻量优雅的个人导航站，快速访问常用链接、书签管理与搜索',
	logoUrl: '',
	defaultTheme: 'system',
	features: {
		bookmarkImport: true,
		bookmarkExport: true,
		customSites: true,
		clearImported: true,
		hideBuiltin: true,
	},
	faviconTemplate: '',
	metadataProxyTemplate: '',
	remoteImagesEnabled: false,
	metadataFetchEnabled: false,
	backupIntervalHours: 24,
	backupKeep: 7,
	applicationsEnabled: true,
}
