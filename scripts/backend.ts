import { spawnSync } from 'node:child_process'
import { nativeToolEnv } from './tooling'

const [mode, ...extraArgs] = process.argv.slice(2)
const windows = process.platform === 'win32'
const binary = windows ? './bin/inav.exe' : './bin/inav'
const commands: Record<string, string[]> = {
	dev: ['run', './backend'],
	build: ['build', '-trimpath', '-o', binary, './backend'],
	test: ['test', './backend'],
	start: [],
}
const args = mode && Object.hasOwn(commands, mode) ? commands[mode] : undefined
if (!args) throw new Error('后端命令必须是 dev、build、test 或 start')

const env = mode === 'start' ? { ...process.env } : nativeToolEnv()

if (mode !== 'start') await import('./export-runtime.ts')
const result = spawnSync(
	mode === 'start' ? binary : 'go',
	[...args, ...extraArgs],
	{
		env,
		stdio: 'inherit',
		windowsHide: true,
	},
)
if (result.error) {
	throw new Error(
		mode === 'start'
			? '后端无法启动，请先运行 bun run build:server'
			: 'Go 无法运行，请确认已安装 Go 和 C 编译器，参见 docs/deployment.md',
		{ cause: result.error },
	)
}
process.exit(result.status ?? 1)
