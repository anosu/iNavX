import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Window } from 'happy-dom'
import { act, type ReactNode, useState } from 'react'

const browser = new Window({ url: 'http://localhost:5173' })
for (const [key, value] of Object.entries({
	window: browser,
	document: browser.document,
	navigator: browser.navigator,
	localStorage: browser.localStorage,
	Node: browser.Node,
	Event: browser.Event,
	CustomEvent: browser.CustomEvent,
	KeyboardEvent: browser.KeyboardEvent,
	DOMParser: browser.DOMParser,
	HTMLElement: browser.HTMLElement,
	HTMLInputElement: browser.HTMLInputElement,
	getComputedStyle: browser.getComputedStyle.bind(browser),
	requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
	cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
	IS_REACT_ACT_ENVIRONMENT: true,
}))
	Object.defineProperty(globalThis, key, { configurable: true, value })

const { createRoot } = await import('react-dom/client')
const { NavCard } = await import('../components/molecules/NavCard')
const { SiteTags } = await import('../components/molecules/SiteTags')
const { CategoryFilter } = await import(
	'../components/molecules/CategoryFilter'
)
const { SiteFormModal } = await import('../components/organisms/SiteFormModal')
const { useSiteManager } = await import('../hooks/useSiteManager')
const { useSiteMetadata } = await import('../hooks/useSiteMetadata')
const { useCopyLink } = await import('../hooks/useCopyLink')
const { CommandPalette } = await import(
	'../components/organisms/CommandPalette'
)
const { useCommandShortcut } = await import('../hooks/useCommandShortcut')
const { useTheme } = await import('../hooks/useTheme')
const { searchCommandSites } = await import('../utils/commandSearch')
const { readRecentSites, recordSiteOpen, clearRecentSites } = await import(
	'../utils/recentSites'
)

test('command search excludes unrelated pins and recent history is bounded, deduplicated and removable', () => {
	const sites = [
		{
			id: 'pin',
			name: 'Unrelated',
			url: 'https://pin.test',
			description: '',
			category: 'Other',
			pinned: true,
		},
		{
			id: 'match',
			name: 'Example',
			url: 'https://example.test',
			description: '',
			category: 'Tools',
		},
	]
	assert.deepEqual(
		searchCommandSites(sites, 'example').map((site) => site.id),
		['match'],
	)
	assert.deepEqual(searchCommandSites(sites, 'missing'), [])
	localStorage.setItem('inav-recent-sites', 'invalid json')
	assert.deepEqual(readRecentSites(), [])
	for (let i = 0; i < 25; i++) recordSiteOpen(`https://site${i}.test`)
	recordSiteOpen('https://site0.test')
	recordSiteOpen('https://site0.test')
	assert.equal(readRecentSites().length, 20)
	assert.equal(readRecentSites()[0], 'https://site0.test')
	clearRecentSites()
	assert.deepEqual(readRecentSites(), [])
})

test('command shortcut toggles from its input, ignores repeats and protects other dialogs', async (t) => {
	function Harness() {
		const [open, setOpen] = useState(false)
		useCommandShortcut(open, () => setOpen((value) => !value))
		return (
			<>
				<button type="button">Trigger</button>
				<CommandPalette
					open={open}
					onClose={() => setOpen(false)}
					sites={[]}
					actions={[]}
					engines={[]}
					onCategorySelect={() => {}}
					onTagSelect={() => {}}
				/>
			</>
		)
	}
	const view = await mount(<Harness />)
	t.after(view.dispose)
	const trigger = view.container.querySelector('button')
	assert.ok(trigger)
	trigger.focus()
	const press = async (target: EventTarget, repeat = false, meta = false) => {
		const event = new KeyboardEvent('keydown', {
			key: 'k',
			ctrlKey: !meta,
			metaKey: meta,
			repeat,
			bubbles: true,
			cancelable: true,
		})
		await act(() => target.dispatchEvent(event))
		return event
	}
	assert.equal((await press(trigger)).defaultPrevented, true)
	const input = view.container.querySelector('input')
	assert.ok(input)
	assert.ok(input)
	await press(input, true)
	assert.ok(view.container.querySelector('dialog'))
	assert.equal((await press(input, false, true)).defaultPrevented, true)
	assert.equal(view.container.querySelector('dialog'), null)
	assert.equal(document.activeElement, trigger)
	const editor = document.createElement('dialog')
	editor.setAttribute('open', '')
	document.body.appendChild(editor)
	assert.equal((await press(editor)).defaultPrevented, true)
	assert.equal(view.container.querySelector('dialog'), null)
	editor.remove()
})

