import { useEffect, useState } from 'react'
import { Link, useBlocker } from 'react-router'
import {
	buttonClass,
	Dialog,
	Field,
	inputClass,
	Panel,
	primaryClass,
} from '@/components/admin/ui'
import { TagInput } from '@/components/molecules/TagInput'
import { Turnstile } from '@/components/Turnstile'
import { publicApiUrl, usePublicCatalog } from '@/hooks/usePublicCatalog'
import { submissionSchema } from '../../shared/catalog'
import { createTagInput, readTagInput } from '../../shared/tags'

export default function Submit() {
	const catalog = usePublicCatalog()
	const [config, setConfig] = useState<{
		enabled: boolean
		siteKey: string
	} | null>(null)
	const [error, setError] = useState('')
	const [retry, setRetry] = useState(0)
	const [busy, setBusy] = useState(false)
	const [received, setReceived] = useState(false)
	const [value, setValue] = useState({
		name: '',
		url: '',
		description: '',
		suggestedCategory: '',
		website: '',
	})
	const [captchaToken, setCaptchaToken] = useState('')
	const [tags, setTags] = useState(() => createTagInput())
	const [captchaReset, setCaptchaReset] = useState(0)
	const dirty =
		!received &&
		Boolean(
			value.name ||
				value.url ||
				value.description ||
				value.suggestedCategory ||
				tags.tags.length ||
				tags.draft,
		)
	const blocker = useBlocker(dirty && !busy)
	// biome-ignore lint/correctness/useExhaustiveDependencies: retry explicitly reloads service configuration.
	useEffect(() => {
		if (import.meta.env.VITE_STATIC_MODE === 'true') {
			setConfig({ enabled: false, siteKey: '' })
			return
		}
		const controller = new AbortController()
		setError('')
		void fetch(`${publicApiUrl}/api/public/applications`, {
			signal: controller.signal,
			credentials: 'omit',
		})
			.then(async (response) => {
				if (
					!response.ok ||
					!response.headers.get('content-type')?.includes('application/json')
				)
					throw new Error('暂时无法连接收录服务，请稍后再试。')
				setConfig(await response.json())
			})
			.catch((error: unknown) => {
				if (!controller.signal.aborted)
					setError(error instanceof Error ? error.message : '收录服务不可用')
			})
		return () => controller.abort()
	}, [retry])
	useEffect(() => {
		const warn = (event: BeforeUnloadEvent) => {
			if (dirty) {
				event.preventDefault()
				event.returnValue = ''
			}
		}
		window.addEventListener('beforeunload', warn)
		return () => window.removeEventListener('beforeunload', warn)
	}, [dirty])
	return (
		<main className="min-h-screen bg-background text-foreground px-4 py-8 sm:py-14">
			<div className="mx-auto max-w-2xl space-y-6">
				<Link
					to="/"
					className="inline-flex text-sm text-muted-foreground hover:text-primary break-words"
				>
					← 返回 {catalog.settings.name}
				</Link>
				<div>
					<p className="text-xs tracking-widest text-primary mb-3">
						分享一个值得收藏的网站
					</p>
					<h1 className="text-3xl font-semibold tracking-tight">申请收录</h1>
					<p className="mt-3 text-sm text-muted-foreground leading-relaxed">
						无需注册或留下邮箱。提交后由管理员审核，通过后才会出现在公共目录。
					</p>
				</div>
				{received ? (
					<Panel
						title="申请已接收"
						description="感谢你的推荐。管理员会审核提交内容，申请不会立即公开；目前不提供处理状态查询或通知。"
					>
						<Link className={primaryClass} to="/">
							返回导航站
						</Link>
					</Panel>
				) : !config ? (
					<Panel title={error ? '暂时无法提交' : '正在连接收录服务'}>
						{error ? (
							<>
								<p role="alert" className="text-sm text-error">
									{error}
								</p>
								<button
									type="button"
									className={buttonClass}
									onClick={() => setRetry((n) => n + 1)}
								>
									重新连接
								</button>
							</>
						) : (
							<output className="text-sm text-muted-foreground">请稍候…</output>
						)}
					</Panel>
				) : !config.enabled ? (
					<Panel
						title="当前暂停接收申请"
						description="你仍可以在首页把站点添加到自己的浏览器。公共目录由管理员维护。"
					>
						<Link className={buttonClass} to="/">
							返回首页
						</Link>
					</Panel>
				) : (
					<Panel
						title="推荐网站"
						description="请填写公开的网站信息，避免提交私人链接或个人敏感信息。"
					>
						<form
							onSubmit={(event) => {
								event.preventDefault()
								const parsed = submissionSchema.safeParse({
									...value,
									tags: readTagInput(tags),
									captchaToken,
								})
								if (!parsed.success) {
									setError(
										parsed.error.issues
											.map((issue) => issue.message)
											.join('；'),
									)
									return
								}
								setError('')
								setBusy(true)
								void fetch(`${publicApiUrl}/api/public/applications`, {
									method: 'POST',
									credentials: 'omit',
									headers: { 'Content-Type': 'application/json' },
									body: JSON.stringify(parsed.data),
								})
									.then(async (response) => {
										const result = await response.json()
										if (!response.ok)
											throw new Error(result.error || '提交失败')
										setReceived(true)
									})
									.catch((error: unknown) => {
										setError(
											error instanceof Error
												? error.message
												: '提交失败，请稍后再试',
										)
										setCaptchaToken('')
										setCaptchaReset((n) => n + 1)
									})
									.finally(() => setBusy(false))
							}}
						>
							<fieldset disabled={busy} className="space-y-5">
								<Field
									label="网站名称"
									hint="使用网站公开的名称，最多 100 字。"
								>
									<input
										required
										className={inputClass}
										maxLength={100}
										autoComplete="off"
										value={value.name}
										onChange={(e) =>
											setValue({ ...value, name: e.target.value })
										}
									/>
								</Field>
								<Field label="网站地址">
									<input
										required
										type="url"
										className={inputClass}
										maxLength={4096}
										placeholder="https://example.com"
										autoComplete="url"
										value={value.url}
										onChange={(e) =>
											setValue({ ...value, url: e.target.value })
										}
									/>
								</Field>
								<Field label="推荐理由或描述（选填）">
									<textarea
										className={inputClass}
										rows={4}
										maxLength={1000}
										placeholder="这个网站有什么用途或特色？"
										value={value.description}
										onChange={(e) =>
											setValue({ ...value, description: e.target.value })
										}
									/>
								</Field>
								<Field label="建议分类（选填）">
									<select
										className={inputClass}
										value={value.suggestedCategory}
										onChange={(e) =>
											setValue({ ...value, suggestedCategory: e.target.value })
										}
									>
										<option value="">由管理员选择</option>
										{catalog.categories.map((c) => (
											<option key={c.id} value={c.name}>
												{c.name}
											</option>
										))}
									</select>
								</Field>
								<TagInput
									label="建议标签（选填）"
									hint="标签由管理员审核调整后公开，用于搜索与筛选。"
									value={tags}
									onChange={setTags}
								/>
								<div className="hidden" aria-hidden="true">
									<label>
										Website
										<input
											name="website"
											tabIndex={-1}
											autoComplete="off"
											value={value.website}
											onChange={(e) =>
												setValue({ ...value, website: e.target.value })
											}
										/>
									</label>
								</div>
								{config.siteKey && (
									<Turnstile
										key={captchaReset}
										siteKey={config.siteKey}
										onToken={setCaptchaToken}
									/>
								)}
								{error && (
									<p
										role="alert"
										className="rounded-md bg-error-bg border border-error/20 p-3 text-sm text-error break-words"
									>
										{error}
									</p>
								)}
								<button
									type="submit"
									disabled={busy || Boolean(config.siteKey && !captchaToken)}
									className={`${primaryClass} w-full`}
								>
									{busy ? '正在提交…' : '提交收录申请'}
								</button>
								<p className="text-xs text-muted-foreground leading-relaxed">
									这些内容会发送到本站服务器用于审核。个人书签与浏览器偏好不会随申请上传。
								</p>
							</fieldset>
						</form>
					</Panel>
				)}
			</div>
			{blocker.state === 'blocked' && (
				<Dialog
					title="放弃填写？"
					description="申请尚未提交，离开后填写的内容会丢失。"
					onClose={() => blocker.reset()}
					footer={
						<div className="flex flex-wrap justify-end gap-2">
							<button
								type="button"
								className={buttonClass}
								onClick={() => blocker.reset()}
							>
								继续填写
							</button>
							<button
								type="button"
								className={primaryClass}
								onClick={() => blocker.proceed()}
							>
								放弃并离开
							</button>
						</div>
					}
				/>
			)}
		</main>
	)
}
