import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { type TestContext, test } from 'node:test'
import {
	type Application,
	type ApplicationList,
	type Catalog,
	migrationSchema,
	type SiteInput,
} from '../shared/catalog.js'
import { createApp } from './app.js'
import { clientAddress } from './client-address.js'
import { loadConfig } from './config.js'
import { openDatabase } from './db/index.js'

function fixture(t: TestContext) {
	const root = mkdtempSync(join(tmpdir(), 'inav-test-'))
	const config = {
		...loadConfig(),
		origin: 'http://localhost:3000',
		secureCookies: false,
		dataDir: join(root, 'data'),
		backupDir: join(root, 'backups'),
		databasePath: join(root, 'data/inav.sqlite'),
	}
	const store = openDatabase(config)
	const service = createApp(store, config)
	t.after(async () => {
		await service.backups.whenIdle()
		if (store.sqlite.open) store.sqlite.close()
		if (
			dirname(resolve(root)) !== resolve(tmpdir()) ||
			!basename(root).startsWith('inav-test-')
		)
			throw new Error('拒绝清理非测试目录')
		rmSync(root, { recursive: true, force: true })
	})
	let cookie = ''
	let csrf = ''
	const call = (
		path: string,
		method = 'GET',
		value?: unknown,
		extra?: Record<string, string>,
	) =>
		service.app.request(`/api/${path}`, {
			method,
			headers: {
				Origin: config.origin,
				...(value !== undefined ? { 'Content-Type': 'application/json' } : {}),
				...(cookie ? { Cookie: cookie } : {}),
				...(csrf ? { 'X-CSRF-Token': csrf } : {}),
				...extra,
			},
			body: value === undefined ? undefined : JSON.stringify(value),
		})
	async function setup() {
		const response = await call('auth/setup', 'POST', {
			username: 'owner',
			password: 'test-password-long-enough',
			token: service.auth.setupToken(),
		})
		assert.equal(response.status, 200)
		cookie = response.headers.get('set-cookie')?.split(';')[0] || ''
		csrf = ((await response.json()) as { csrf: string }).csrf
		assert.ok(cookie)
		return { cookie, csrf }
	}
	return { ...service, store, config, call, setup }
}

test('public crawler information uses the configured origin rather than a demo domain or request host', async (t) => {
	const f = fixture(t)
	for (const publicOrigin of ['', 'https://public.example.test']) {
		const config = {
			...f.config,
			origin: 'https://nav.example.test',
			publicOrigin,
		}
		const origin = publicOrigin || config.origin
		const { app } = createApp(f.store, config)
		const robots = await app.request('/robots.txt', {
			headers: { Host: 'untrusted.test' },
		})
		assert.equal(robots.status, 200)
		assert.ok((await robots.text()).includes(`Sitemap: ${origin}/sitemap.xml`))
		const sitemap = await app.request('/sitemap.xml')
		assert.equal(
			sitemap.headers.get('content-type'),
			'application/xml; charset=utf-8',
		)
		assert.equal(sitemap.headers.get('cache-control'), 'no-cache')
		assert.equal(
			await sitemap.text(),
			`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/</loc></url><url><loc>${origin}/about</loc></url></urlset>`,
		)
	}
})

test('administrator can configure local resources and independently toggle optional external services', async (t) => {
	const f = fixture(t)
	await f.setup()
	const original = f.catalog.settings()
	assert.equal(original.remoteImagesEnabled, false)
	assert.equal(original.metadataFetchEnabled, false)
	const configured = {
		...original,
		logoUrl: '/favicon.svg',
		faviconTemplate: '/icons/{domain}.png',
		metadataProxyTemplate: 'https://metadata.example.test/?url={url}',
		metadataFetchEnabled: true,
	}
	assert.equal((await f.call('admin/settings', 'PUT', configured)).status, 200)
	const publicCatalog = (await (
		await f.call('public/catalog')
	).json()) as Catalog
	assert.equal(publicCatalog.settings.metadataFetchEnabled, true)
	assert.equal(publicCatalog.settings.remoteImagesEnabled, false)
	assert.equal(
		publicCatalog.settings.faviconTemplate,
		configured.faviconTemplate,
	)
	assert.equal(
		(
			await f.call('admin/settings', 'PUT', {
				...configured,
				remoteImagesEnabled: true,
				metadataFetchEnabled: false,
			})
		).status,
		200,
	)
	assert.equal(f.catalog.settings().remoteImagesEnabled, true)
	assert.equal(f.catalog.settings().metadataFetchEnabled, false)
	assert.equal(
		f.catalog.settings().metadataProxyTemplate,
		configured.metadataProxyTemplate,
	)
})

