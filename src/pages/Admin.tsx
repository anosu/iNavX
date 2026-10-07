import { useCallback, useEffect, useState } from 'react'
import { Link, useBlocker, useSearchParams } from 'react-router'
import { ApplicationsPanel } from '@/components/admin/ApplicationsPanel'
import { BackupsPanel } from '@/components/admin/BackupsPanel'
import { CategoriesPanel } from '@/components/admin/CategoriesPanel'
import { EnginesPanel } from '@/components/admin/EnginesPanel'
import { SettingsPanel } from '@/components/admin/SettingsPanel'
import { SitesPanel } from '@/components/admin/SitesPanel'
import {
	buttonClass,
	Dialog,
	DirtyContext,
	Field,
	inputClass,
	Panel,
	primaryClass,
	type RunAdminAction,
} from '@/components/admin/ui'
import { buttonVariants } from '@/components/atoms/Button'
import { XIcon } from '@/components/atoms/Icons'
import { ThemeToggle } from '@/components/molecules/ThemeToggle'
import { ApiError, requestAdminApi, requestAdminData } from '@/utils/adminApi'
import {
	type AuthStatus,
	applicationListSchema,
	authResultSchema,
	authStatusSchema,
} from '../../shared/adminApi'
import { type Catalog, catalogSchema } from '../../shared/catalog'

const tabs = [
	{
		id: 'sites',
		label: '站点管理',
		description: '维护公共目录，保存后立即生效。',
		mark: '01',
	},
	{
		id: 'applications',
		label: '收录申请',
		description: '审核访客提交，批准后才会公开展示。',
		mark: '02',
	},
	{
		id: 'categories',
		label: '分类管理',
		description: '整理目录分类，迁移关联内容。',
		mark: '03',
	},
	{
		id: 'settings',
		label: '站点设置',
		description: '设置站点外观、公共功能与备份策略。',
		mark: '04',
	},
	{
		id: 'engines',
		label: '搜索引擎',
		description: '配置访客可用的搜索引擎与默认顺序。',
		mark: '05',
	},
	{
		id: 'backups',
		label: '备份与迁移',
		description: '导出、备份和恢复你拥有的站点数据。',
		mark: '06',
	},
] as const

