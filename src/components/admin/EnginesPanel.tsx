import { useState } from 'react'
import { requestAdminApi } from '@/utils/adminApi'
import type { Engine } from '../../../shared/catalog'
import {
	buttonClass,
	Field,
	inputClass,
	Panel,
	type RunAdminAction,
	SaveBar,
	Switch,
	useDirtyForm,
} from './ui'

export function EnginesPanel({
	engines,
	csrf,
	runAction,
	busy,
}: {
	engines: Engine[]
	csrf: string
	runAction: RunAdminAction
	busy: boolean
}) {
	const [items, setItems] = useState(engines)
	const dirty = JSON.stringify(items) !== JSON.stringify(engines)
	useDirtyForm(dirty)
	const update = (index: number, patch: Partial<Engine>) =>
		setItems(
			items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
		)
	const move = (index: number, direction: number) => {
		const next = [...items]
		const target = index + direction
		if (target < 0 || target >= next.length) return
		;[next[index], next[target]] = [next[target], next[index]]
		setItems(next)
	}
	return (
		<Panel title="搜索引擎">
			<p className="text-sm text-muted-foreground">
				后台停用的引擎不再向访客提供，已有个人顺序保留；新引擎按这里的顺序追加。
			</p>
			<form
				onSubmit={(e) => {
					e.preventDefault()
					void runAction(
						() => requestAdminApi('admin/engines', csrf, items, 'PUT'),
						'搜索引擎已保存',
					)
				}}
			>
				<fieldset disabled={busy} className="space-y-4">
					{items.map((engine, index) => (
						<div
							key={engine.id}
							className="rounded-lg border border-border p-4 grid sm:grid-cols-2 gap-3"
						>
							<Field label="名称">
								<input
									required
									className={inputClass}
									value={engine.name}
									onChange={(e) => update(index, { name: e.target.value })}
								/>
							</Field>
							<Field label="图标 URL">
								<input
									className={inputClass}
									value={engine.iconUrl}
									onChange={(e) => update(index, { iconUrl: e.target.value })}
								/>
							</Field>
							<div className="sm:col-span-2">
								<Field label="搜索 URL 模板（必须包含 {q}）">
									<input
										required
										className={inputClass}
										value={engine.searchUrl}
										onChange={(e) =>
											update(index, { searchUrl: e.target.value })
										}
									/>
								</Field>
							</div>
							<div className="sm:col-span-2 flex flex-wrap items-center gap-2">
								<Switch
									className="mr-auto"
									label="启用"
									checked={engine.enabled}
									onChange={(checked) => update(index, { enabled: checked })}
								/>
								<button
									type="button"
									className={buttonClass}
									disabled={index === 0}
									onClick={() => move(index, -1)}
								>
									上移
								</button>
								<button
									type="button"
									className={buttonClass}
									disabled={index === items.length - 1}
									onClick={() => move(index, 1)}
								>
									下移
								</button>
								<button
									type="button"
									className={`${buttonClass} text-error`}
									onClick={() =>
										setItems(items.filter((item) => item.id !== engine.id))
									}
								>
									移除
								</button>
							</div>
						</div>
					))}
					<div className="flex gap-2">
						<button
							type="button"
							className={buttonClass}
							onClick={() =>
								setItems([
									...items,
									{
										id: crypto.randomUUID(),
										name: '',
										searchUrl: '',
										iconUrl: '',
										enabled: true,
									},
								])
							}
						>
							新增引擎
						</button>
					</div>
					<SaveBar dirty={dirty} busy={busy} label="保存全部引擎" />
				</fieldset>
			</form>
		</Panel>
	)
}
