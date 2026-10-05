import { useCallback, useEffect, useState } from 'react'
import type { ThemeMode, UseThemeReturn } from '@/types'
import { usePublicCatalog } from './usePublicCatalog'

const STORAGE_KEY = 'inav-theme'
let themeTransitionTimer: number | undefined

function getSystemTheme(): 'light' | 'dark' {
	if (typeof window === 'undefined') return 'light'
	return window.matchMedia('(prefers-color-scheme: dark)').matches
		? 'dark'
		: 'light'
}

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
	if (mode === 'system') return getSystemTheme()
	return mode
}

function applyThemeToDom(resolved: 'light' | 'dark'): void {
	const root = document.documentElement
	if (
		root.dataset.theme !== resolved &&
		document.body.classList.contains('theme-ready')
	) {
		root.classList.add('theme-switching')
		window.clearTimeout(themeTransitionTimer)
		const cssDuration = getComputedStyle(root)
			.getPropertyValue('--duration-theme')
			.trim()
		const duration =
			Number.parseFloat(cssDuration) * (cssDuration.endsWith('ms') ? 1 : 1000)
		themeTransitionTimer = window.setTimeout(
			() => root.classList.remove('theme-switching'),
			duration,
		)
	}
	root.dataset.theme = resolved
	root.style.colorScheme = resolved
}

function getStoredMode(): ThemeMode | null {
	try {
		const stored = localStorage.getItem(STORAGE_KEY)
		if (stored === 'light' || stored === 'dark' || stored === 'system')
			return stored
		return null
	} catch {
		return null
	}
}

// 显式选择也保存 system，以覆盖站点的默认主题。
function saveMode(mode: ThemeMode): void {
	try {
		localStorage.setItem(STORAGE_KEY, mode)
	} catch {
		/* The selected theme still applies for this visit when storage is unavailable. */
	}
}

export function useTheme(): UseThemeReturn {
	const { settings } = usePublicCatalog()
	const [mode, setModeState] = useState<ThemeMode>(
		() => getStoredMode() ?? settings.defaultTheme,
	)
	const [systemTheme, setSystemTheme] = useState(getSystemTheme)
	useEffect(() => {
		if (!getStoredMode()) setModeState(settings.defaultTheme)
	}, [settings.defaultTheme])

	const resolvedTheme = mode === 'system' ? systemTheme : mode

	// system 模式下监听 OS 深色模式变化
	useEffect(() => {
		if (mode !== 'system') return
		const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
		const handleChange = () => {
			setSystemTheme(getSystemTheme())
		}
		handleChange()
		mediaQuery.addEventListener('change', handleChange)
		return () => mediaQuery.removeEventListener('change', handleChange)
	}, [mode])

	useEffect(() => {
		applyThemeToDom(resolvedTheme)
	}, [resolvedTheme])

	const setTheme = useCallback((newMode: ThemeMode) => {
		saveMode(newMode)
		setModeState(newMode)
	}, [])

	const toggleTheme = useCallback(() => {
		setModeState((prevMode) => {
			const prevResolved = resolveTheme(prevMode)
			const next = prevResolved === 'dark' ? 'light' : 'dark'
			saveMode(next)
			return next
		})
	}, [])

	return {
		mode,
		resolvedTheme,
		isDark: resolvedTheme === 'dark',
		setTheme,
		toggleTheme,
	}
}