test('command groups support actions, filters, engines, history clearing and IME input', async (t) => {
	localStorage.clear()
	recordSiteOpen('https://visible.test')
	recordSiteOpen('https://hidden.test')
	let selected = ''
	let opened = ''
	let closed = 0
	const originalOpen = window.open
	window.open = ((url: string) => {
		opened = url
		return null
	}) as typeof window.open
	t.after(() => {
		window.open = originalOpen
	})
	const view = await mount(
		<CommandPalette
			open
			onClose={() => {
				closed++
			}}
			sites={[
				{
					id: 'visible',
					source: 'builtin',
					name: 'Visible',
					url: 'https://visible.test',
					description: 'Useful',
					category: 'Long category',
					tags: ['Long tag'],
				},
				{
					id: 'personal',
					name: 'Personal',
					url: 'https://personal.test',
					description: '',
					category: 'Other',
					source: 'custom',
				},
			]}
			siteActions={[
				{
					id: 'copy',
					label: '复制链接',
					detail: '复制网站地址',
					isAvailable: () => true,
					run: (site) => {
						selected = `copy:${site.id}`
					},
				},
				{
					id: 'hide',
					label: '本地隐藏',
					detail: '仅隐藏公共站点',
					isAvailable: (site) => site.source === 'builtin',
					run: (site) => {
						selected = `hide:${site.id}`
					},
				},
			]}
			actions={[
				{
					id: 'add',
					label: '添加站点',
					detail: '个人收藏',
					run: () => {
						selected = 'add'
					},
				},
			]}
			engines={[
				{
					id: 'search',
					name: 'Search',
					searchUrl: 'https://search.test/?q={q}',
					enabled: true,
					iconUrl: '',
				},
			]}
			onCategorySelect={(category) => {
				selected = category
			}}
			onTagSelect={(tag) => {
				selected = tag
			}}
		/>,
	)
	t.after(view.dispose)
	assert.ok(view.container.textContent?.includes('最近打开'))
	assert.ok(!view.container.textContent?.includes('hidden.test'))
	const input = view.container.querySelector('input')
	assert.ok(input)
	const type = async (value: string) => {
		await act(() => {
			const setValue = Object.getOwnPropertyDescriptor(
				browser.HTMLInputElement.prototype,
				'value',
			)?.set
			assert.ok(setValue)
			setValue.call(input, value)
			input.dispatchEvent(new Event('input', { bubbles: true }))
		})
	}
	const choose = async (text: string) => {
		const button = [
			...view.container.querySelectorAll<HTMLButtonElement>('[role="option"]'),
		].find((item) => item.textContent?.includes(text))
		assert.ok(button, text)
		await act(() => button.click())
	}
	await type('>clear-history')
	assert.equal(view.container.querySelectorAll('[role="option"]').length, 1)
	const removeItem = browser.localStorage.removeItem.bind(browser.localStorage)
	Object.defineProperty(browser.localStorage, 'removeItem', {
		configurable: true,
		value: () => {
			throw new Error('Storage blocked')
		},
	})
	try {
		await choose('清空最近打开记录')
		assert.ok(
			view.container
				.querySelector('[role="alert"]')
				?.textContent?.includes('清除失败'),
		)
		assert.equal(readRecentSites().length, 2)
		assert.equal(closed, 0)
	} finally {
		Object.defineProperty(browser.localStorage, 'removeItem', {
			configurable: true,
			value: removeItem,
		})
	}
	await choose('清空最近打开记录')
	assert.deepEqual(readRecentSites(), [])
	assert.equal(closed, 0)
	await type('Long')
	await choose('查看此分类的站点')
	assert.equal(selected, 'Long category')
	await choose('按此标签筛选站点')
	assert.equal(selected, 'Long tag')
	await type('hello & world')
	await choose('用 Search 搜索')
	assert.equal(opened, 'https://search.test/?q=hello%20%26%20world')
	await type('>添加')
	assert.equal(view.container.querySelectorAll('[role="option"]').length, 1)
	await act(() =>
		input.dispatchEvent(
			new KeyboardEvent('keydown', {
				key: 'Enter',
				isComposing: true,
				bubbles: true,
				cancelable: true,
			}),
		),
	)
	assert.equal(selected, 'Long tag')
	await act(() =>
		input.dispatchEvent(
			new KeyboardEvent('keydown', {
				key: 'Enter',
				keyCode: 229,
				bubbles: true,
				cancelable: true,
			}),
		),
	)
	assert.equal(selected, 'Long tag')
	await act(() =>
		input.dispatchEvent(
			new KeyboardEvent('keydown', {
				key: 'Enter',
				bubbles: true,
				cancelable: true,
			}),
		),
	)
	assert.equal(selected, 'add')
	selected = ''
	await type('>ADD')
	assert.equal(view.container.querySelectorAll('[role="option"]').length, 1)
	assert.equal(
		view.container.querySelector('[role="option"] .font-mono')?.textContent,
		'add',
	)
	await act(() =>
		input.dispatchEvent(
			new KeyboardEvent('keydown', {
				key: 'Enter',
				bubbles: true,
				cancelable: true,
			}),
		),
	)
	assert.equal(selected, 'add')
	await type('add')
	assert.ok(
		view.container
			.querySelector('[role="option"]')
			?.textContent?.includes('添加站点'),
	)
	await type('>missing')
	await act(() =>
		input.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
		),
	)
	assert.equal(input.getAttribute('aria-activedescendant'), null)
	await type('Visible')
	await choose('Visible')
	assert.equal(readRecentSites()[0], 'https://visible.test')
	clearRecentSites()
	await type('>copy Personal')
	assert.equal(view.container.querySelectorAll('[role="option"]').length, 1)
	await act(() =>
		input.dispatchEvent(
			new KeyboardEvent('keydown', {
				key: 'Enter',
				bubbles: true,
				cancelable: true,
			}),
		),
	)
	assert.equal(selected, 'copy:personal')
	assert.deepEqual(readRecentSites(), [])
	await type('>hide Personal')
	assert.equal(view.container.querySelectorAll('[role="option"]').length, 0)
	await type('>hide')
	assert.equal(view.container.querySelectorAll('[role="option"]').length, 1)
	await act(() =>
		input.dispatchEvent(
			new KeyboardEvent('keydown', {
				key: 'Enter',
				bubbles: true,
				cancelable: true,
			}),
		),
	)
	assert.equal(selected, 'hide:visible')
	await type('>复制链接')
	assert.equal(view.container.querySelectorAll('[role="option"]').length, 2)
	await type('>cop')
	const previousClosed = closed
	await act(() =>
		input.dispatchEvent(
			new KeyboardEvent('keydown', {
				key: 'Enter',
				bubbles: true,
				cancelable: true,
			}),
		),
	)
	assert.equal(input.value, '>copy ')
	assert.equal(closed, previousClosed)
	assert.equal(document.activeElement, input)
	await act(() =>
		input.dispatchEvent(
			new KeyboardEvent('keydown', {
				key: 'Enter',
				repeat: true,
				bubbles: true,
				cancelable: true,
			}),
		),
	)
	assert.equal(closed, previousClosed)
	assert.equal(selected, 'hide:visible')
})

