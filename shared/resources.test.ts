import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { engineSchema, settingsSchema } from './catalog.js'
import { DEFAULT_ENGINES, DEFAULT_SETTINGS } from './defaults.js'
import { isResourceUrl, resolveImageUrl } from './resources.js'

test('image policy permits local assets and requires explicit permission for remote images', () => {
	const origin = 'https://nav.example.test'
	assert.equal(
		resolveImageUrl('/icons/local.svg', origin, false),
		'/icons/local.svg',
	)
	assert.equal(
		resolveImageUrl(`${origin}/logo.svg`, origin, false),
		`${origin}/logo.svg`,
	)
	assert.equal(
		resolveImageUrl('https://images.example.test/icon.png', origin, false),
		undefined,
	)
	assert.equal(
		resolveImageUrl('https://images.example.test/icon.png', origin, true),
		'https://images.example.test/icon.png',
	)
	for (const value of [
		'//images.test/a.png',
		'/\\images.test/a.png',
		'https://user:password@images.test/a.png',
		'data:image/png;base64,x',
		'javascript:alert(1)',
		' https://images.test/a.png',
		'https://ima\nges.test/a.png',
	]) {
		assert.equal(isResourceUrl(value), false, value)
		assert.equal(resolveImageUrl(value, origin, true), undefined, value)
	}
})

test('legacy settings preserve configured URLs but default external features to disabled', () => {
	const {
		remoteImagesEnabled: _remote,
		metadataFetchEnabled: _metadata,
		...legacy
	} = DEFAULT_SETTINGS
	const restored = settingsSchema.parse({
		...legacy,
		faviconTemplate: 'https://icons.example.test/?domain={domain}',
		metadataProxyTemplate: 'https://proxy.example.test/?url={url}',
	})
	assert.equal(restored.remoteImagesEnabled, false)
	assert.equal(restored.metadataFetchEnabled, false)
	assert.equal(
		restored.faviconTemplate,
		'https://icons.example.test/?domain={domain}',
	)
	assert.equal(
		settingsSchema.parse({
			...restored,
			remoteImagesEnabled: true,
			metadataFetchEnabled: true,
		}).metadataFetchEnabled,
		true,
	)
	assert.ok(
		settingsSchema.safeParse({
			...restored,
			faviconTemplate: '/icons/{domain}.png',
			metadataProxyTemplate: '/metadata?url={url}',
		}).success,
	)
	assert.equal(
		settingsSchema.safeParse({
			...restored,
			faviconTemplate: '/\\remote.test/{domain}',
		}).success,
		false,
	)
	assert.equal(
		engineSchema.safeParse({
			...DEFAULT_ENGINES[0],
			searchUrl: '/search?q={q}',
		}).success,
		false,
	)
})

test('fresh defaults and seed entries have no external image or metadata service', () => {
	assert.equal(DEFAULT_SETTINGS.remoteImagesEnabled, false)
	assert.equal(DEFAULT_SETTINGS.metadataFetchEnabled, false)
	assert.equal(DEFAULT_SETTINGS.faviconTemplate, '')
	assert.equal(DEFAULT_SETTINGS.metadataProxyTemplate, '')
	assert.ok(DEFAULT_ENGINES.every((engine) => engine.iconUrl === ''))
	const seed = JSON.parse(
		readFileSync(new URL('../src/data/sites.json', import.meta.url), 'utf8'),
	) as { iconUrl: string }[]
	assert.ok(seed.every((site) => site.iconUrl === ''))
	const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
	assert.doesNotMatch(html, /rel="(?:dns-prefetch|preconnect)"/)
})

test('presentation settings supply legacy defaults and reject unsafe links', () => {
	const { presentation: _presentation, ...legacy } = DEFAULT_SETTINGS
	const restored = settingsSchema.parse(legacy)
	assert.equal(restored.presentation.showClock, true)
	assert.equal(restored.presentation.faviconUrl, '')
	assert.deepEqual(restored.presentation.footerLinks, [])
	assert.equal(
		settingsSchema.safeParse({
			...legacy,
			presentation: {
				footerLinks: [{ label: 'unsafe', url: 'javascript:alert(1)' }],
			},
		}).success,
		false,
	)
	assert.equal(
		settingsSchema.safeParse({
			...legacy,
			presentation: { faviconUrl: '//unsafe.test/logo.svg' },
		}).success,
		false,
	)
	assert.equal(
		settingsSchema.safeParse({
			...legacy,
			presentation: { searchPlaceholder: '' },
		}).success,
		false,
	)
})