export default function Admin() {
	const [status, setStatus] = useState<AuthStatus | null>(null)
	const [data, setData] = useState<Catalog | null>(null)
	const [params, setParams] = useSearchParams()
	const current = tabs.find((item) => item.id === params.get('tab')) ?? tabs[0]
	const tab = current.id
	const [dirty, setDirty] = useState(false)
	const [pendingCount, setPendingCount] = useState(0)
	const [confirmLogout, setConfirmLogout] = useState(false)
	const [busy, setBusy] = useState(false)
	const blocker = useBlocker(dirty || busy)
	useEffect(() => {
		if (!dirty && !busy && blocker.state === 'blocked') blocker.reset()
	}, [dirty, busy, blocker])
	const [notice, setNotice] = useState<{
		message: string
		error: boolean
		conflict?: boolean
	} | null>(null)
	const refresh = useCallback(async () => {
		setData(await requestAdminData('admin/catalog', catalogSchema))
		const result = await requestAdminData(
			'admin/applications?page=1',
			applicationListSchema,
		)
		setPendingCount(result.counts.pending)
	}, [])
	const load = useCallback(async () => {
		try {
			const next = await requestAdminData('auth/status', authStatusSchema)
			setStatus(next)
			if (next.authenticated) await refresh()
			setNotice(null)
		} catch (error) {
			setNotice({
				message: error instanceof Error ? error.message : '后台加载失败',
				error: true,
			})
		}
	}, [refresh])
	useEffect(() => {
		void load()
	}, [load])
	useEffect(() => {
		const warn = (event: BeforeUnloadEvent) => {
			if (dirty || busy) {
				event.preventDefault()
				event.returnValue = ''
			}
		}
		window.addEventListener('beforeunload', warn)
		return () => window.removeEventListener('beforeunload', warn)
	}, [dirty, busy])
	const runAction: RunAdminAction = async (work, success) => {
		setBusy(true)
		setNotice(null)
		try {
			await work()
			setDirty(false)
			try {
				await refresh()
			} catch {
				setNotice({
					message: `${success}，但列表刷新失败，请重新加载。`,
					error: true,
				})
				return true
			}
			window.dispatchEvent(new Event('inav:catalog-changed'))
			setNotice({ message: success, error: false })
			return true
		} catch (error) {
			if (error instanceof ApiError && error.status === 401) {
				setStatus({ initialized: true, authenticated: false })
				setData(null)
			}
			setNotice({
				message: error instanceof Error ? error.message : '操作失败',
				error: true,
				conflict: error instanceof ApiError && error.status === 409,
			})
			return false
		} finally {
			setBusy(false)
		}
	}
	return (
		<DirtyContext.Provider value={setDirty}>
			<main className="min-h-screen bg-background text-foreground">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
					<header className="flex flex-wrap justify-between items-center gap-4 pb-6 border-b border-border">
						<div className="min-w-0">
							<p className="text-[11px] font-semibold tracking-[0.2em] text-primary uppercase mb-2">
								管理工作台
							</p>
							<h1 className="text-2xl font-semibold tracking-tight break-words">
								{data?.settings.name || '管理后台'}
							</h1>
							<p className="text-sm text-muted-foreground mt-1">
								公共内容集中管理，个人偏好留在各自浏览器。
							</p>
						</div>
						<div className="flex max-w-full flex-wrap gap-2 items-center">
							<ThemeToggle />
							<Link to="/" className={buttonClass}>
								返回首页
							</Link>
							{status?.authenticated && (
								<button
									type="button"
									disabled={busy}
									className={buttonClass}
									onClick={() => setConfirmLogout(true)}
								>
									退出{' '}
									<span className="max-w-28 truncate">{status.username}</span>
								</button>
							)}
							{confirmLogout && status?.authenticated && (
								<Dialog
									title="退出后台"
									description={
										dirty
											? '当前有未保存的修改，退出后这些修改将丢失。'
											: '退出后需要重新登录才能管理内容。'
									}
									onClose={() => setConfirmLogout(false)}
									busy={busy}
								>
									<div className="flex justify-end gap-2">
										<button
											type="button"
											className={buttonClass}
											disabled={busy}
											onClick={() => setConfirmLogout(false)}
										>
											继续编辑
										</button>
										<button
											type="button"
											className={primaryClass}
											disabled={busy}
											onClick={() => {
												setBusy(true)
												requestAdminApi('auth/logout', status.csrf, {})
													.then(() => {
														setStatus({
															initialized: true,
															authenticated: false,
														})
														setData(null)
														setDirty(false)
														setConfirmLogout(false)
													})
													.catch((error: unknown) =>
														setNotice({
															message:
																error instanceof Error
																	? error.message
																	: '退出失败',
															error: true,
														}),
													)
													.finally(() => setBusy(false))
											}}
										>
											确认退出
										</button>
									</div>
								</Dialog>
							)}
						</div>
					</header>
					{notice && (
						<p
							role={notice.error ? 'alert' : 'status'}
							className={
								'fixed bottom-4 right-4 left-4 sm:left-auto z-50 max-w-lg rounded-md border bg-surface shadow-lg px-4 py-3 text-sm flex items-center gap-3 break-words ' +
								(notice.error
									? 'border-error/30 text-error'
									: 'border-success/30 text-success')
							}
						>
							{notice.message}
							{notice.conflict && (
								<a
									className="shrink-0 underline"
									href={window.location.href}
									target="_blank"
									rel="noopener noreferrer"
								>
									另页查看最新内容
								</a>
							)}
							<button
								type="button"
								className={buttonVariants({
									variant: 'icon',
									size: 'sm',
									className: 'ml-auto',
								})}
								aria-label="关闭提示"
								onClick={() => setNotice(null)}
							>
								<XIcon size={16} />
							</button>
						</p>
					)}
					{!status && (
						<Panel title="连接后台">
							{notice ? (
								<button
									className={buttonClass}
									type="button"
									onClick={() => void load()}
								>
									重试
								</button>
							) : (
								<p className="text-sm text-muted-foreground">正在连接…</p>
							)}
						</Panel>
					)}
					{status && !status.authenticated && (
						<div className="max-w-md mx-auto py-6 sm:py-12">
							<Panel title={status.initialized ? '管理员登录' : '首次初始化'}>
								{!status.initialized && (
									<p className="text-sm text-muted-foreground">
										请输入服务器提供的一次性凭据，创建唯一管理员账号。
									</p>
								)}
								<form
									onSubmit={(event) => {
										event.preventDefault()
										const form = new FormData(event.currentTarget)
										setBusy(true)
										setNotice(null)
										const value = {
											username: String(form.get('username')),
											password: String(form.get('password')),
											...(!status.initialized
												? { token: String(form.get('token')) }
												: {}),
										}
										requestAdminData(
											`auth/${status.initialized ? 'login' : 'setup'}`,
											authResultSchema,
											undefined,
											value,
										)
											.then(async (next) => {
												setStatus({
													initialized: true,
													authenticated: true,
													...next,
												})
												await refresh()
											})
											.catch((error: unknown) =>
												setNotice({
													message:
														error instanceof Error ? error.message : '登录失败',
													error: true,
												}),
											)
											.finally(() => setBusy(false))
									}}
								>
									<fieldset disabled={busy} className="space-y-4">
										{!status.initialized && (
											<Field label="一次性初始化凭据">
												<input
													required
													name="token"
													className={inputClass}
													autoComplete="off"
												/>
											</Field>
										)}
										<Field label="账号">
											<input
												required
												name="username"
												className={inputClass}
												maxLength={100}
												autoComplete="username"
											/>
										</Field>
										<Field label="密码（至少 12 个字符）">
											<input
												required
												name="password"
												type="password"
												minLength={12}
												maxLength={256}
												className={inputClass}
												autoComplete={
													status.initialized
														? 'current-password'
														: 'new-password'
												}
											/>
										</Field>
										<button type="submit" className={`${primaryClass} w-full`}>
											{busy
												? '处理中…'
												: status.initialized
													? '登录'
													: '创建管理员'}
										</button>
									</fieldset>
								</form>
							</Panel>
						</div>
					)}
					{status?.authenticated && !data && (
						<Panel title="加载目录">
							<button
								type="button"
								className={buttonClass}
								onClick={() => void load()}
							>
								重新加载
							</button>
						</Panel>
					)}
					{status?.authenticated && data && status.csrf && (
						<>
							<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
								{[
									{
										label: '已收录站点',
										value: data.sites.filter((s) => !s.deletedAt).length,
										target: 'sites',
									},
									{
										label: '待审核申请',
										value: pendingCount,
										target: 'applications',
									},
									{
										label: '公共分类',
										value: data.categories.length,
										target: 'categories',
									},
									{
										label: '启用搜索引擎',
										value: data.engines.filter((e) => e.enabled).length,
										target: 'engines',
									},
								].map((item) => (
									<button
										type="button"
										disabled={busy}
										key={item.label}
										onClick={() => setParams({ tab: item.target })}
										className="min-w-0 text-left rounded-card border border-border bg-surface p-4 hover:border-primary/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
									>
										<span className="text-xs text-muted-foreground">
											{item.label}
										</span>
										<span className="block mt-1 text-2xl font-semibold tabular-nums tracking-tight">
											{item.value}
										</span>
									</button>
								))}
							</div>
							<div className="grid grid-cols-1 lg:grid-cols-[13rem_minmax(0,1fr)] items-start gap-5 sm:gap-6">
								<aside className="min-w-0 lg:sticky lg:top-6 rounded-card border border-border bg-surface p-2">
									<nav
										aria-label="后台管理分类"
										className="flex lg:flex-col gap-1 overflow-x-auto scrollbar-thin"
									>
										{tabs.map((item) => (
											<button
												type="button"
												key={item.id}
												disabled={busy}
												aria-current={tab === item.id ? 'page' : undefined}
												className={buttonVariants({
													variant: 'ghost',
													className:
														'justify-start text-muted-foreground aria-[current=page]:bg-primary-subtle aria-[current=page]:text-primary aria-[current=page]:hover:bg-primary-subtle',
												})}
												onClick={() => {
													setParams({ tab: item.id })
													setNotice(null)
												}}
											>
												<span className="text-[10px] font-mono opacity-60 hidden lg:inline">
													{item.mark}
												</span>
												{item.label}
												{item.id === 'applications' && pendingCount > 0 && (
													<span className="ml-auto rounded-full bg-primary text-primary-foreground px-1.5 py-0.5 text-[10px] tabular-nums">
														{pendingCount}
													</span>
												)}
											</button>
										))}
									</nav>
									<p className="hidden lg:block border-t border-border mt-3 px-3 pt-4 pb-2 text-xs leading-relaxed text-muted-foreground">
										内容保存后即时公开。定期导出备份，迁移时保留数据卷。
									</p>
								</aside>
								<div className="min-w-0 space-y-5">
									<div>
										<h2 className="text-xl font-semibold tracking-tight">
											{current.label}
										</h2>
										<p className="mt-1.5 text-sm text-muted-foreground">
											{current.description}
										</p>
									</div>
									{tab === 'sites' && (
										<SitesPanel
											data={data}
											csrf={status.csrf}
											runAction={runAction}
											busy={busy}
										/>
									)}
									{tab === 'categories' && (
										<CategoriesPanel
											data={data}
											csrf={status.csrf}
											runAction={runAction}
											busy={busy}
										/>
									)}
									{tab === 'applications' && (
										<ApplicationsPanel
											data={data}
											csrf={status.csrf}
											runAction={runAction}
											busy={busy}
											onCount={setPendingCount}
										/>
									)}
									{tab === 'settings' && (
										<SettingsPanel
											key={data.revision}
											settings={data.settings}
											revision={data.revision}
											csrf={status.csrf}
											runAction={runAction}
											busy={busy}
										/>
									)}
									{tab === 'engines' && (
										<EnginesPanel
											key={data.revision}
											engines={data.engines}
											revision={data.revision}
											csrf={status.csrf}
											runAction={runAction}
											busy={busy}
										/>
									)}
									{tab === 'backups' && (
										<BackupsPanel
											data={data}
											csrf={status.csrf}
											runAction={runAction}
											busy={busy}
										/>
									)}
								</div>
							</div>
						</>
					)}
				</div>
				{blocker.state === 'blocked' && (
					<Dialog
						title="离开当前页面？"
						description={
							busy
								? '操作正在进行，请等待完成后再离开。'
								: '你有未保存的修改，离开后需要重新填写。'
						}
						onClose={() => blocker.reset()}
						footer={
							<div className="flex flex-wrap justify-end gap-2">
								<button
									type="button"
									className={buttonClass}
									onClick={() => blocker.reset()}
								>
									{busy ? '留在此页' : '继续编辑'}
								</button>
								<button
									type="button"
									className={primaryClass}
									disabled={busy}
									onClick={() => {
										setDirty(false)
										blocker.proceed()
									}}
								>
									放弃修改并离开
								</button>
							</div>
						}
					/>
				)}
			</main>
		</DirtyContext.Provider>
	)
}
