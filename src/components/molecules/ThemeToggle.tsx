import { Button } from '@/components/atoms/Button'
import { MoonIcon, SunIcon } from '@/components/atoms/Icons'
import { useTheme } from '@/hooks/useTheme'

export function ThemeToggle() {
	const { isDark, toggleTheme } = useTheme()
	return (
		<Button
			variant="icon"
			size="md"
			onClick={toggleTheme}
			aria-label={isDark ? '切换到亮色模式' : '切换到暗色模式'}
			aria-pressed={isDark}
			title={isDark ? '切换到亮色模式' : '切换到暗色模式'}
		>
			{isDark ? <MoonIcon size={16} /> : <SunIcon size={16} />}
		</Button>
	)
}