test('clipboard fallback copies inside the active dialog and restores focus', async (t) => {
	const { copyText } = await import('../utils/clipboard')
	const dialog = document.createElement('dialog')
	dialog.setAttribute('open', '')
	const input = document.createElement('input')
	dialog.appendChild(input)
	document.body.appendChild(dialog)
	input.focus()
	const originalExec = document.execCommand
	t.after(() => {
		document.execCommand = originalExec
		dialog.remove()
	})
	let copied = ''
	document.execCommand = () => {
		const temporary = dialog.querySelector('textarea')
		assert.ok(temporary)
		assert.equal(document.activeElement, temporary)
		copied = temporary.value
		return true
	}
	await copyText('https://example.test')
	assert.equal(copied, 'https://example.test')
	assert.equal(dialog.querySelector('textarea'), null)
	assert.equal(document.activeElement, input)
})

test('theme commands and header toggles stay synchronized', async (t) => {
	localStorage.setItem('inav-theme', 'light')
	function Toggle() {
		const { isDark, toggleTheme } = useTheme()
		return (
			<button type="button" onClick={toggleTheme}>
				{isDark ? 'dark' : 'light'}
			</button>
		)
	}
	const view = await mount(
		<>
			<Toggle />
			<Toggle />
		</>,
	)
	t.after(view.dispose)
	const buttons = view.container.querySelectorAll('button')
	await act(() => buttons[0].click())
	assert.deepEqual(
		[...buttons].map((button) => button.textContent),
		['dark', 'dark'],
	)
	await act(() => buttons[1].click())
	assert.deepEqual(
		[...buttons].map((button) => button.textContent),
		['light', 'light'],
	)
})

