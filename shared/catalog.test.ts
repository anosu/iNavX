import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Site } from '../src/types/index.js'
import { reconcileEngines } from '../src/utils/enginePreferences.js'
import { mergeSites } from '../src/utils/mergeSites.js'
import {
	personalSchema,
	readStoredSites,
	restorePersonalData,
} from '../src/utils/personalData.js'
import { normalizeUrl } from './catalog.js'

test('URL normalization preserves path, query, fragment and protocol semantics', () => {
	assert.equal(
		normalizeUrl(' https://EXAMPLE.com:443/Path?q=A#part '),
		'https://example.com/Path?q=A#part',
	)
	assert.notEqual(
		normalizeUrl('https://example.com/Path'),
		normalizeUrl('https://example.com/path'),
	)
	assert.notEqual(
		normalizeUrl('https://example.com/?q=A'),
		normalizeUrl('https://example.com/?q=a'),
	)
	assert.notEqual(
		normalizeUrl('http://example.com'),
		normalizeUrl('https://example.com'),
	)
})

test('personal preferences retain an available engine when the administrator removes the last selected one', () => {
	const base = {
		name: 'engine',
		searchUrl: 'https://search.test/?q={q}',
		iconUrl: '',
	}
	const preferences = [
		{ id: 'removed', enabled: true },
		{ id: 'available', enabled: false },
	]
	assert.deepEqual(
		reconcileEngines(
			[
				{ ...base, id: 'removed', enabled: false },
				{ ...base, id: 'available', enabled: true },
			],
			preferences,
		).map(({ id, enabled }) => ({ id, enabled })),
		[{ id: 'available', enabled: true }],
	)
	assert.deepEqual(
		reconcileEngines(
			[{ ...base, id: 'available', enabled: false }],
			preferences,
		),
		[],
	)
})
test('personal edits take precedence while public hidden IDs remain effective', () => {
	const base: Site = {
		id: 'existing-public-id',
		name: 'public',
		url: 'https://example.com/',
		category: '新版分类',
		description: '',
		source: 'builtin',
	}
	const personal: Site = {
		...base,
		id: 'custom-example',
		name: 'personal',
		category: '遗留分类',
		source: 'custom',
	}
	const imported: Site = {
		...personal,
		id: 'imported-example',
		source: 'imported',
	}
	const other: Site = { ...base, id: 'other', url: 'https://other.example' }
	assert.deepEqual(
		mergeSites([base, other], [personal], [imported], new Set(['other'])).map(
			(site) => [site.name, site.category],
		),
		[['personal', '遗留分类']],
	)
	assert.deepEqual(
		mergeSites([base], [], [], new Set(['existing-public-id'])),
		[],
	)
})

test('visible sites reject malformed legacy data and keep shortcut order aligned with pinned cards', () => {
	const base: Site = {
		id: 'public',
		name: 'public',
		url: 'https://public.test',
		category: '其他',
		description: '',
		source: 'builtin',
	}
	const pinned: Site = {
		...base,
		id: 'pinned',
		url: 'https://pinned.test',
		pinned: true,
	}
	const unsafe: Site = {
		...base,
		id: 'unsafe',
		url: 'javascript:alert(1)',
		source: 'custom',
	}
	assert.deepEqual(mergeSites([base], [unsafe], [], new Set()), [base])
	assert.deepEqual(
		mergeSites([base, pinned], [], [], new Set()).map((site) => site.id),
		['pinned', 'public'],
	)
	assert.deepEqual(
		mergeSites(
			[base],
			[null, { ...base, tags: [null] }] as unknown as Site[],
			[],
			new Set(),
		),
		[base],
	)
})

test('legacy personal records are validated per entry and cannot impersonate public sites', () => {
	const site = {
		id: 'local',
		name: 'local',
		url: 'https://local.test',
		category: '遗留分类',
		description: '',
		source: 'builtin',
	}
	const raw = JSON.stringify([
		null,
		site,
		{ ...site, url: 'https://duplicate-id.test' },
		{ ...site, id: 'bad', url: 'javascript:alert(1)' },
	])
	assert.deepEqual(readStoredSites(raw, 'custom'), [
		{ ...site, source: 'custom' },
	])
	assert.deepEqual(readStoredSites('{broken', 'imported'), [])
	assert.equal(
		personalSchema.safeParse({
			format: 'inav-personal',
			formatVersion: 1,
			customSites: [site, site],
			importedSites: [],
			hiddenIds: [],
			theme: null,
			engines: null,
		}).success,
		false,
	)
})

test('personal restore rolls back completely when storage fills after partial writes', (t) => {
	const site = (id: string) => ({
		id,
		name: id,
		url: `https://personal.test/${id}`,
		category: '其他',
		description: 'a'.repeat(800),
	})
	const stored = new Map([
		['inav-custom-sites', JSON.stringify([site('old-custom')])],
		['inav-imported-sites', JSON.stringify([site('old-imported')])],
		['inav-hidden-builtin', '[]'],
		['inav-theme', 'light'],
		['inav:engine-order', '[]'],
	])
	const original = new Map(stored)
	let reloaded = false
	const originals = new Map(
		['window', 'localStorage'].map((key) => [
			key,
			Object.getOwnPropertyDescriptor(globalThis, key),
		]),
	)
	t.after(() => {
		for (const [key, descriptor] of originals) {
			if (descriptor) Object.defineProperty(globalThis, key, descriptor)
			else Reflect.deleteProperty(globalThis, key)
		}
	})
	Object.defineProperty(globalThis, 'window', {
		configurable: true,
		value: {
			confirm: () => true,
			location: {
				reload: () => {
					reloaded = true
				},
			},
		},
	})
	Object.defineProperty(globalThis, 'localStorage', {
		configurable: true,
		value: {
			getItem: (key: string) => stored.get(key) ?? null,
			removeItem: (key: string) => stored.delete(key),
			setItem: (key: string, value: string) => {
				const size = [...stored].reduce(
					(sum, [itemKey, raw]) => sum + (itemKey === key ? 0 : raw.length),
					value.length,
				)
				if (size > 2400) throw new Error('QuotaExceededError')
				stored.set(key, value)
			},
		},
	})
	assert.throws(
		() =>
			restorePersonalData({
				format: 'inav-personal',
				formatVersion: 1,
				customSites: [],
				importedSites: [site('new-1'), site('new-2')],
				hiddenIds: Array.from({ length: 400 }, (_, i) => `hidden-${i}`),
				theme: null,
				engines: null,
			}),
		/QuotaExceededError/,
	)
	assert.deepEqual(stored, original)
	assert.equal(reloaded, false)
})