test('initialization preserves every public ID and never reseeds an edited database', async (t) => {
	const f = fixture(t)
	const seed = JSON.parse(readFileSync(f.config.seedPath, 'utf8')) as {
		id: string
	}[]
	assert.deepEqual(
		f.catalog.snapshot(true).sites.map((site) => site.id),
		seed.map((site) => site.id),
	)
	assert.ok(
		f.catalog.snapshot(true).sites.find((site) => site.id === 'deepseek-docs')
			?.deletedAt,
	)
	await f.setup()
	const original = f.catalog.snapshot().sites[0]
	const {
		id: _id,
		createdAt: _createdAt,
		updatedAt: _updatedAt,
		deletedAt: _deletedAt,
		...input
	} = original
	assert.equal(
		(
			await f.call(`admin/sites/${original.id}`, 'PUT', {
				...input,
				name: '后台已修改',
			})
		).status,
		200,
	)
	f.store.sqlite.close()
	const reopened = openDatabase(f.config)
	try {
		assert.equal(
			createApp(reopened, f.config).catalog.snapshot().sites[0].name,
			'后台已修改',
		)
	} finally {
		reopened.sqlite.close()
	}
})

test('admin mutations require a session, trusted origin and CSRF; password reset revokes sessions', async (t) => {
	const f = fixture(t)
	assert.equal((await f.call('admin/catalog')).status, 401)
	assert.equal(
		(
			await f.call('auth/setup', 'POST', {
				username: 'owner',
				password: 'test-password-long-enough',
				token: 'wrong',
			})
		).status,
		403,
	)
	await f.setup()
	assert.equal(
		(
			await f.call('admin/settings', 'PUT', f.catalog.snapshot().settings, {
				Origin: 'https://untrusted.example',
			})
		).status,
		403,
	)
	assert.equal(
		(
			await f.call('admin/settings', 'PUT', f.catalog.snapshot().settings, {
				'X-CSRF-Token': '',
			})
		).status,
		403,
	)
	assert.equal(
		(
			await f.call('auth/setup', 'POST', {
				username: 'other',
				password: 'another-long-password',
				token: 'wrong',
			})
		).status,
		409,
	)
	await f.auth.reset('new-test-password-long-enough')
	assert.equal((await f.call('admin/catalog')).status, 401)
	assert.equal(
		(
			await f.call('auth/login', 'POST', {
				username: 'owner',
				password: 'test-password-long-enough',
			})
		).status,
		401,
	)
	assert.equal(
		(
			await f.call('auth/login', 'POST', {
				username: 'owner',
				password: 'new-test-password-long-enough',
			})
		).status,
		200,
	)
})

test('site conflicts, recycle-bin restore and category migration maintain relationships', async (t) => {
	const f = fixture(t)
	await f.setup()
	const oldCategory = f.catalog.snapshot().categories[0]
	const newCategoryResponse = await f.call('admin/categories', 'POST', {
		name: '临时分类',
		sortOrder: 20,
	})
	const category = (await newCategoryResponse.json()) as { id: string }
	const input: SiteInput = {
		name: 'Example',
		url: 'https://example.test/Path?mode=A',
		description: 'desc',
		categoryId: category.id,
		iconUrl: '',
		pinned: false,
		tags: [],
		sortOrder: 1,
	}
	const created = await f.call('admin/sites', 'POST', input)
	assert.equal(created.status, 201)
	const site = (await created.json()) as { id: string }
	assert.equal(
		(
			await f.call('admin/sites', 'POST', {
				...input,
				url: 'https://EXAMPLE.test:443/Path?mode=A',
			})
		).status,
		409,
	)
	assert.equal(
		(
			await f.call('admin/sites', 'POST', {
				...input,
				url: 'https://example.test/path?mode=A',
			})
		).status,
		201,
	)
	assert.equal(
		(await f.call(`admin/categories/${category.id}`, 'DELETE', {})).status,
		409,
	)
	assert.equal(
		(await f.call(`admin/sites/${site.id}`, 'DELETE', {})).status,
		200,
	)
	assert.ok(!f.catalog.snapshot().sites.some((row) => row.id === site.id))
	assert.equal((await f.call('admin/sites', 'POST', input)).status, 201)
	assert.equal(
		(await f.call(`admin/sites/${site.id}/restore`, 'POST', {})).status,
		409,
	)
	assert.equal(
		(
			await f.call(`admin/categories/${category.id}`, 'DELETE', {
				targetId: oldCategory.id,
			})
		).status,
		200,
	)
	assert.ok(
		f.catalog
			.snapshot(true)
			.sites.filter((row) => row.url.startsWith('https://example.test'))
			.every((row) => row.categoryId === oldCategory.id),
	)
	assert.equal(
		(
			await f.call('admin/sites', 'POST', {
				...input,
				url: 'javascript:alert(1)',
			})
		).status,
		400,
	)
})

