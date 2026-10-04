import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseCatalogImport } from '../src/utils/catalogImport.js'
import { type Catalog, migrationSchema } from './catalog.js'
import { DEFAULT_ENGINES, DEFAULT_SETTINGS } from './defaults.js'

function currentCatalog(): Catalog {
	return {
		revision: '1',
		categories: [{ id: 'category-other', name: '其他', sortOrder: 0 }],
		sites: [],
		engines: DEFAULT_ENGINES,
		settings: DEFAULT_SETTINGS,
	}
}

test('personal catalog import deduplicates URLs, maps categories and leaves current data untouched', () => {
	const catalog = currentCatalog()
	const original = structuredClone(catalog)
	const site = {
		id: 'local-one',
		name: 'one',
		url: 'https://example.test',
		description: '',
		category: '其他',
	}
	const result = parseCatalogImport(
		JSON.stringify({
			format: 'inav-personal',
			customSites: [site],
			importedSites: [
				{ ...site, id: 'local-duplicate', url: 'https://example.test/' },
				{
					...site,
					id: 'local-two',
					url: 'https://second.test',
					category: '自定义分类',
				},
			],
			theme: 'dark',
		}),
		'personal.json',
		catalog,
	)
	assert.equal(result.canReplace, false)
	assert.equal(result.package.data.sites.length, 2)
	assert.equal(result.package.data.sites[0].categoryId, 'category-other')
	const newCategory = result.package.data.categories.find(
		(category) => category.name === '自定义分类',
	)
	assert.ok(newCategory)
	assert.equal(result.package.data.sites[1].categoryId, newCategory.id)
	assert.equal(
		result.package.data.settings.defaultTheme,
		catalog.settings.defaultTheme,
	)
	assert.deepEqual(catalog, original)
})

test('only validated full catalog packages allow replacement; malformed and unsafe imports fail', () => {
	const catalog = currentCatalog()
	const complete = migrationSchema.parse({
		format: 'inav-catalog',
		formatVersion: 2,
		appVersion: 'test',
		exportedAt: new Date().toISOString(),
		data: catalog,
		applications: [],
	})
	assert.deepEqual(
		parseCatalogImport(JSON.stringify(complete), 'catalog.json', catalog),
		{
			package: complete,
			canReplace: true,
		},
	)
	assert.throws(() =>
		parseCatalogImport(
			JSON.stringify({ ...complete, data: { ...catalog, categories: [] } }),
			'invalid.json',
			catalog,
		),
	)
	assert.throws(() =>
		parseCatalogImport(
			JSON.stringify([
				{
					id: 'unsafe',
					name: 'unsafe',
					url: 'javascript:alert(1)',
					category: '其他',
					description: '',
				},
			]),
			'sites.json',
			catalog,
		),
	)
	assert.throws(() => parseCatalogImport('{', 'broken.json', catalog))
})
