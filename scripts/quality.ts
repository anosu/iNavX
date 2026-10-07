import { spawnSync } from 'node:child_process'
import { lstatSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { nativeToolEnv } from './tooling'

const mode = process.argv[2]
if (
	![
		'format',
		'format:check',
		'lint',
		'lint:fix',
		'lint:go',
		'lint:shell',
	].includes(mode)
)
	throw new Error('未知检查模式')
const env = nativeToolEnv()
function run(command: string, args: string[], capture = false): string {
	const result = spawnSync(command, args, {
		env,
		windowsHide: true,
		encoding: 'utf8',
		stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
	})
	if (result.error)
		throw new Error(
			`无法运行 ${command}；请安装所需工具，参见 docs/code-quality.md`,
			{ cause: result.error },
		)
	if (result.status !== 0) process.exit(result.status ?? 1)
	return result.stdout || ''
}
function files(root: string, suffix: string): string[] {
	return readdirSync(root, { withFileTypes: true })
		.flatMap((entry) => {
			const path = join(root, entry.name)
			return entry.isDirectory()
				? files(path, suffix)
				: entry.isFile() && path.endsWith(suffix)
					? [path]
					: []
		})
		.sort()
}
const goFiles = files('backend', '.go')
const shellFiles = [...files('scripts', '.sh'), ...files('tests', '.sh')]
function biome(...args: string[]) {
	run(process.execPath, ['x', '--no-install', 'biome', ...args, '.'])
}
function goFormat(write: boolean) {
	if (write) run('gofmt', ['-w', ...goFiles])
	else {
		const changed = run('gofmt', ['-l', ...goFiles], true).trim()
		if (changed) {
			console.error(`Go 格式不符合规范，请运行 bun run format：\n${changed}`)
			process.exit(1)
		}
	}
}
function textFormat(write: boolean) {
	// Full Markdown/YAML/SQL layout stays with EditorConfig and review. Enforce basic text hygiene.
	const tracked = run(
		'git',
		[
			'ls-files',
			'-z',
			'--',
			'*.md',
			'*.yaml',
			'*.yml',
			'*.sql',
			'.editorconfig',
			'.gitattributes',
			'.gitignore',
			'.dockerignore',
			'Dockerfile',
		],
		true,
	)
		.split('\0')
		.filter(Boolean)
	const changed: string[] = []
	for (const path of new Set([...tracked, ...shellFiles])) {
		if (path.split('/').includes('.agents')) continue
		// Published migration bytes are checksummed in existing databases.
		if (path.startsWith('migrations/')) continue
		if (!lstatSync(path, { throwIfNoEntry: false })?.isFile()) continue
		const original = readFileSync(path, 'utf8')
		let formatted = original.replace(/\r\n?/g, '\n')
		if (!path.endsWith('.md')) formatted = formatted.replace(/[\t ]+$/gm, '')
		if (formatted && !formatted.endsWith('\n')) formatted += '\n'
		if (formatted === original) continue
		if (write) writeFileSync(path, formatted)
		else changed.push(path)
	}
	if (changed.length) {
		console.error(
			`文本格式不符合规范，请运行 bun run format：\n${changed.join('\n')}`,
		)
		process.exit(1)
	}
}
function shellLint() {
	run('shellcheck', ['--severity=style', ...shellFiles])
}

switch (mode) {
	case 'format':
		biome('format', '--write')
		goFormat(true)
		textFormat(true)
		break
	case 'format:check':
		biome('format', '--error-on-warnings')
		goFormat(false)
		textFormat(false)
		break
	case 'lint:go':
		goFormat(false)
		run('go', ['vet', './backend'])
		break
	case 'lint:shell':
		shellLint()
		break
	case 'lint:fix':
		goFormat(true)
		textFormat(true)
		biome('check', '--write', '--error-on-warnings')
		run('go', ['vet', './backend'])
		shellLint()
		break
	case 'lint':
		biome('check', '--error-on-warnings')
		goFormat(false)
		textFormat(false)
		run('go', ['vet', './backend'])
		shellLint()
		break
}