async function mount(content: ReactNode) {
	const container = document.createElement('div')
	document.body.appendChild(container)
	const root = createRoot(container)
	await act(() => root.render(content))
	return {
		container,
		dispose: async () => {
			await act(() => root.unmount())
			container.remove()
		},
	}
}

test('failed personal writes preserve state; successful batched additions have unique IDs', async (t) => {
	localStorage.clear()
	let manager: ReturnType<typeof useSiteManager> | undefined
	function Harness() {
		manager = useSiteManager()
		return <span>{manager.customSites.length}</span>
	}
	const view = await mount(<Harness />)
	t.after(view.dispose)
	assert.ok(manager)
	const payload = {
		name: 'Example',
		url: 'https://example.test',
		description: 'Example site',
		category: '开发',
	}
	const original = browser.localStorage.setItem.bind(browser.localStorage)
	Object.defineProperty(browser.localStorage, 'setItem', {
		configurable: true,
		value: () => {
			throw new Error('Quota exceeded')
		},
	})
	t.after(() =>
		Object.defineProperty(browser.localStorage, 'setItem', {
			configurable: true,
			value: original,
		}),
	)
	await act(() => assert.throws(() => manager?.addSite(payload), /保存失败/))
	assert.equal(view.container.textContent, '0')
	assert.equal(localStorage.getItem('inav-custom-sites'), null)
	Object.defineProperty(browser.localStorage, 'setItem', {
		configurable: true,
		value: original,
	})
	await act(() => {
		manager?.addSite(payload)
		manager?.addSite({ ...payload, url: 'https://another.test' })
	})
	assert.equal(view.container.textContent, '2')
	const stored = JSON.parse(localStorage.getItem('inav-custom-sites') || '[]')
	assert.equal(new Set(stored.map((site: { id: string }) => site.id)).size, 2)
})

test('site cards keep action buttons outside links and display a category badge', async (t) => {
	let edited = false
	const view = await mount(
		<NavCard
			site={{
				id: 'test',
				name: 'Example',
				url: 'https://example.test',
				description: 'Description',
				category: '开发工具',
				source: 'custom',
				tags: ['tag'],
			}}
			onEdit={() => {
				edited = true
			}}
		/>,
	)
	t.after(view.dispose)
	assert.equal(view.container.querySelector('a button'), null)
	assert.ok(view.container.querySelector('.badge-primary[title="开发工具"]'))
	assert.equal(view.container.querySelector('a .badge-primary'), null)
	const edit = view.container.querySelector<HTMLButtonElement>(
		'button[aria-label="编辑"]',
	)
	assert.ok(edit)
	await act(() => edit.click())
	assert.equal(edited, true)
	const originalUA = Object.getOwnPropertyDescriptor(navigator, 'userAgent')
	Object.defineProperty(navigator, 'userAgent', {
		configurable: true,
		value: 'iPhone',
	})
	t.after(() => {
		if (originalUA) Object.defineProperty(navigator, 'userAgent', originalUA)
		else Reflect.deleteProperty(navigator, 'userAgent')
	})
	const iosView = await mount(
		<NavCard
			site={{
				id: 'ios',
				name: 'iOS',
				url: 'https://ios.test',
				description: 'Description',
				category: '开发工具',
				source: 'custom',
			}}
			onEdit={() => {}}
		/>,
	)
	t.after(iosView.dispose)
	assert.ok(iosView.container.querySelector('button[aria-label="更多操作"]'))
	assert.equal(iosView.container.querySelector('[role="toolbar"]'), null)
	assert.equal(iosView.container.querySelector('a button'), null)
})

