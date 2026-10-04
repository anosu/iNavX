import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getConnInfo } from '@hono/node-server/conninfo'
import { serveStatic } from '@hono/node-server/serve-static'
import { type Context, Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { secureHeaders } from 'hono/secure-headers'
import { ZodError, z } from 'zod'
import {
	applicationStatusSchema,
	categorySchema,
	credentialsSchema,
	engineSchema,
	migrationSchema,
	reviewSchema,
	settingsSchema,
	siteInputSchema,
	submissionSchema,
} from '../shared/catalog.js'
import { MAX_API_BODY_BYTES, MAX_SEARCH_ENGINES } from '../shared/limits.js'
import { clientAddress } from './client-address.js'
import type { ServerConfig } from './config.js'
import type { Store } from './db/index.js'
import { AppError } from './errors.js'
import { createApplications } from './modules/applications/index.js'
import { createAuth } from './modules/auth/index.js'
import { createBackups } from './modules/backups/index.js'
import { createCatalog } from './modules/catalog/index.js'

type Session = { tokenHash: string; csrf: string; expiresAt: number }
type Env = { Variables: { session: Session } }
const writeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;')

export function createApp(store: Store, config: ServerConfig) {
	const app = new Hono<Env>()
	let maintenance = false
	const catalog = createCatalog(store, () => {
		if (maintenance) throw new AppError(503, '正在恢复数据，请稍后重试')
	})
	const auth = createAuth(store, config)
	const applications = createApplications(store, catalog, () => {
		if (maintenance) throw new AppError(503, '正在恢复数据，请稍后重试')
	})
	const backups = createBackups(store, config, catalog, applications)
	async function readBody(c: Context<Env>) {
		const body: unknown = await c.req.json()
		if (maintenance) throw new AppError(503, '正在恢复数据，请稍后重试')
		return body
	}
	let authInFlight = 0
	const attempts = new Map<string, { count: number; expires: number }>()
	const submissions = new Map<string, { count: number; expires: number }>()
	let captchaInFlight = 0
	function requestAddress(c: Context<Env>) {
		let remote = 'local'
		try {
			remote = getConnInfo(c).remote.address || remote
		} catch {
			/* In-process requests. */
		}
		return clientAddress(
			remote,
			c.req.header('X-Real-IP'),
			config.trustedProxyIps,
		)
	}
	const isAllowedPublicOrigin = (origin?: string): origin is string =>
		Boolean(
			origin && (origin === config.origin || origin === config.publicOrigin),
		)
	app.use('*', secureHeaders({ xFrameOptions: 'DENY' }))
	app.use(
		'/api/*',
		bodyLimit({
			maxSize: MAX_API_BODY_BYTES,
			onError: (c) => c.json({ error: '文件或请求过大，最大 8 MB' }, 413),
		}),
	)
	app.use('/api/*', async (c, next) => {
		c.header('Cache-Control', 'no-store')
		if (writeMethods.has(c.req.method)) {
			if (maintenance) throw new AppError(503, '正在恢复数据，请稍后重试')
			if (
				c.req.path === '/api/public/applications'
					? !isAllowedPublicOrigin(c.req.header('Origin'))
					: c.req.header('Origin') !== config.origin
			)
				throw new AppError(403, '请求来源不受信任')
			if (!c.req.header('Content-Type')?.startsWith('application/json'))
				throw new AppError(400, '请使用 JSON 请求')
		}
		await next()
	})
	app.use('/api/admin/*', async (c, next) => {
		const session = auth.session(getCookie(c, 'inav_session'))
		if (!session) throw new AppError(401, '请先登录')
		if (
			writeMethods.has(c.req.method) &&
			c.req.header('X-CSRF-Token') !== session.csrf
		)
			throw new AppError(403, '会话校验失败，请重新登录')
		c.set('session', session)
		await next()
	})
	app.get('/api/health', (c) => {
		store.sqlite.prepare('SELECT 1').get()
		return c.json({ ok: true })
	})
	app.use(
		'/api/public/applications',
		bodyLimit({
			maxSize: 8192,
			onError: (c) => c.json({ error: '申请内容过长，最大 8 KB' }, 413),
		}),
	)
	app.use('/api/public/applications', async (c, next) => {
		const origin = c.req.header('Origin')
		if (isAllowedPublicOrigin(origin)) {
			c.header('Access-Control-Allow-Origin', origin)
			c.header('Vary', 'Origin')
		}
		await next()
	})
	app.options('/api/public/applications', (c) => {
		if (!isAllowedPublicOrigin(c.req.header('Origin')))
			throw new AppError(403, '请求来源不受信任')
		c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
		c.header('Access-Control-Allow-Headers', 'Content-Type')
		return c.body(null, 204)
	})
	app.get('/api/public/applications', (c) =>
		c.json({
			enabled: catalog.settings().applicationsEnabled,
			siteKey: config.turnstileSiteKey,
		}),
	)
	app.post('/api/public/applications', async (c) => {
		const origin = c.req.header('Origin')
		if (!isAllowedPublicOrigin(origin))
			throw new AppError(403, '请求来源不受信任')
		const key = requestAddress(c)
		for (const [address, attempt] of submissions)
			if (attempt.expires <= Date.now()) submissions.delete(address)
		const attempt = submissions.get(key) || {
			count: 0,
			expires: Date.now() + 15 * 60000,
		}
		if (attempt.count >= 5 || submissions.size >= 10000) {
			c.header(
				'Retry-After',
				String(Math.max(1, Math.ceil((attempt.expires - Date.now()) / 1000))),
			)
			throw new AppError(429, '提交过于频繁，请 15 分钟后再试')
		}
		attempt.count++
		submissions.set(key, attempt)
		const { website, captchaToken, ...input } = submissionSchema.parse(
			await readBody(c),
		)
		if (!catalog.settings().applicationsEnabled)
			throw new AppError(403, '当前暂停接收收录申请')
		if (website) return c.json({ received: true }, 202)
		if (config.turnstileSecretKey) {
			if (!captchaToken) throw new AppError(400, '请先完成验证码')
			if (captchaInFlight >= 5)
				throw new AppError(503, '验证服务繁忙，请稍后再试')
			captchaInFlight++
			try {
				let result: { success?: boolean; hostname?: string; action?: string }
				try {
					const response = await fetch(
						'https://challenges.cloudflare.com/turnstile/v0/siteverify',
						{
							method: 'POST',
							body: new URLSearchParams({
								secret: config.turnstileSecretKey,
								response: captchaToken,
							}),
							signal: AbortSignal.timeout(5000),
						},
					)
					if (!response.ok) throw new Error('verification unavailable')
					result = z
						.object({
							success: z.boolean(),
							hostname: z.string().optional(),
							action: z.string().optional(),
						})
						.parse(await response.json())
				} catch {
					throw new AppError(503, '验证码服务暂时不可用，请稍后重试')
				}
				if (
					!result.success ||
					result.hostname !== new URL(origin).hostname ||
					result.action !== 'submit'
				)
					throw new AppError(403, '验证码无效，请重新验证')
			} finally {
				captchaInFlight--
			}
		}
		applications.submit(input)
		return c.json({ received: true }, 202)
	})
	app.get('/api/public/catalog', (c) => {
		if (config.publicOrigin) c.header('Vary', 'Origin')
		if (config.publicOrigin && c.req.header('Origin') === config.publicOrigin) {
			c.header('Access-Control-Allow-Origin', config.publicOrigin)
		}
		const data = catalog.snapshot()
		const etag =
			'"catalog-' +
			createHash('sha256').update(JSON.stringify(data)).digest('hex') +
			'"'
		c.header('ETag', etag)
		c.header('Cache-Control', 'public, max-age=0, must-revalidate')
		if (c.req.header('If-None-Match') === etag) return c.body(null, 304)
		return c.json(data)
	})
	app.get('/api/auth/status', (c) => {
		const session = auth.session(getCookie(c, 'inav_session'))
		return c.json({
			initialized: Boolean(auth.account()),
			authenticated: Boolean(session),
			username: session ? auth.account()?.username : undefined,
			csrf: session?.csrf,
		})
	})
	app.post('/api/auth/:action', async (c) => {
		const action = c.req.param('action')
		if (action === 'logout') {
			const session = auth.session(getCookie(c, 'inav_session'))
			if (!session || c.req.header('X-CSRF-Token') !== session.csrf)
				throw new AppError(403, '会话校验失败')
			auth.logout(session.tokenHash)
			deleteCookie(c, 'inav_session', { path: '/' })
			return c.json({ ok: true })
		}
		if (action !== 'setup' && action !== 'login')
			throw new AppError(404, '接口不存在')
		const key = requestAddress(c)
		for (const [address, item] of attempts)
			if (item.expires <= Date.now()) attempts.delete(address)
		const attempt = attempts.get(key) || {
			count: 0,
			expires: Date.now() + 15 * 60000,
		}
		if (attempt.count >= 10 || authInFlight >= 2 || attempts.size > 10000)
			throw new AppError(429, '登录尝试过多，请稍后重试')
		attempt.count++
		attempts.set(key, attempt)
		authInFlight++
		try {
			const raw = await readBody(c)
			const value =
				action === 'setup'
					? credentialsSchema
							.extend({ token: z.string().min(1).max(256) })
							.parse(raw)
					: credentialsSchema.parse(raw)
			const session =
				action === 'setup'
					? await auth.setup(
							value.username,
							value.password,
							z.string().parse('token' in value ? value.token : undefined),
						)
					: await auth.login(value.username, value.password)
			setCookie(c, 'inav_session', session.token, {
				httpOnly: true,
				secure: config.secureCookies,
				sameSite: 'Lax',
				path: '/',
				maxAge: 7 * 24 * 3600,
			})
			attempts.delete(key)
			return c.json({ csrf: session.csrf, username: value.username })
		} finally {
			authInFlight--
		}
	})
	app.get('/api/admin/catalog', (c) => c.json(catalog.snapshot(true)))
	app.get('/api/admin/applications', (c) => {
		const status = c.req.query('status')
		const query = z
			.string()
			.max(100)
			.parse(c.req.query('q') || '')
		const page = z.coerce
			.number()
			.int()
			.min(1)
			.max(10000)
			.parse(c.req.query('page') || '1')
		return c.json(
			applications.list(
				status ? applicationStatusSchema.parse(status) : undefined,
				query,
				page,
			),
		)
	})
	app.post('/api/admin/applications/:id/review', async (c) =>
		c.json(
			applications.review(
				c.req.param('id'),
				reviewSchema.parse(await readBody(c)),
			),
		),
	)
	app.post('/api/admin/sites', async (c) =>
		c.json(catalog.saveSite(siteInputSchema.parse(await readBody(c))), 201),
	)
	app.put('/api/admin/sites/:id', async (c) =>
		c.json(
			catalog.saveSite(
				siteInputSchema.parse(await readBody(c)),
				c.req.param('id'),
			),
		),
	)
	app.delete('/api/admin/sites/:id', (c) => {
		catalog.trashSite(c.req.param('id'))
		return c.json({ ok: true })
	})
	app.post('/api/admin/sites/:id/restore', (c) => {
		catalog.restoreSite(c.req.param('id'))
		return c.json({ ok: true })
	})
	app.post('/api/admin/categories', async (c) =>
		c.json(
			catalog.saveCategory(
				categorySchema.omit({ id: true }).parse(await readBody(c)),
			),
			201,
		),
	)
	app.put('/api/admin/categories/:id', async (c) =>
		c.json(
			catalog.saveCategory(
				categorySchema.omit({ id: true }).parse(await readBody(c)),
				c.req.param('id'),
			),
		),
	)
	app.delete('/api/admin/categories/:id', async (c) => {
		const { targetId } = z
			.object({ targetId: z.string().optional() })
			.strict()
			.parse(await readBody(c))
		catalog.removeCategory(c.req.param('id'), targetId)
		return c.json({ ok: true })
	})
	app.put('/api/admin/settings', async (c) => {
		catalog.saveSettings(settingsSchema.parse(await readBody(c)))
		return c.json({ ok: true })
	})
	app.put('/api/admin/engines', async (c) => {
		catalog.saveEngines(
			z
				.array(engineSchema)
				.max(MAX_SEARCH_ENGINES)
				.parse(await readBody(c)),
		)
		return c.json({ ok: true })
	})
	app.get('/api/admin/export', (c) => {
		c.header('Content-Disposition', 'attachment; filename="inav-catalog.json"')
		return c.json(backups.exportPackage())
	})
	app.get('/api/admin/backups', async (c) => c.json(await backups.list()))
	app.post('/api/admin/backups', async (c) =>
		c.json({ name: await backups.create() }, 201),
	)
	app.get('/api/admin/backups/:name', async (c) => {
		const name = c.req.param('name')
		const file = await backups.download(name)
		c.header('Content-Disposition', `attachment; filename="${name}"`)
		c.header('Content-Type', 'application/vnd.sqlite3')
		return c.body(new Uint8Array(file))
	})
	app.post('/api/admin/import/preview', async (c) => {
		const value = migrationSchema.parse(await readBody(c))
		return c.json({
			categories: value.data.categories.length,
			sites: value.data.sites.filter((s) => !s.deletedAt).length,
			trash: value.data.sites.filter((s) => s.deletedAt).length,
			engines: value.data.engines.length,
			applications: value.applications.length,
			revision: catalog.revision(),
		})
	})
	app.post('/api/admin/import', async (c) => {
		const value = z
			.object({
				package: migrationSchema,
				mode: z.enum(['merge', 'replace']),
				revision: z.string(),
				confirmation: z.string().optional(),
			})
			.strict()
			.parse(await readBody(c))
		if (value.mode === 'replace' && value.confirmation !== 'REPLACE')
			throw new AppError(400, '请确认覆盖恢复')
		if (maintenance) throw new AppError(503, '正在恢复数据，请稍后重试')
		if (value.revision !== catalog.revision())
			throw new AppError(409, '数据已变化，请重新预览')
		maintenance = true
		try {
			return c.json(await backups.importPackage(value.package, value.mode))
		} finally {
			maintenance = false
		}
	})
	app.all('/api/*', (c) => c.json({ error: '接口不存在' }, 404))
	app.get(
		'/assets/*',
		async (c, next) => {
			c.header('Cache-Control', 'public, max-age=31536000, immutable')
			await next()
		},
		serveStatic({ root: config.distDir }),
		(c) => {
			c.header('Cache-Control', 'no-store')
			return c.text('资源不存在', 404)
		},
	)
	const publicOrigin = config.publicOrigin || config.origin
	app.get('/robots.txt', (c) => {
		c.header('Cache-Control', 'no-cache')
		return c.text(
			`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /submit\nSitemap: ${publicOrigin}/sitemap.xml\n`,
		)
	})
	app.get('/sitemap.xml', (c) => {
		c.header('Content-Type', 'application/xml; charset=utf-8')
		c.header('Cache-Control', 'no-cache')
		const urls = ['/', '/about']
			.map((path) => `<url><loc>${escapeHtml(publicOrigin + path)}</loc></url>`)
			.join('')
		return c.body(
			`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
		)
	})
	app.get('/favicon.svg', serveStatic({ root: config.distDir }))
	app.get('*', (c) => {
		let html: string
		try {
			html = readFileSync(resolve(config.distDir, 'index.html'), 'utf8')
		} catch {
			return c.text(
				'前端尚未构建，请运行 bun run build；开发时使用 Vite 页面。',
				503,
			)
		}
		const settings = catalog.settings()
		html = html.replace(
			/<title>[\s\S]*?<\/title>/,
			() => `<title>${escapeHtml(settings.name)}</title>`,
		)
		const values: Record<string, string> = {
			description: settings.description,
			author: settings.name,
			'og:title': settings.name,
			'og:site_name': settings.name,
			'og:description': settings.description,
			'twitter:title': settings.name,
			'twitter:description': settings.description,
		}
		html = html.replace(
			/<meta\s+(?:name|property)="([^"]+)"\s+content="[^"]*"\s*\/>/g,
			(tag, name: string) =>
				values[name] !== undefined
					? tag.replace(
							/content="[^"]*"/,
							() => `content="${escapeHtml(values[name])}"`,
						)
					: tag,
		)
		const boot = JSON.stringify(settings).replaceAll('<', '\\u003c')
		html = html.replace(
			'<head>',
			() =>
				'<head><script>window.__INAV_BACKEND__=true;window.__INAV_SETTINGS__=' +
				boot +
				';</script>',
		)
		c.header('Cache-Control', 'no-cache, must-revalidate')
		if (c.req.path.startsWith('/admin'))
			c.header('X-Robots-Tag', 'noindex, nofollow')
		return c.html(html)
	})
	app.onError((error, c) => {
		if (error instanceof AppError)
			return c.json({ error: error.message }, error.status)
		if (error instanceof ZodError)
			return c.json(
				{ error: error.issues.map((issue) => issue.message).join('；') },
				400,
			)
		if (error instanceof SyntaxError)
			return c.json({ error: 'JSON 格式不正确' }, 400)
		if (error.message.includes('UNIQUE constraint failed'))
			return c.json({ error: '内容重复，请刷新后重试' }, 409)
		console.error(error)
		return c.json({ error: '服务处理失败' }, 500)
	})
	return { app, auth, backups, catalog, applications }
}