test('public cache validation and initial HTML metadata reflect saved settings safely', async (t) => {
	const f = fixture(t)
	await f.setup()
	const first = await f.call('public/catalog')
	assert.equal(
		(
			await f.call('public/catalog', 'GET', undefined, {
				'If-None-Match': first.headers.get('etag') || '',
			})
		).status,
		304,
	)
	const settings = {
		...f.catalog.snapshot().settings,
		name: 'Nav <script>alert(1)</script>',
		description: 'Description " <value>',
		defaultTheme: 'dark',
	}
	assert.equal((await f.call('admin/settings', 'PUT', settings)).status, 200)
	assert.equal(
		(
			await f.call('public/catalog', 'GET', undefined, {
				'If-None-Match': first.headers.get('etag') || '',
			})
		).status,
		200,
	)
	const html = await f.app.request('/')
	assert.equal(html.status, 200)
	const text = await html.text()
	assert.ok(
		text.includes('<title>Nav &lt;script&gt;alert(1)&lt;/script&gt;</title>'),
	)
	assert.ok(!text.includes('Nav <script>alert(1)</script>'))
	assert.ok(text.includes('window.__INAV_BACKEND__=true'))
	assert.ok(text.includes('"defaultTheme":"dark"'))
})

test('missing assets return uncached 404 responses instead of the SPA document', async (t) => {
	const f = fixture(t)
	const response = await f.app.request('/assets/missing-review-script.js')
	assert.equal(response.status, 404)
	assert.equal(response.headers.get('cache-control'), 'no-store')
	assert.ok(!(await response.text()).includes('<html'))
})

test('public catalog always varies by origin when separated hosting is enabled', async (t) => {
	const f = fixture(t)
	const { app } = createApp(f.store, {
		...f.config,
		publicOrigin: 'https://frontend.test',
	})
	const plain = await app.request('/api/public/catalog')
	assert.equal(plain.headers.get('vary'), 'Origin')
	assert.equal(plain.headers.get('access-control-allow-origin'), null)
	const allowed = await app.request('/api/public/catalog', {
		headers: { Origin: 'https://frontend.test' },
	})
	assert.equal(
		allowed.headers.get('access-control-allow-origin'),
		'https://frontend.test',
	)
	assert.equal(allowed.headers.get('vary'), 'Origin')
})

test('login limits separate clients only when X-Real-IP comes from a trusted proxy', async (t) => {
	const f = fixture(t)
	await f.setup()
	const { app } = createApp(f.store, {
		...f.config,
		trustedProxyIps: ['172.18.0.2'],
	})
	const login = (remote: string, forwarded: string, valid = false) =>
		app.request(
			'/api/auth/login',
			{
				method: 'POST',
				headers: {
					Origin: f.config.origin,
					'Content-Type': 'application/json',
					'X-Real-IP': forwarded,
				},
				body: JSON.stringify({
					username: 'owner',
					password: valid ? 'test-password-long-enough' : 'incorrect-password',
				}),
			},
			{ incoming: { socket: { remoteAddress: remote } } },
		)
	for (let i = 0; i < 10; i++)
		assert.equal((await login('172.18.0.2', '203.0.113.1')).status, 401)
	assert.equal((await login('172.18.0.2', '203.0.113.1', true)).status, 429)
	assert.equal((await login('172.18.0.2', '203.0.113.2', true)).status, 200)
	for (let i = 0; i < 10; i++)
		assert.equal((await login('203.0.113.9', `198.51.100.${i}`)).status, 401)
	assert.equal((await login('203.0.113.9', '198.51.100.100', true)).status, 429)
})

test('portable merge preserves prototype-shaped site IDs and their application links', async (t) => {
	const f = fixture(t)
	await f.setup()
	const original = f.backups.exportPackage()
	const site = {
		...original.data.sites[0],
		id: '__proto__',
		url: 'https://prototype-id.test',
	}
	const value = migrationSchema.parse({
		...original,
		data: { ...original.data, sites: [site] },
		applications: [
			{
				id: 'prototype-application',
				name: site.name,
				url: site.url,
				description: '',
				suggestedCategory: '',
				status: 'approved',
				siteId: site.id,
				reviewNote: '',
				createdAt: site.createdAt,
				updatedAt: site.updatedAt,
				reviewedAt: site.updatedAt,
			},
		],
	})
	const response = await f.call('admin/import', 'POST', {
		package: value,
		mode: 'merge',
		revision: f.catalog.snapshot().revision,
	})
	assert.equal(response.status, 200)
	assert.equal(f.applications.all()[0].siteId, '__proto__')
})