test('category arrows reflect overflow and edges, and selected categories scroll within the list', async (t) => {
	const originalObserver = Object.getOwnPropertyDescriptor(
		window,
		'ResizeObserver',
	)
	Object.defineProperty(window, 'ResizeObserver', {
		configurable: true,
		value: undefined,
	})
	t.after(() => {
		if (originalObserver)
			Object.defineProperty(window, 'ResizeObserver', originalObserver)
		else Reflect.deleteProperty(window, 'ResizeObserver')
	})
	const categories = ['开发工具', 'DeveloperProductivityAndAutomationResources']
	function Harness() {
		const [active, setActive] = useState<string | null>(null)
		return (
			<CategoryFilter
				categories={categories}
				activeCategory={active}
				onChange={setActive}
			/>
		)
	}
	const view = await mount(<Harness />)
	t.after(view.dispose)
	assert.equal(
		view.container.querySelector('[aria-label="向右滚动分类"]'),
		null,
	)
	const container = view.container.querySelector('fieldset')
	const scroller = container?.querySelector<HTMLDivElement>('div[id]')
	const content = scroller?.firstElementChild
	assert.ok(container && scroller && content)
	let width = 320
	Object.defineProperty(container, 'clientWidth', {
		configurable: true,
		get: () => width,
	})
	Object.defineProperties(scroller, {
		clientWidth: { configurable: true, get: () => width - 72 },
		scrollWidth: { configurable: true, value: 800 },
	})
	Object.defineProperty(content, 'scrollWidth', {
		configurable: true,
		value: 800,
	})
	scroller.getBoundingClientRect = () =>
		new browser.DOMRect(0, 0, scroller.clientWidth, 32)
	const chips = content.querySelectorAll<HTMLButtonElement>('button')
	for (const [index, chip] of chips.entries()) {
		chip.getBoundingClientRect = () =>
			new browser.DOMRect(4 + index * 300 - scroller.scrollLeft, 0, 192, 24)
	}
	const scrolls: ScrollToOptions[] = []
	scroller.scrollBy = (options: ScrollToOptions | number = {}, _y?: number) => {
		assert.equal(typeof options, 'object')
		const value = options as ScrollToOptions
		scrolls.push(value)
		scroller.scrollLeft = Math.max(
			0,
			Math.min(
				800 - scroller.clientWidth,
				scroller.scrollLeft + (value.left ?? 0),
			),
		)
		scroller.dispatchEvent(new Event('scroll'))
	}
	await act(() => window.dispatchEvent(new Event('resize')))
	const left = view.container.querySelector<HTMLButtonElement>(
		'[aria-label="向左滚动分类"]',
	)
	const right = view.container.querySelector<HTMLButtonElement>(
		'[aria-label="向右滚动分类"]',
	)
	assert.ok(left && right)
	assert.equal(left.disabled, true)
	assert.equal(right.disabled, false)
	await act(() => right.click())
	assert.equal(scroller.scrollLeft, 186)
	assert.equal(left.disabled, false)
	await act(() => chips[2]?.click())
	assert.equal(scroller.scrollLeft, 552)
	assert.equal(right.disabled, true)
	await act(() => chips[0]?.click())
	assert.equal(scroller.scrollLeft, 0)
	assert.equal(left.disabled, true)
	assert.ok(scrolls.length >= 3)
	assert.ok(scrolls.every((options) => options.top === undefined))
	width = 1000
	await act(() => window.dispatchEvent(new Event('resize')))
	assert.equal(
		view.container.querySelector('[aria-label="向左滚动分类"]'),
		null,
	)
	assert.equal(
		view.container.querySelector('[aria-label="向右滚动分类"]'),
		null,
	)
})

