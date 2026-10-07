import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { test as base, expect, type Page } from '@playwright/test'

interface App {
	origin: string
	dataDir: string
	backupDir: string
	start: () => Promise<void>
	stop: () => Promise<void>
	cli: (...args: string[]) => string
}

export const test = base.extend<{ app: App }>({
	// biome-ignore lint/correctness/noEmptyPattern: Playwright requires destructuring to declare a fixture with no dependencies.
	app: async ({}, use) => {
		const root = resolve('.')
		const binary = join(
			root,
			'bin',
			process.platform === 'win32' ? 'inav.exe' : 'inav',
		)
		const dataDir = await mkdtemp(join(tmpdir(), 'inav-e2e-'))
		const backupDir = join(dataDir, 'backups')
		const cleanup = async () => {
			if (
				dirname(resolve(dataDir)) !== resolve(tmpdir()) ||
				!basename(dataDir).startsWith('inav-e2e-')
			)
				throw new Error('Unexpected cleanup directory')
			await rm(dataDir, { recursive: true, force: true })
		}
		const listener = createServer()
		await new Promise<void>((resolve) =>
			listener.listen(0, '127.0.0.1', resolve),
		)
		const address = listener.address()
		if (!address || typeof address === 'string') throw new Error('No test port')
		const port = address.port
		await new Promise<void>((resolve, reject) =>
			listener.close((error) => (error ? reject(error) : resolve())),
		)
		const origin = `http://127.0.0.1:${port}`
		const env = {
			...process.env,
			DATA_DIR: dataDir,
			BACKUP_DIR: backupDir,
			HOST: '127.0.0.1',
			PORT: String(port),
			APP_ORIGIN: origin,
			PUBLIC_ORIGIN: '',
			TURNSTILE_SITE_KEY: '',
			TURNSTILE_SECRET_KEY: '',
			TRUSTED_PROXIES: '',
			SETUP_TOKEN: '',
		}
		let child: ChildProcess | undefined
		let logs = ''
		const start = async () => {
			logs = ''
			child = spawn(binary, ['serve'], {
				cwd: root,
				env,
				windowsHide: true,
				stdio: ['ignore', 'pipe', 'pipe'],
			})
			child.stdout?.on('data', (data) => {
				logs = (logs + String(data)).slice(-4000)
			})
			child.stderr?.on('data', (data) => {
				logs = (logs + String(data)).slice(-4000)
			})
			for (let i = 0; i < 100; i++) {
				if (child.exitCode !== null)
					throw new Error(`Test server exited: ${logs}`)
				try {
					if ((await fetch(`${origin}/api/health`)).ok) return
				} catch {
					/* Wait for the isolated server. */
				}
				await delay(100)
			}
			throw new Error(`Test server did not start: ${logs}`)
		}
		const stop = async () => {
			const running = child
			if (!running || running.exitCode !== null) return
			await new Promise<void>((resolve) => {
				running.once('exit', () => resolve())
				running.kill()
			})
			child = undefined
		}
		try {
			await start()
			const token = (
				await readFile(join(dataDir, '.setup-token'), 'utf8')
			).trim()
			const response = await fetch(`${origin}/api/auth/setup`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Origin: origin },
				body: JSON.stringify({
					username: 'review',
					password: 'test-only-password-123',
					token,
				}),
			})
			if (!response.ok)
				throw new Error('Could not initialize isolated administrator')
			await use({
				origin,
				dataDir,
				backupDir,
				start,
				stop,
				cli: (...args) =>
					execFileSync(binary, args, {
						cwd: root,
						env,
						encoding: 'utf8',
						windowsHide: true,
					}),
			})
		} finally {
			await stop()
			await cleanup()
		}
	},
	baseURL: async ({ app }, use) => use(app.origin),
})

export { expect }

export async function login(page: Page) {
	await page.goto('/admin')
	await page.getByRole('textbox', { name: '账号', exact: true }).fill('review')
	await page.getByLabel('密码（至少 12 个字符）').fill('test-only-password-123')
	await page.getByRole('button', { name: '登录', exact: true }).click()
	await expect(page.getByRole('button', { name: /退出 review/ })).toBeVisible()
}