test('portable restore previews changes, checks revisions and keeps administrator credentials', async (t) => {
	const f = fixture(t)
	await f.setup()
	const original = migrationSchema.parse(f.backups.exportPackage())
	assert.ok(!JSON.stringify(original).includes('passwordHash'))
	assert.ok(!JSON.stringify(original).includes('tokenHash'))
	const value = structuredClone(original)
	value.data.settings.name = '恢复后的站点'
	value.data.sites[0].name = '恢复后的条目'
	const preview = await f.call('admin/import/preview', 'POST', value)
	assert.equal(preview.status, 200)
	const { revision } = (await preview.json()) as { revision: string }
	assert.equal(
		(
			await f.call('admin/import', 'POST', {
				package: value,
				mode: 'replace',
				revision,
			})
		).status,
		400,
	)
	assert.equal(
		(
			await f.call('admin/import', 'POST', {
				package: value,
				mode: 'replace',
				revision: 'stale',
				confirmation: 'REPLACE',
			})
		).status,
		409,
	)
	assert.equal(
		(
			await f.call('admin/import', 'POST', {
				package: value,
				mode: 'replace',
				revision,
				confirmation: 'REPLACE',
			})
		).status,
		200,
	)
	assert.equal(f.catalog.snapshot().settings.name, value.data.settings.name)
	assert.equal((await f.call('admin/catalog')).status, 200)
	assert.equal(f.auth.account()?.username, 'owner')
	assert.equal((await f.backups.list()).length, 1)
	const invalid = structuredClone(value)
	invalid.data.sites[0].categoryId = 'missing'
	assert.equal(
		(await f.call('admin/import/preview', 'POST', invalid)).status,
		400,
	)
	const merge = await f.call('admin/import', 'POST', {
		package: original,
		mode: 'merge',
		revision: f.catalog.snapshot().revision,
	})
	assert.equal(merge.status, 200)
	const report = (await merge.json()) as {
		skipped: number
		conflicts: string[]
	}
	assert.equal(report.skipped, original.data.sites.length)
	assert.ok(report.conflicts.length > 0)
})

test('restore blocks competing imports and catalog writes while its backup is in progress', async (t) => {
	const f = fixture(t)
	await f.setup()
	const value = f.backups.exportPackage()
	let release: () => void = () => undefined
	let started: () => void = () => undefined
	const gate = new Promise<void>((resolveValue) => {
		release = resolveValue
	})
	const entered = new Promise<void>((resolveValue) => {
		started = resolveValue
	})
	const backup = f.store.sqlite.backup.bind(f.store.sqlite)
	f.store.sqlite.backup = async (destination, options) => {
		started()
		await gate
		return backup(destination, options)
	}
	const importing = f.call('admin/import', 'POST', {
		package: value,
		mode: 'replace',
		revision: value.data.revision,
		confirmation: 'REPLACE',
	})
	try {
		await entered
		assert.equal(
			(await f.call('admin/settings', 'PUT', value.data.settings)).status,
			503,
		)
		assert.equal(
			(
				await f.call('admin/import', 'POST', {
					package: value,
					mode: 'replace',
					revision: value.data.revision,
					confirmation: 'REPLACE',
				})
			).status,
			503,
		)
		assert.throws(
			() => f.catalog.saveSettings(value.data.settings),
			/正在恢复数据/,
		)
		assert.equal(
			(
				await f.call('public/applications', 'POST', {
					name: 'During restore',
					url: 'https://during-restore.test',
				})
			).status,
			503,
		)
		assert.throws(
			() =>
				f.applications.submit({
					name: 'During restore',
					url: 'https://during-restore.test',
					description: '',
					suggestedCategory: '',
				}),
			/正在恢复数据/,
		)
	} finally {
		release()
	}
	assert.equal((await importing).status, 200)
	assert.equal(
		(await f.call('admin/settings', 'PUT', value.data.settings)).status,
		200,
	)
})

test('a ten-thousand-site migration remains readable and repeat merging preserves all records', async (t) => {
	const f = fixture(t)
	await f.setup()
	const value = f.backups.exportPackage()
	const base = value.data.sites[0]
	value.data.sites = Array.from({ length: 10000 }, (_, index) => ({
		...base,
		id: `volume-${index}`,
		name: `Volume ${index}`,
		url: `https://volume.example/entry/${index}`,
		sortOrder: index,
		deletedAt: null,
	}))
	assert.equal(
		(
			await f.call('admin/import', 'POST', {
				package: value,
				mode: 'replace',
				revision: value.data.revision,
				confirmation: 'REPLACE',
			})
		).status,
		200,
	)
	const response = await f.call('public/catalog')
	assert.equal(response.status, 200)
	assert.equal(((await response.json()) as Catalog).sites.length, 10000)
	const merged = await f.call('admin/import', 'POST', {
		package: value,
		mode: 'merge',
		revision: f.catalog.snapshot().revision,
	})
	assert.equal(merged.status, 200)
	assert.deepEqual(
		{ ...(await merged.json()), backup: undefined },
		{
			added: 0,
			skipped: 10000,
			conflicts: [],
			applicationsAdded: 0,
			applicationsSkipped: 0,
			backup: undefined,
		},
	)
	assert.equal(f.catalog.snapshot(true).sites.length, 10000)
})