test('tag lists work without native Popover, close on Escape and resize, and return focus', async (t) => {
	assert.equal(typeof HTMLElement.prototype.hidePopover, 'undefined')
	Object.defineProperty(document.documentElement, 'clientWidth', {
		configurable: true,
		value: 390,
	})
	let selected = ''
	const view = await mount(
		<SiteTags
			name="Example"
			tags={['one', 'two', 'with,comma']}
			onTagSelect={(tag) => {
				selected = tag
			}}
		/>,
	)
	t.after(view.dispose)
	const trigger = view.container.querySelector<HTMLButtonElement>(
		'button[aria-haspopup="dialog"]',
	)
	assert.ok(trigger)
	const first = view.container.querySelector<HTMLButtonElement>(
		'button[aria-label="筛选标签：one"]',
	)
	assert.ok(first)
	await act(() => first.click())
	assert.equal(selected, 'one')
	await act(() => trigger.click())
	assert.ok(document.querySelector('[role="dialog"]'))
	await act(() =>
		document.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
		),
	)
	assert.equal(document.querySelector('[role="dialog"]'), null)
	assert.equal(document.activeElement, trigger)
	await act(() => trigger.click())
	await act(() => window.dispatchEvent(new Event('resize')))
	assert.equal(document.querySelector('[role="dialog"]'), null)
	await act(() => trigger.click())
	const commaTag = document.querySelector<HTMLButtonElement>(
		'[role="dialog"] button[aria-label="筛选标签：with,comma"]',
	)
	assert.ok(commaTag)
	await act(() => commaTag.click())
	assert.equal(selected, 'with,comma')
	assert.equal(document.querySelector('[role="dialog"]'), null)
})

test('one or two truncated tags expose the full list and respond to available width', async (t) => {
	const originalObserver = Object.getOwnPropertyDescriptor(
		window,
		'ResizeObserver',
	)
	Object.defineProperty(window, 'ResizeObserver', {
		configurable: true,
		value: undefined,
	})
	t.after(() => {
		if (originalObserver)
			Object.defineProperty(window, 'ResizeObserver', originalObserver)
		else Reflect.deleteProperty(window, 'ResizeObserver')
	})
	for (const tags of [
		['面向中文长文档分析与复杂代码审查的人工智能助手'],
		['ArtificialIntelligenceDeveloperTools', 'ContinuousIntegrationAutomation'],
	]) {
		const view = await mount(
			<SiteTags name="Long tags" tags={tags} onTagSelect={() => {}} />,
		)
		try {
			assert.equal(
				view.container.querySelector('[aria-haspopup="dialog"]'),
				null,
			)
			const label = view.container.querySelector('.site-tag span')
			assert.ok(label)
			Object.defineProperties(label, {
				clientWidth: { configurable: true, value: 40 },
				scrollWidth: { configurable: true, value: 300 },
			})
			await act(() => window.dispatchEvent(new Event('resize')))
			const trigger = view.container.querySelector<HTMLButtonElement>(
				'[aria-haspopup="dialog"]',
			)
			assert.ok(trigger)
			assert.equal(trigger.textContent, '…')
			await act(() => trigger.click())
			const dialog = document.querySelector('[role="dialog"]')
			assert.ok(dialog)
			assert.equal(dialog.querySelectorAll('.site-tag').length, tags.length)
			for (const tag of tags) assert.ok(dialog.textContent?.includes(tag))
			Object.defineProperty(label, 'clientWidth', {
				configurable: true,
				value: 400,
			})
			await act(() => window.dispatchEvent(new Event('resize')))
			assert.equal(document.querySelector('[role="dialog"]'), null)
			assert.equal(
				view.container.querySelector('[aria-haspopup="dialog"]'),
				null,
			)
		} finally {
			await view.dispose()
		}
	}
})

