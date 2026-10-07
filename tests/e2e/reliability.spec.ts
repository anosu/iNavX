import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, login, test } from './fixtures'

test('two editors cannot overwrite each other and public tabs receive changes', async ({
	page,
	context,
}) => {
	await login(page)
	await page.goto('/admin?tab=categories')
	const second = await context.newPage()
	await second.goto('/admin?tab=categories')
	const publicPage = await context.newPage()
	await publicPage.goto('/')
	await expect(
		publicPage.getByRole('button', { name: 'AI', exact: true }),
	).toBeVisible()
	for (const editor of [page, second])
		await editor
			.getByRole('button', { name: '编辑', exact: true })
			.first()
			.click()
	await page
		.getByRole('textbox', { name: '分类名称', exact: true })
		.fill('First editor')
	await page.getByRole('button', { name: '保存分类', exact: true }).click()
	await expect(page.getByText('分类已保存', { exact: true })).toBeVisible()
	await expect(
		publicPage.getByRole('button', { name: 'First editor', exact: true }),
	).toBeVisible()
	await second
		.getByRole('textbox', { name: '分类名称', exact: true })
		.fill('Stale draft')
	await second.getByRole('button', { name: '保存分类', exact: true }).click()
	await expect(
		second.getByRole('dialog').getByText(/内容已在其他页面修改/),
	).toBeVisible()
	await expect(
		second.getByRole('textbox', { name: '分类名称', exact: true }),
	).toHaveValue('Stale draft')
	await expect(
		publicPage.getByRole('button', { name: 'First editor', exact: true }),
	).toBeVisible()
})

test('media references, complete backup verification and restore survive a restart', async ({
	page,
	app,
}) => {
	await login(page)
	await page.goto('/admin?tab=settings')
	const image = Buffer.from(
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="#8b5cf6"/></svg>',
	)
	await page
		.getByLabel('上传Logo（留空使用内置 Logo）', { exact: true })
		.setInputFiles({
			name: 'logo.svg',
			mimeType: 'image/svg+xml',
			buffer: image,
		})
	const logo = page.getByRole('textbox', {
		name: 'Logo（留空使用内置 Logo）',
		exact: true,
	})
	await expect(logo).toHaveValue(/^\/media\//)
	const imageUrl = await logo.inputValue()
	await page.getByRole('button', { name: '保存设置', exact: true }).click()
	await expect(page.getByText('设置已保存', { exact: true })).toBeVisible()
	await page
		.getByRole('button', { name: '图片库', exact: true })
		.first()
		.click()
	await expect(page.getByText('站点设置：Logo', { exact: true })).toBeVisible()
	await page.getByRole('checkbox', { name: '仅显示未使用图片' }).check()
	await expect(page.getByText('没有符合条件的图片。')).toBeVisible()
	await page.getByRole('checkbox', { name: '仅显示未使用图片' }).uncheck()
	await page.getByRole('button', { name: '删除', exact: true }).click()
	await expect(
		page.getByRole('button', { name: '确认删除', exact: true }),
	).toBeDisabled()
	await page.getByRole('button', { name: '取消', exact: true }).click()
	await page.getByRole('button', { name: '关闭对话框', exact: true }).click()
	await page.goto('/admin?tab=backups')
	await page.getByRole('button', { name: '完整备份', exact: true }).click()
	await expect(page.getByText('完整备份已生成', { exact: true })).toBeVisible()
	await page.getByRole('button', { name: '校验', exact: true }).first().click()
	await expect(
		page.getByText('备份文件、校验清单及数据库检查通过', { exact: true }),
	).toBeVisible()
	const names = (await readdir(app.backupDir))
		.filter((name) => name.endsWith('.zip'))
		.sort()
	const archive = join(app.backupDir, names[names.length - 1])
	await app.stop()
	expect(app.cli('verify-backup', archive)).toContain('完整备份校验通过')
	expect(app.cli('restore', archive)).toContain('已恢复')
	await app.start()
	await login(page)
	const response = await page.request.get(imageUrl)
	expect(response.ok()).toBeTruthy()
	expect(await response.body()).toEqual(image)
})

test('a stale lazy resource offers an explicit refresh instead of reloading automatically', async ({
	page,
}) => {
	await page.route('**/assets/CommandPalette-*.js', (route) =>
		route.abort('failed'),
	)
	await page.goto('/')
	await expect(
		page.getByRole('heading', { name: '页面资源需要重新加载' }),
	).toBeVisible()
	await expect(
		page.getByRole('button', { name: '刷新页面', exact: true }),
	).toBeVisible()
	await page.unroute('**/assets/CommandPalette-*.js')
	await page.getByRole('button', { name: '刷新页面', exact: true }).click()
	await expect(
		page.getByRole('button', { name: 'AI', exact: true }),
	).toBeVisible()
	await page.keyboard.press('Control+k')
	await expect(
		page.getByRole('combobox', { name: '搜索站点或操作' }),
	).toBeVisible()
})

test('a stalled catalog times out and retry recovers', async ({ page }) => {
	await page.route('**/api/public/catalog', () => {})
	await page.goto('/')
	await expect(
		page.getByText('公共目录加载失败，个人收藏仍可使用。'),
	).toBeVisible()
	await page.unroute('**/api/public/catalog')
	await page.getByRole('button', { name: '重试', exact: true }).click()
	await expect(
		page.getByRole('button', { name: 'AI', exact: true }),
	).toBeVisible()
})