test('native backup restores into a fresh instance and invalidates backed-up sessions', async (t) => {
	const source = fixture(t)
	await source.setup()
	source.applications.submit({
		name: 'Native application',
		url: 'https://native-application.test',
		description: 'Saved request',
		suggestedCategory: 'AI',
	})
	const nativeApplication = source.applications.all()[0]
	source.applications.review(nativeApplication.id, {
		action: 'approved',
		expectedUpdatedAt: nativeApplication.updatedAt,
		reviewNote: '原生备份中的审核记录',
		site: {
			name: nativeApplication.name,
			url: nativeApplication.url,
			description: nativeApplication.description,
			categoryId: source.catalog.snapshot().categories[0].id,
			iconUrl: '',
			tags: [],
			pinned: false,
			sortOrder: 100,
		},
	})
	source.catalog.saveSettings({
		...source.catalog.snapshot().settings,
		name: '原生备份内容',
	})
	const name = await source.backups.create()
	const destination = fixture(t)
	destination.store.sqlite.close()
	const result = spawnSync(
		process.execPath,
		[
			'--import',
			'tsx',
			'server/entry.ts',
			'restore',
			join(source.config.backupDir, name),
		],
		{
			cwd: process.cwd(),
			env: {
				...process.env,
				DATA_DIR: destination.config.dataDir,
				BACKUP_DIR: destination.config.backupDir,
			},
			encoding: 'utf8',
		},
	)
	assert.equal(result.status, 0, result.stderr)
	const restored = openDatabase(destination.config)
	try {
		const service = createApp(restored, destination.config)
		assert.equal(service.catalog.snapshot().settings.name, '原生备份内容')
		assert.equal(service.auth.account()?.username, 'owner')
		assert.equal(
			restored.sqlite.prepare('SELECT count(*) AS n FROM sessions').get() &&
				(
					restored.sqlite
						.prepare('SELECT count(*) AS n FROM sessions')
						.get() as { n: number }
				).n,
			0,
		)
		assert.equal(
			service.catalog.snapshot().sites.length,
			source.catalog.snapshot().sites.length,
		)
		assert.deepEqual(service.applications.all(), source.applications.all())
	} finally {
		restored.sqlite.close()
	}
})

test('native restore rejects newer databases without changing the destination or leaving temporary files', async (t) => {
	const source = fixture(t)
	await source.setup()
	source.store.sqlite
		.prepare(
			'UPDATE __drizzle_migrations SET created_at = created_at + 1000000000000',
		)
		.run()
	const backup = await source.backups.create()
	const destination = fixture(t)
	await destination.setup()
	destination.catalog.saveSettings({
		...destination.catalog.settings(),
		name: '恢复失败前的内容',
	})
	const before = destination.catalog.snapshot(true)
	const account = destination.auth.account()
	destination.store.sqlite.close()
	const result = spawnSync(
		process.execPath,
		[
			'--import',
			'tsx',
			'server/entry.ts',
			'restore',
			join(source.config.backupDir, backup),
		],
		{
			cwd: process.cwd(),
			env: {
				...process.env,
				DATA_DIR: destination.config.dataDir,
				BACKUP_DIR: destination.config.backupDir,
			},
			encoding: 'utf8',
		},
	)
	assert.notEqual(result.status, 0)
	assert.match(result.stderr, /数据库版本高于当前应用/)
	assert.equal(
		readdirSync(destination.config.dataDir).some((name) =>
			name.startsWith('.restore-'),
		),
		false,
	)
	const restored = openDatabase(destination.config)
	try {
		const service = createApp(restored, destination.config)
		assert.deepEqual(service.catalog.snapshot(true), before)
		assert.deepEqual(service.auth.account(), account)
	} finally {
		restored.sqlite.close()
	}
})

test('malformed captcha responses fail closed without exhausting verifier capacity', async (t) => {
	const f = fixture(t)
	const service = createApp(f.store, {
		...f.config,
		turnstileSiteKey: 'test-key',
		turnstileSecretKey: 'test-secret',
	})
	let result: unknown
	t.mock.method(
		globalThis,
		'fetch',
		async () =>
			new Response(JSON.stringify(result), {
				headers: { 'Content-Type': 'application/json' },
			}),
	)
	const call = () =>
		service.app.request('/api/public/applications', {
			method: 'POST',
			headers: { Origin: f.config.origin, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				name: '验证码响应边界',
				url: 'https://captcha-response.test',
				captchaToken: 'token',
			}),
		})
	for (const malformed of [
		null,
		[],
		{ success: 'true', hostname: 'localhost', action: 'submit' },
	]) {
		result = malformed
		assert.equal((await call()).status, 503)
		assert.equal(f.applications.all().length, 0)
	}
	result = { success: false }
	assert.equal((await call()).status, 403)
	result = { success: true, hostname: 'localhost', action: 'submit' }
	assert.equal((await call()).status, 202)
	assert.equal(f.applications.all().length, 1)
})