test('failed form submissions keep the dialog and draft open with a visible error', async (t) => {
	let closed = false
	const view = await mount(
		<SiteFormModal
			open
			editSite={{
				id: 'edit',
				name: 'Draft',
				url: 'https://draft.test',
				description: 'Keep this',
				category: '开发',
				source: 'custom',
			}}
			categories={['开发']}
			onClose={() => {
				closed = true
			}}
			onSubmit={() => {
				throw new Error('保存失败：容量不足')
			}}
		/>,
	)
	t.after(view.dispose)
	const form = view.container.querySelector('form')
	assert.ok(form)
	await act(() =>
		form.dispatchEvent(
			new Event('submit', { bubbles: true, cancelable: true }),
		),
	)
	assert.equal(closed, false)
	assert.equal(
		view.container.querySelector('.dialog-footer [role="alert"]')?.textContent,
		'保存失败：容量不足',
	)
	assert.equal(
		view.container.querySelector<HTMLInputElement>('input')?.value,
		'Draft',
	)
})

test('metadata refresh preserves manual edits and ignores responses for an old URL', async (t) => {
	const originalFetch = globalThis.fetch
	t.after(() => {
		globalThis.fetch = originalFetch
	})
	let resolveRequest: ((response: Response) => void) | undefined
	globalThis.fetch = () =>
		new Promise<Response>((resolve) => {
			resolveRequest = resolve
		})
	let metadata: ReturnType<typeof useSiteMetadata> | undefined
	let edit: ((name: string, url?: string) => void) | undefined
	function Harness() {
		const [form, setForm] = useState({
			name: 'Initial title',
			description: 'Initial description',
			url: 'https://initial.test',
			category: '开发',
		})
		metadata = useSiteMetadata(true, true, form, setForm, '/metadata?url={url}')
		edit = (name, url) =>
			setForm((previous) => ({ ...previous, name, url: url ?? previous.url }))
		return (
			<p>
				{form.name} | {form.description} | {metadata.fetchStatus}
			</p>
		)
	}
	const view = await mount(<Harness />)
	t.after(view.dispose)
	await act(() => metadata?.handleRefreshMeta())
	await act(() => edit?.('Manual title'))
	await act(async () => {
		resolveRequest?.(
			new Response(
				'<title>Remote title</title><meta name="description" content="Remote description">',
			),
		)
	})
	assert.equal(
		view.container.textContent,
		'Manual title | Remote description | done',
	)
	await act(() => metadata?.handleRefreshMeta())
	await act(() => edit?.('New site', 'https://new.test'))
	await act(async () => {
		resolveRequest?.(new Response('<title>Stale title</title>'))
	})
	assert.equal(
		view.container.textContent,
		'New site | Remote description | idle',
	)
})

test('clipboard rejection is handled, temporary elements are removed and focus is restored', async (t) => {
	const previousClipboard = Object.getOwnPropertyDescriptor(
		navigator,
		'clipboard',
	)
	const originalExec = document.execCommand
	Object.defineProperty(navigator, 'clipboard', {
		configurable: true,
		value: {
			writeText: async () => {
				throw new Error('Permission denied')
			},
		},
	})
	document.execCommand = () => {
		throw new Error('Unsupported')
	}
	t.after(() => {
		document.execCommand = originalExec
		if (previousClipboard)
			Object.defineProperty(navigator, 'clipboard', previousClipboard)
		else Reflect.deleteProperty(navigator, 'clipboard')
	})
	function Harness() {
		const { copyLink, copyFailed } = useCopyLink('https://example.test')
		return (
			<button type="button" onClick={() => void copyLink()}>
				{copyFailed ? 'failed' : 'copy'}
			</button>
		)
	}
	const view = await mount(<Harness />)
	t.after(view.dispose)
	const button = view.container.querySelector('button')
	assert.ok(button)
	button.focus()
	await act(async () => button.click())
	assert.equal(view.container.textContent, 'failed')
	assert.equal(document.querySelector('textarea'), null)
	assert.equal(document.activeElement, button)
})
