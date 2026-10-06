import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

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

const env = { ...process.env }
if (windows && mode !== 'start') {
	const systemRoot = env.SystemRoot ?? env.SYSTEMROOT
	if (!systemRoot) throw new Error('Windows 环境缺少 SystemRoot')
	const paths = spawnSync(
		join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
		[
			'-NoProfile',
			'-NonInteractive',
			'-Command',
			"[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); [Environment]::ExpandEnvironmentVariables([Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')) | ConvertTo-Json -Compress",
		],
		{ encoding: 'utf8', windowsHide: true },
	)
	if (paths.error || paths.status !== 0) {
		throw new Error('无法读取 Windows 的系统 PATH', { cause: paths.error })
	}
	const registeredPath: unknown = JSON.parse(paths.stdout.trim())
	if (typeof registeredPath !== 'string') {
		throw new Error('Windows 系统 PATH 格式无效')
	}
	const currentPath = env.Path ?? env.PATH ?? ''
	for (const key of Object.keys(env)) {
		if (key.toLowerCase() === 'path') delete env[key]
	}
	env.PATH = `${currentPath};${registeredPath}`
}

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