test('anonymous submissions remain private, deduplicate pending URLs and respect origin, queue toggle and honeypot', async (t) => {
	const f = fixture(t)
	const input = {
		name: '推荐网站',
		url: 'https://submission.test/path',
		description: '公开说明',
		suggestedCategory: 'AI',
	}
	assert.equal((await f.call('public/applications', 'POST', input)).status, 202)
	assert.equal(
		(
			await f.call('public/applications', 'POST', {
				...input,
				url: 'https://SUBMISSION.test:443/path',
			})
		).status,
		202,
	)
	assert.equal(f.applications.all().length, 1)
	assert.equal(
		f.catalog.snapshot().sites.some((site) => site.url === input.url),
		false,
	)
	assert.equal((await f.call('admin/applications')).status, 401)
	const publicText = await (await f.call('public/catalog')).text()
	assert.equal(publicText.includes('公开说明'), false)
	assert.equal(
		(
			await f.call('public/applications', 'POST', input, {
				Origin: 'https://evil.test',
			})
		).status,
		403,
	)
	assert.equal(
		(
			await f.call('public/applications', 'POST', {
				...input,
				url: 'https://bot.test',
				website: 'filled',
			})
		).status,
		202,
	)
	assert.equal(f.applications.all().length, 1)
	await f.setup()
	f.catalog.saveSettings({
		...f.catalog.snapshot().settings,
		applicationsEnabled: false,
	})
	assert.equal((await f.call('public/applications', 'POST', input)).status, 403)
	assert.equal(
		(
			(await (await f.call('public/applications')).json()) as {
				enabled: boolean
			}
		).enabled,
		false,
	)
	assert.equal((await f.call('admin/applications')).status, 200)
})

test('anonymous requests are bounded and rate limited; separated public origins support JSON preflight', async (t) => {
	assert.equal(
		clientAddress('172.18.0.2', '203.0.113.1', ['172.18.0.2']),
		'203.0.113.1',
	)
	assert.equal(
		clientAddress('203.0.113.9', '203.0.113.1', ['172.18.0.2']),
		'203.0.113.9',
	)
	assert.equal(
		clientAddress('172.18.0.2', 'invalid,chain', ['172.18.0.2']),
		'172.18.0.2',
	)
	const f = fixture(t)
	const input = { name: '限流测试', url: 'https://limited.test' }
	for (let i = 0; i < 5; i++)
		assert.equal(
			(await f.call('public/applications', 'POST', input)).status,
			202,
		)
	const limited = await f.call('public/applications', 'POST', input)
	assert.equal(limited.status, 429)
	assert.ok(Number(limited.headers.get('retry-after')) > 0)
	const other = fixture(t)
	assert.equal(
		(
			await other.call('public/applications', 'POST', {
				...input,
				description: 'x'.repeat(9000),
			})
		).status,
		413,
	)
	assert.equal(
		(
			await other.call('public/applications', 'POST', {
				...input,
				url: 'javascript:alert(1)',
			})
		).status,
		400,
	)
	const service = createApp(other.store, {
		...other.config,
		publicOrigin: 'https://frontend.test',
	})
	const headers = {
		Origin: 'https://frontend.test',
		'Content-Type': 'application/json',
	}
	const preflight = await service.app.request('/api/public/applications', {
		method: 'OPTIONS',
		headers,
	})
	assert.equal(preflight.status, 204)
	assert.equal(
		preflight.headers.get('access-control-allow-origin'),
		headers.Origin,
	)
	const accepted = await service.app.request('/api/public/applications', {
		method: 'POST',
		headers,
		body: JSON.stringify(input),
	})
	assert.equal(accepted.status, 202)
	assert.equal(
		accepted.headers.get('access-control-allow-origin'),
		headers.Origin,
	)
	assert.equal(
		(
			await service.app.request('/api/admin/sites', {
				method: 'POST',
				headers,
				body: '{}',
			})
		).status,
		403,
	)
	const empty = await other.call('admin/applications')
	assert.equal(empty.status, 401)
})

