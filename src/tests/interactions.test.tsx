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
