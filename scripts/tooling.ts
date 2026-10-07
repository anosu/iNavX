import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

/** Preserve the active PATH and supplement registered Windows development tools. */
export function nativeToolEnv(): NodeJS.ProcessEnv {
	const env = { ...process.env }
	if (process.platform !== 'win32') return env
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
	if (paths.error || paths.status !== 0)
		throw new Error('无法读取 Windows 的系统 PATH', { cause: paths.error })
	const registeredPath: unknown = JSON.parse(paths.stdout.trim())
	if (typeof registeredPath !== 'string')
		throw new Error('Windows 系统 PATH 格式无效')
	const currentPath = env.Path ?? env.PATH ?? ''
	for (const key of Object.keys(env))
		if (key.toLowerCase() === 'path') delete env[key]
	env.PATH = `${currentPath};${registeredPath}`
	return env
}