test('review is atomic and idempotent, with edited approval, rejection, duplicate linking and CSRF protection', async (t) => {
	const f = fixture(t)
	await f.setup()
	f.applications.submit({
		name: '原始申请',
		url: 'https://review.test',
		description: '原始描述',
		suggestedCategory: 'AI',
	})
	const original = f.applications.all()[0]
	const site: SiteInput = {
		name: '审核后的名称',
		url: 'https://review.test/edited',
		description: '公开描述',
		categoryId: f.catalog.snapshot().categories[0].id,
		iconUrl: '',
		tags: [],
		pinned: false,
		sortOrder: 100,
	}
	const value = {
		action: 'approved',
		expectedUpdatedAt: original.updatedAt,
		reviewNote: '内部备注',
		site,
	} as const
	assert.equal(
		(
			await f.call(`admin/applications/${original.id}/review`, 'POST', value, {
				'X-CSRF-Token': '',
			})
		).status,
		403,
	)
	f.store.sqlite.exec(
		"CREATE TRIGGER deny_review BEFORE UPDATE ON applications BEGIN SELECT RAISE(ABORT, 'forced review failure'); END;",
	)
	assert.throws(
		() => f.applications.review(original.id, value),
		/forced review failure/,
	)
	assert.equal(
		f.catalog.snapshot().sites.some((s) => s.url === site.url),
		false,
	)
	assert.equal(f.applications.all()[0].status, 'pending')
	f.store.sqlite.exec('DROP TRIGGER deny_review')
	const responses = await Promise.all([
		f.call(`admin/applications/${original.id}/review`, 'POST', value),
		f.call(`admin/applications/${original.id}/review`, 'POST', value),
	])
	assert.deepEqual(
		responses.map((response) => response.status),
		[200, 200],
	)
	const approved = (await responses[0].json()) as Application
	assert.equal(approved.name, original.name)
	assert.equal(approved.status, 'approved')
	assert.equal(
		f.catalog.snapshot().sites.filter((s) => s.url === site.url).length,
		1,
	)
	assert.equal(
		(
			await f.call(`admin/applications/${original.id}/review`, 'POST', {
				action: 'rejected',
				expectedUpdatedAt: original.updatedAt,
			})
		).status,
		409,
	)
	f.applications.submit({
		name: '重复地址',
		url: site.url,
		description: '',
		suggestedCategory: '',
	})
	const duplicate = f.applications.all().find((s) => s.status === 'pending')
	assert.ok(duplicate, 'duplicate fixture must contain a pending application')
	assert.equal(
		(
			await f.call(`admin/applications/${duplicate.id}/review`, 'POST', {
				...value,
				expectedUpdatedAt: duplicate.updatedAt,
			})
		).status,
		409,
	)
	assert.equal(
		f.applications.all().find((s) => s.id === duplicate.id)?.status,
		'pending',
	)
	assert.equal(
		(
			await f.call(`admin/applications/${duplicate.id}/review`, 'POST', {
				action: 'duplicate',
				expectedUpdatedAt: duplicate.updatedAt,
				siteId: approved.siteId,
			})
		).status,
		200,
	)
	f.applications.submit({
		name: '拒绝记录',
		url: 'https://rejected.test',
		description: '',
		suggestedCategory: '',
	})
	const rejected = f.applications.all().find((s) => s.status === 'pending')
	assert.ok(rejected, 'rejection fixture must contain a pending application')
	assert.equal(
		(
			await f.call(`admin/applications/${rejected.id}/review`, 'POST', {
				action: 'rejected',
				expectedUpdatedAt: rejected.updatedAt,
				reviewNote: '不符合范围',
			})
		).status,
		200,
	)
	const list = (await (
		await f.call('admin/applications?status=rejected&q=拒绝&page=1')
	).json()) as ApplicationList
	assert.equal(list.total, 1)
	assert.deepEqual(list.counts, {
		pending: 0,
		approved: 1,
		duplicate: 1,
		rejected: 1,
	})
	assert.equal(
		(await (await f.call('public/catalog')).text()).includes('内部备注'),
		false,
	)
})

