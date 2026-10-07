import type { Settings } from '../../../shared/catalog'
import { ImageField } from './ImageField'
import { buttonClass, dangerClass, Field, inputClass, Switch } from './ui'

type Presentation = Settings['presentation']
export function PresentationFields({
	value,
	onChange,
	csrf,
	onBusyChange,
}: {
	value: Presentation
	onChange: (update: (previous: Presentation) => Presentation) => void
	csrf: string
	onBusyChange: (busy: boolean) => void
}) {
	const set = <K extends keyof Presentation>(key: K, next: Presentation[K]) =>
		onChange((previous) => ({ ...previous, [key]: next }))
	return (
		<>
			<h3 className="sm:col-span-2 border-t border-border pt-5 text-sm font-semibold">
				品牌与分享
			</h3>
			{(
				[
					['logoDarkUrl', '深色模式 Logo（留空复用普通 Logo）'],
					['faviconUrl', '浏览器标签页图标'],
					['touchIconUrl', '移动端收藏图标'],
					['shareImageUrl', '分享封面'],
				] as const
			).map(([key, label]) => (
				<ImageField
					key={key}
					label={label}
					csrf={csrf}
					onBusyChange={onBusyChange}
					value={value[key]}
					onChange={(url) => set(key, url)}
				/>
			))}
			{(
				[
					['subtitle', '顶部副标题（留空使用站点描述）', 200],
					['author', '站点作者（留空使用站名）', 100],
					['keywords', '搜索关键词（逗号分隔）', 500],
					['searchPlaceholder', '首页搜索框提示', 100],
				] as const
			).map(([key, label, max]) => (
				<Field key={key} label={label}>
					<input
						className={inputClass}
						maxLength={max}
						required={key === 'searchPlaceholder'}
						value={value[key]}
						onChange={(event) => set(key, event.target.value)}
					/>
				</Field>
			))}
			<h3 className="sm:col-span-2 border-t border-border pt-5 text-sm font-semibold">
				站内信息与页脚
			</h3>
			{(
				[
					['announcement', '首页公告（留空隐藏）', 2000],
					['infoText', '信息面板说明（留空隐藏）', 2000],
					['aboutIntro', '站点介绍（支持换行，留空使用站点描述）', 10000],
					['footerText', '页脚文字（留空隐藏）', 1000],
				] as const
			).map(([key, label, max]) => (
				<Field key={key} label={label}>
					<textarea
						className={inputClass}
						rows={3}
						maxLength={max}
						value={value[key]}
						onChange={(event) => set(key, event.target.value)}
					/>
				</Field>
			))}
			<div className="sm:col-span-2 space-y-3">
				<h4 className="text-sm font-medium">
					页脚链接（最多 8 项，可填写站内路径）
				</h4>
				{value.footerLinks.map((link, index) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: Fully controlled rows have no local state; URLs and labels remain editable.
						key={index}
						className="grid sm:grid-cols-[1fr_2fr_auto] gap-2 items-end"
					>
						<Field label={`链接 ${index + 1} 名称`}>
							<input
								className={inputClass}
								value={link.label}
								required
								maxLength={60}
								onChange={(event) =>
									onChange((previous) => ({
										...previous,
										footerLinks: previous.footerLinks.map((item, i) =>
											i === index
												? { ...item, label: event.target.value }
												: item,
										),
									}))
								}
							/>
						</Field>
						<Field label={`链接 ${index + 1} 地址`}>
							<input
								className={inputClass}
								value={link.url}
								required
								maxLength={4096}
								onChange={(event) =>
									onChange((previous) => ({
										...previous,
										footerLinks: previous.footerLinks.map((item, i) =>
											i === index ? { ...item, url: event.target.value } : item,
										),
									}))
								}
							/>
						</Field>
						<button
							type="button"
							className={dangerClass}
							onClick={() =>
								onChange((previous) => ({
									...previous,
									footerLinks: previous.footerLinks.filter(
										(_, i) => i !== index,
									),
								}))
							}
						>
							移除
						</button>
					</div>
				))}
				<button
					type="button"
					className={buttonClass}
					disabled={value.footerLinks.length >= 8}
					onClick={() =>
						onChange((previous) => ({
							...previous,
							footerLinks: [...previous.footerLinks, { label: '', url: '' }],
						}))
					}
				>
					新增页脚链接
				</button>
			</div>
			<h3 className="sm:col-span-2 border-t border-border pt-5 text-sm font-semibold">
				内容显示
			</h3>
			{(
				[
					['showInfoPanel', '显示首页信息面板'],
					['showClock', '信息面板显示时钟'],
					['showStats', '显示站点与分类统计'],
					['showAboutGuide', '显示内置使用指南'],
				] as const
			).map(([key, label]) => (
				<Switch
					key={key}
					label={label}
					checked={value[key]}
					onChange={(checked) => set(key, checked)}
				/>
			))}
		</>
	)
}
