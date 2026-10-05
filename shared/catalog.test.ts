import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Site } from '../src/types/index.js'
import { reconcileEngines } from '../src/utils/enginePreferences.js'
import { filterSites } from '../src/utils/filterSites.js'
import { mergeSites } from '../src/utils/mergeSites.js'
import {
	personalSchema,
	readStoredSites,
	restorePersonalData,
} from '../src/utils/personalData.js'
import { migrationSchema, normalizeUrl, submissionSchema } from './catalog.js'
import { DEFAULT_SETTINGS } from './defaults.js'
import {
	createTagInput,
	parseTagInput,
	readTagInput,
	tagsSchema,
} from './tags.js'

test('tag input includes unfinished text and preserves spaces while trimming and deduplicating', () => {
	assert.deepEqual(
		readTagInput({
			...createTagInput(['已添加', 'Visual Studio']),
			draft: '未按 Enter',
		}),
		['已添加', 'Visual Studio', '未按 Enter'],
	)
	assert.deepEqual(readTagInput(createTagInput(['保留'])), ['保留'])
	assert.deepEqual(readTagInput({ tags: ['C, C++'], draft: 'Go，最后一个' }), [
		'C, C++',
		'Go',
		'最后一个',
	])
	assert.deepEqual(
		parseTagInput(' 开源，开发工具, 开源, Visual Studio\n最后一个'),
		['开源', '开发工具', 'Visual Studio', '最后一个'],
	)
	assert.deepEqual(tagsSchema.parse([' 开源 ', '开源']), ['开源'])
	assert.deepEqual(
		submissionSchema.parse({ name: 'Test', url: 'https://test.example' }).tags,
		[],
	)
	for (const tags of [
		[''],
		['a'.repeat(101)],
		Array.from({ length: 31 }, (_, i) => String(i)),
	])
		assert.equal(
			submissionSchema.safeParse({
				name: 'Test',
				url: 'https://test.example',
				tags,
			}).success,
			false,
		)
})

test('tag filters match complete values and combine with category and search', () => {
	const base: Site = {
		id: 'tagged',
		name: 'Editor',
		url: 'https://test.example',
		description: '',
		category: '开发',
		tags: ['Go'],
		source: 'builtin',
	}
	const sites = [
		base,
		{ ...base, id: 'partial', tags: ['Golang'] },
		{ ...base, id: 'name', name: 'Go', tags: [] },
	]
	assert.deepEqual(
		filterSites(sites, '', null, 'Go').map((s) => s.id),
		['tagged'],
	)
	assert.deepEqual(filterSites(sites, 'editor', '开发', 'Go'), [base])
	assert.deepEqual(filterSites(sites, '', '其他', 'Go'), [])
	assert.deepEqual(filterSites(sites, '', null, 'go'), [])
	assert.equal(filterSites(sites, 'go', null, null).length, 3)
})

test('version 4 carries application tags and old packages supply an empty list', () => {
	const stamp = '2026-10-05T00:00:00.000Z'
	const item = {
		id: 'application',
		name: 'Test',
		url: 'https://test.example',
		description: '',
		suggestedCategory: '',
		status: 'pending',
		reviewNote: '',
		siteId: null,
		createdAt: stamp,
		updatedAt: stamp,
		reviewedAt: null,
	}
	const pkg = {
		format: 'inav-catalog',
		formatVersion: 4,
		appVersion: 'test',
		exportedAt: stamp,
		data: {
			revision: '1',
			categories: [],
			sites: [],
			engines: [],
			settings: DEFAULT_SETTINGS,
		},
		applications: [{ ...item, tags: ['开源'] }],
	}
	assert.deepEqual(migrationSchema.parse(pkg).applications[0].tags, ['开源'])
	for (const version of [2, 3]) {
		assert.equal(
			migrationSchema.safeParse({ ...pkg, formatVersion: version }).success,
			false,
		)
		assert.deepEqual(
			migrationSchema.parse({
				...pkg,
				formatVersion: version,
				applications: [item],
			}).applications[0].tags,
			[],
		)
	}
	assert.deepEqual(
		migrationSchema.parse({ ...pkg, formatVersion: 1, applications: [] })
			.applications,
		[],
	)
})

test('version 3 preserves deleted site associations and accepts an empty catalog', () => {
	const stamp = '2026-10-05T00:00:00.000Z'
	const item = {
		id: 'application',
		name: 'Removed site',
		url: 'https://example.com/',
		description: '',
		suggestedCategory: '',
		status: 'approved',
		reviewNote: '',
		siteId: null,
		siteDeletedAt: stamp,
		createdAt: stamp,
		updatedAt: stamp,
		reviewedAt: stamp,
	}
	const pkg = {
		format: 'inav-catalog',
		formatVersion: 3,
		appVersion: 'test',
		exportedAt: stamp,
		data: {
			revision: '1',
			categories: [],
			sites: [],
			engines: [],
			settings: DEFAULT_SETTINGS,
		},
		applications: [item],
	}
	assert.equal(migrationSchema.parse(pkg).applications[0].siteDeletedAt, stamp)
	assert.equal(
		migrationSchema.safeParse({ ...pkg, formatVersion: 2 }).success,
		false,
	)
	assert.equal(
		migrationSchema.safeParse({
			...pkg,
			applications: [{ ...item, siteId: 'missing' }],
		}).success,
		false,
	)
	assert.equal(
		migrationSchema.safeParse({
			...pkg,
			applications: [{ ...item, siteDeletedAt: null }],
		}).success,
		false,
	)
})

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
