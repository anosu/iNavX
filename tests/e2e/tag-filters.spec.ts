import { catalogSchema } from '../../shared/catalog'
import { expect, test } from './fixtures'

test('tag filters accumulate, toggle and combine with category and search', async ({
	page,
}) => {
	const catalog = catalogSchema.parse(
		await (await page.request.get('/api/public/catalog')).json(),
	)
	const category = catalog.categories[0]
	const otherCategory = catalog.categories[1]
	const template = catalog.sites[0]
	catalog.sites = [
		{ name: 'Both', tags: ['开源', '免费', 'C, C++'], categoryId: category.id },
		{ name: 'Open only', tags: ['开源'], categoryId: category.id },
		{ name: 'Free only', tags: ['免费'], categoryId: category.id },
		{
			name: 'Other both',
			tags: ['开源', '免费'],
			categoryId: otherCategory.id,
		},
		{ name: 'Other tag', tags: ['闭源'], categoryId: otherCategory.id },
	].map((site, index) => ({
		...template,
		...site,
		id: `tag-test-${index}`,
		url: `https://tag-test-${index}.example/`,
		pinned: false,
		sortOrder: index,
	}))
	await page.route('**/api/public/catalog', (route) =>
		route.fulfill({ json: catalog }),
	)
	await page.goto('/')
	const tags = page.getByRole('group', { name: 'Both的标签', exact: true })
	const removeOpen = page.getByRole('button', { name: '取消标签筛选：开源' })
	const removeFree = page.getByRole('button', { name: '取消标签筛选：免费' })
	await tags
		.getByRole('button', { name: '筛选标签：开源', exact: true })
		.click()
	await tags
		.getByRole('button', { name: '筛选标签：免费', exact: true })
		.click()
	await expect(removeOpen).toBeVisible()
	await expect(removeFree).toBeVisible()
	await expect(page.getByText('Open only', { exact: true })).toBeHidden()
	await expect(page.getByText('Free only', { exact: true })).toBeHidden()
	await expect(page.getByText('Other both', { exact: true })).toBeVisible()
	await tags
		.getByRole('button', { name: '筛选标签：开源', exact: true })
		.click()
	await expect(removeOpen).toBeHidden()
	await expect(removeFree).toBeVisible()
	await expect(page.getByText('Free only', { exact: true })).toBeVisible()
	await tags
		.getByRole('button', { name: '筛选标签：开源', exact: true })
		.click()
	await page.getByRole('button', { name: category.name, exact: true }).click()
	await expect(page.getByText('Other both', { exact: true })).toBeHidden()
	await expect(removeOpen).toBeVisible()
	await expect(removeFree).toBeVisible()
	await removeFree.click()
	await expect(page.getByText('Open only', { exact: true })).toBeVisible()
	await page.getByRole('searchbox').fill('Both')
	await expect(page.getByText('Open only', { exact: true })).toBeHidden()
	await expect(page.getByText('Other both', { exact: true })).toBeHidden()
	await expect(removeOpen).toBeVisible()
	await page.keyboard.press('Control+k')
	const palette = page.getByRole('dialog', { name: '命令面板', exact: true })
	await palette.getByLabel('搜索站点或操作').fill('免费')
	await palette.getByRole('option', { name: /免费.*添加此标签筛选/ }).click()
	await expect(removeOpen).toBeVisible()
	await expect(removeFree).toBeVisible()
	await expect(page.getByRole('searchbox')).toHaveValue('Both')
	await expect(page.getByText('Other both', { exact: true })).toBeHidden()
	await page.keyboard.press('Control+k')
	await palette.getByLabel('搜索站点或操作').fill('免费')
	await palette.getByRole('option', { name: /免费.*取消此标签筛选/ }).click()
	await expect(removeFree).toBeHidden()
	await expect(removeOpen).toBeVisible()
	await page.keyboard.press('Control+k')
	await palette.getByLabel('搜索站点或操作').fill('闭源')
	await palette.getByRole('option', { name: /闭源.*添加此标签筛选/ }).click()
	await expect(
		page.getByRole('heading', { name: '没有找到匹配的站点', exact: true }),
	).toBeVisible()
	await page.getByRole('button', { name: '取消标签筛选：闭源' }).click()
	await expect(page.getByRole('link', { name: /^Both —/ })).toBeVisible()
	await page.getByRole('button', { name: '清空标签筛选', exact: true }).click()
	await expect(removeOpen).toBeHidden()
	await expect(removeFree).toBeHidden()
	await expect(page.getByRole('searchbox')).toHaveValue('Both')
	await expect(page.getByText('Other both', { exact: true })).toBeHidden()
	await page.getByRole('searchbox').fill('')
	await expect(page.getByText('Open only', { exact: true })).toBeVisible()
	await expect(page.getByText('Other both', { exact: true })).toBeHidden()
	await page.setViewportSize({ width: 320, height: 800 })
	await tags.getByRole('button', { name: '查看Both的全部标签' }).click()
	const expanded = page.getByRole('dialog', {
		name: 'Both的全部标签',
		exact: true,
	})
	const commaTag = expanded.getByRole('button', {
		name: '筛选标签：C, C++',
		exact: true,
	})
	await commaTag.focus()
	await page.keyboard.press('Enter')
	await expect(commaTag).toBeFocused()
	await expect(commaTag).toHaveAttribute('aria-pressed', 'true')
	await expanded
		.getByRole('button', { name: '筛选标签：开源', exact: true })
		.click()
	await expect(commaTag).toHaveAttribute('aria-pressed', 'true')
	await expect(removeOpen).toBeVisible()
	await expect(
		page.getByRole('button', { name: '取消标签筛选：C, C++' }),
	).toBeVisible()
	await page.keyboard.press('Escape')
	await expect(expanded).toBeHidden()
	await expect(
		tags.getByRole('button', { name: '查看Both的全部标签' }),
	).toBeFocused()
	expect(
		await page.evaluate('document.documentElement.scrollWidth <= innerWidth'),
	).toBe(true)
	await page.keyboard.press('Control+k')
	await palette.getByLabel('搜索站点或操作').fill('>reset')
	await page.keyboard.press('Enter')
	await expect(removeOpen).toBeHidden()
	await expect(
		page.getByRole('button', { name: '取消标签筛选：C, C++' }),
	).toBeHidden()
	await expect(page.getByText('Other both', { exact: true })).toBeVisible()
})