test('versioned migration includes reviews, remaps linked sites, restores records and accepts legacy packages', async (t) => {
	const source = fixture(t)
	await source.setup()
	source.applications.submit({
		name: '迁移申请',
		url: 'https://migrated-application.test',
		description: '',
		suggestedCategory: '',
	})
	const original = source.applications.all()[0]
	const site: SiteInput = {
		name: '迁移条目',
		url: original.url,
		categoryId: source.catalog.snapshot().categories[0].id,
		iconUrl: '',
		description: '',
		tags: [],
		pinned: false,
		sortOrder: 100,
	}
	source.applications.review(original.id, {
		action: 'approved',
		expectedUpdatedAt: original.updatedAt,
		site,
		reviewNote: '迁移备注',
	})
	const pkg = source.backups.exportPackage()
	assert.equal(pkg.formatVersion, 2)
	assert.equal(pkg.applications.length, 1)
	const dest = fixture(t)
	await dest.setup()
	const existing = dest.catalog.saveSite(site)
	const preview = await dest.call('admin/import/preview', 'POST', pkg)
	assert.equal(preview.status, 200)
	const result = await dest.call('admin/import', 'POST', {
		package: pkg,
		mode: 'merge',
		revision: dest.catalog.snapshot().revision,
	})
	assert.equal(result.status, 200)
	assert.equal(dest.applications.all()[0].siteId, existing.id)
	assert.equal(dest.applications.all()[0].reviewNote, '迁移备注')
	assert.equal(
		(
			await dest.call('admin/import', 'POST', {
				package: pkg,
				mode: 'merge',
				revision: dest.catalog.snapshot().revision,
			})
		).status,
		200,
	)
	assert.equal(dest.applications.all().length, 1)
	assert.equal(
		(
			await dest.call('admin/import', 'POST', {
				package: pkg,
				mode: 'replace',
				revision: dest.catalog.snapshot().revision,
				confirmation: 'REPLACE',
			})
		).status,
		200,
	)
	assert.deepEqual(dest.applications.all(), source.applications.all())
	const { applications: _applications, ...legacy } = pkg
	legacy.formatVersion = 1
	const legacyData = structuredClone(legacy) as {
		data: { settings: Record<string, unknown> }
	}
	delete legacyData.data.settings.applicationsEnabled
	assert.equal(
		migrationSchema.parse(legacyData).data.settings.applicationsEnabled,
		true,
	)
	assert.equal(
		(
			await dest.call('admin/import', 'POST', {
				package: legacyData,
				mode: 'replace',
				revision: dest.catalog.snapshot().revision,
				confirmation: 'REPLACE',
			})
		).status,
		200,
	)
	assert.equal(dest.applications.all().length, 0)
	const bad = structuredClone(pkg)
	bad.applications[0].siteId = 'missing'
	assert.equal(
		(await dest.call('admin/import/preview', 'POST', bad)).status,
		400,
	)
	const fullQueue = structuredClone(pkg)
	fullQueue.applications = Array.from({ length: 500 }, (_, index) => ({
		...original,
		id: `pending-${index}`,
		url: `https://pending-migration.test/${index}`,
	}))
	assert.equal(
		(
			await dest.call('admin/import/preview', 'POST', {
				...fullQueue,
				applications: [
					...fullQueue.applications,
					{ ...original, id: 'one-more', url: 'https://one-more.test' },
				],
			})
		).status,
		400,
	)
	dest.applications.submit({
		name: '当前待审核',
		url: 'https://current-pending.test',
		description: '',
		suggestedCategory: '',
	})
	const beforeOverflow = dest.catalog.snapshot(true)
	assert.equal(
		(
			await dest.call('admin/import', 'POST', {
				package: fullQueue,
				mode: 'merge',
				revision: beforeOverflow.revision,
			})
		).status,
		400,
	)
	assert.deepEqual(dest.catalog.snapshot(true), beforeOverflow)
	assert.equal(dest.applications.all().length, 1)
})

test('new submissions invalidate import previews and configured captcha fails closed', async (t) => {
	const f = fixture(t)
	await f.setup()
	const pkg = f.backups.exportPackage()
	f.applications.submit({
		name: '预览之后',
		url: 'https://after-preview.test',
		description: '',
		suggestedCategory: '',
	})
	assert.equal(
		(
			await f.call('admin/import', 'POST', {
				package: pkg,
				mode: 'replace',
				revision: pkg.data.revision,
				confirmation: 'REPLACE',
			})
		).status,
		409,
	)
	const service = createApp(f.store, {
		...f.config,
		turnstileSiteKey: 'public-test-key',
		turnstileSecretKey: 'private-test-secret',
	})
	let hostname = 'localhost'
	let success = false
	t.mock.method(
		globalThis,
		'fetch',
		async (url: string, options: RequestInit) => {
			assert.equal(
				url,
				'https://challenges.cloudflare.com/turnstile/v0/siteverify',
			)
			assert.ok(String(options.body).includes('private-test-secret'))
			return new Response(
				JSON.stringify({ success, hostname, action: 'submit' }),
				{ headers: { 'Content-Type': 'application/json' } },
			)
		},
	)
	const input = {
		name: '验证申请',
		url: 'https://captcha.test',
		captchaToken: 'test-token',
	}
	const call = (value: unknown) =>
		service.app.request('/api/public/applications', {
			method: 'POST',
			headers: { Origin: f.config.origin, 'Content-Type': 'application/json' },
			body: JSON.stringify(value),
		})
	const info = await service.app.request('/api/public/applications')
	assert.equal((await info.text()).includes('private-test-secret'), false)
	assert.equal((await call({ ...input, captchaToken: '' })).status, 400)
	assert.equal((await call(input)).status, 403)
	success = true
	hostname = 'evil.test'
	assert.equal((await call(input)).status, 403)
	assert.equal(
		f.applications.all().some((a) => a.url === input.url),
		false,
	)
	hostname = 'localhost'
	assert.equal((await call(input)).status, 202)
	assert.equal(
		f.applications.all().filter((a) => a.url === input.url).length,
		1,
	)
})
