import { useState } from 'react'
import { requestAdminApi } from '@/utils/adminApi'
import { type Settings, settingsSchema } from '../../../shared/catalog'
import {
	Checkbox,
	Field,
	inputClass,
	Panel,
	type RunAdminAction,
	SaveBar,
	useDirtyForm,
} from './ui'

const featureLabels: Record<keyof Settings['features'], string> = {
	bookmarkImport: '允许个人书签导入',
	bookmarkExport: '允许个人导出与备份',
	customSites: '允许个人添加和编辑',
	clearImported: '允许清空个人导入',
	hideBuiltin: '允许本地隐藏公共站点',
}
export function SettingsPanel({
	settings,
	csrf,
	runAction,
	busy,
}: {
	settings: Settings
	csrf: string
	runAction: RunAdminAction
	busy: boolean
}) {
	const [value, setValue] = useState(settings)
	const [error, setError] = useState('')
	const dirty = JSON.stringify(value) !== JSON.stringify(settings)
	useDirtyForm(dirty)
	return (
		<Panel
			title="外观与功能"
			description="公共设置作为默认值，已保存的个人主题偏好继续生效。"
		>
			<form
				onSubmit={(e) => {
					e.preventDefault()
					const parsed = settingsSchema.safeParse(value)
					if (!parsed.success)
						setError(
							parsed.error.issues.map((issue) => issue.message).join('；'),
						)
					else {
						setError('')
						void runAction(
							() => requestAdminApi('admin/settings', csrf, parsed.data, 'PUT'),
							'设置已保存',
						)
					}
				}}
			>
				<fieldset disabled={busy} className="grid sm:grid-cols-2 gap-4">
					<Field label="站名">
						<input
							required
							maxLength={100}
							className={inputClass}
							value={value.name}
							onChange={(e) => setValue({ ...value, name: e.target.value })}
						/>
					</Field>
					<Field label="Logo 地址（留空使用内置 Logo）">
						<input
							className={inputClass}
							value={value.logoUrl}
							placeholder="/logo.svg"
							onChange={(e) => setValue({ ...value, logoUrl: e.target.value })}
						/>
					</Field>
					<Field label="站点描述">
						<textarea
							className={inputClass}
							rows={3}
							maxLength={1000}
							value={value.description}
							onChange={(e) =>
								setValue({ ...value, description: e.target.value })
							}
						/>
					</Field>
					<Field label="默认主题（保留个人选择）">
						<select
							className={inputClass}
							value={value.defaultTheme}
							onChange={(e) =>
								setValue({
									...value,
									defaultTheme: e.target.value as Settings['defaultTheme'],
								})
							}
						>
							<option value="system">跟随系统</option>
							<option value="light">亮色</option>
							<option value="dark">暗色</option>
						</select>
					</Field>
					<div className="sm:col-span-2 grid sm:grid-cols-2 gap-3">
						<h3 className="sm:col-span-2 text-sm font-semibold border-t border-border pt-5">
							访客功能
						</h3>
						{Object.entries(featureLabels).map(([key, label]) => (
							<Checkbox
								key={key}
								card
								label={label}
								checked={value.features[key as keyof Settings['features']]}
								onChange={(checked) =>
									setValue({
										...value,
										features: { ...value.features, [key]: checked },
									})
								}
							/>
						))}
					</div>
					<Checkbox
						card
						className="sm:col-span-2"
						label="接收匿名收录申请"
						hint="关闭后停止新申请，历史记录仍可审核。验证码通过服务器环境配置。"
						checked={value.applicationsEnabled}
						onChange={(checked) =>
							setValue({ ...value, applicationsEnabled: checked })
						}
					/>
					<div className="sm:col-span-2 border-t border-border pt-5 space-y-2">
						<h3 className="text-sm font-semibold">图片与辅助服务</h3>
						<p className="text-xs text-muted-foreground leading-relaxed">
							默认使用本站资源和文字图标。外部服务按需启用，所有图片地址可填写站内路径。
						</p>
					</div>
					<Checkbox
						card
						className="sm:col-span-2"
						label="允许加载远程图片"
						hint="适用于站点图标、搜索引擎图标和 Logo。关闭时只加载同源图片，已有远程地址仍保留。"
						checked={value.remoteImagesEnabled}
						onChange={(checked) =>
							setValue({ ...value, remoteImagesEnabled: checked })
						}
					/>
					<Field label="默认站点图标模板（{domain}，留空使用文字图标）">
						<input
							className={inputClass}
							value={value.faviconTemplate}
							placeholder="/icons/{domain}.png"
							onChange={(e) =>
								setValue({ ...value, faviconTemplate: e.target.value })
							}
						/>
					</Field>
					<Checkbox
						card
						className="sm:col-span-2"
						label="启用链接标题与描述获取"
						hint="添加个人收藏时，会将目标网址发送给下方配置的代理。需要可用的代理并允许浏览器跨域访问；关闭后手动填写。"
						checked={value.metadataFetchEnabled}
						onChange={(checked) =>
							setValue({ ...value, metadataFetchEnabled: checked })
						}
					/>
					<Field label="元数据代理模板（{url}，留空停用）">
						<input
							className={inputClass}
							value={value.metadataProxyTemplate}
							placeholder="https://your-proxy.example/?url={url}"
							onChange={(e) =>
								setValue({ ...value, metadataProxyTemplate: e.target.value })
							}
						/>
					</Field>
					<Field label="自动备份间隔（小时）">
						<input
							type="number"
							min={1}
							max={8760}
							required
							className={inputClass}
							value={value.backupIntervalHours}
							onChange={(e) =>
								setValue({
									...value,
									backupIntervalHours: Number(e.target.value),
								})
							}
						/>
					</Field>
					<Field label="保留备份份数">
						<input
							type="number"
							min={1}
							max={365}
							required
							className={inputClass}
							value={value.backupKeep}
							onChange={(e) =>
								setValue({ ...value, backupKeep: Number(e.target.value) })
							}
						/>
					</Field>
					{error && (
						<p role="alert" className="text-error text-sm sm:col-span-2">
							{error}
						</p>
					)}
					<SaveBar dirty={dirty} busy={busy} label="保存设置" />
				</fieldset>
			</form>
		</Panel>
	)
}
