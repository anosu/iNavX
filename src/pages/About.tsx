import { useState } from 'react'
import { Link } from 'react-router'
import { buttonClass, Panel, primaryClass } from '@/components/admin/ui'
import { NavLogoIcon } from '@/components/atoms/Icons'
import { useImageUrl } from '@/hooks/useImageUrl'
import { usePublicCatalog } from '@/hooks/usePublicCatalog'
import { useTheme } from '@/hooks/useTheme'

export default function About() {
	const { settings, sites, categories, engines } = usePublicCatalog()
	const { isDark, toggleTheme } = useTheme()
	const logoUrl = useImageUrl(settings.logoUrl)
	const [failedUrl, setFailedUrl] = useState<string>()
	const { features } = settings
	const guides = [
		[
			'快速搜索',
			'输入名称、网址、描述或标签查找站点。选择分类缩小范围，点击卡片打开网站。',
		],
		[
			'键盘操作',
			'Ctrl / ⌘ + K 打开命令面板，方向键选择，Enter 打开，Esc 关闭。搜索时按 Ctrl / ⌘ + 1～9 打开对应结果。',
		],
	]
	if (engines.some((engine) => engine.enabled))
		guides.push([
			'搜索互联网',
			'输入关键词后，点击搜索引擎卡片前往搜索。引擎设置可以调整顺序和启用状态。',
		])
	if (features.customSites)
		guides.push([
			'整理个人收藏',
			'点击「添加」保存常用链接；在个人卡片上右键或长按，可以编辑、置顶或删除。',
		])
	if (features.bookmarkImport)
		guides.push([
			'导入书签',
			'选择浏览器导出的书签 HTML 或本站 JSON 文件。书签归入「其他」分类，保留文件夹标签，可在导入后继续整理。',
		])
	if (features.hideBuiltin)
		guides.push([
			'隐藏公共站点',
			'在公共卡片上右键或长按，选择隐藏。隐藏只影响你的浏览器，可通过「恢复隐藏」重新显示。',
		])
	return (
		<div className="min-h-screen bg-background text-foreground">
			<header className="border-b border-border">
				<div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
					<Link
						className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold"
						to="/"
					>
						{logoUrl && logoUrl !== failedUrl ? (
							<img
								key={logoUrl}
								src={logoUrl}
								onError={() => setFailedUrl(logoUrl)}
								alt=""
								className="h-7 w-7 object-contain"
							/>
						) : (
							<NavLogoIcon size={28} />
						)}
						<span className="truncate">{settings.name}</span>
					</Link>
					<button type="button" className={buttonClass} onClick={toggleTheme}>
						{isDark ? '切换亮色' : '切换暗色'}
					</button>
				</div>
			</header>
			<main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-8">
				<section className="space-y-4">
					<p className="text-xs text-primary tracking-widest">
						你的常用网站，从这里出发
					</p>
					<h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
						使用 {settings.name}
					</h1>
					<p className="max-w-2xl text-muted-foreground leading-relaxed">
						{settings.description}
					</p>
					<div className="flex flex-wrap gap-2">
						<Link to="/" className={primaryClass}>
							浏览导航目录
						</Link>
						{settings.applicationsEnabled && (
							<Link to="/submit" className={buttonClass}>
								推荐网站 · 申请收录
							</Link>
						)}
					</div>
					<p className="text-xs text-muted-foreground">
						{sites.length} 个公共站点 · {categories.length} 个分类
					</p>
				</section>
				<div className="grid sm:grid-cols-2 gap-4">
					<Panel title="公共目录" description="发现由本站整理的常用网站。">
						<p className="text-sm text-muted-foreground leading-relaxed">
							按名称和标签搜索，或通过分类浏览。置顶内容优先展示。
						</p>
					</Panel>
					<Panel title="个人收藏" description="按照自己的习惯整理导航。">
						<p className="text-sm text-muted-foreground leading-relaxed">
							个人条目、隐藏记录和偏好保存在当前浏览器，不会自动上传。同一网址有个人版本时，优先展示你的内容。
						</p>
					</Panel>
				</div>
				<Panel title="常用操作">
					<div className="grid sm:grid-cols-2 gap-5 text-sm">
						{guides.map(([title, text]) => (
							<div key={title}>
								<h3 className="font-medium">{title}</h3>
								<p className="mt-2 text-muted-foreground leading-relaxed">
									{text}
								</p>
							</div>
						))}
					</div>
				</Panel>
				<Panel title="保存你的收藏">
					<div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
						<p>
							清除本站数据、更换浏览器或设备之前，请先保存个人备份。无痕浏览、存储空间不足或浏览器禁止保存时，修改可能无法保留。
						</p>
						{features.bookmarkExport ? (
							<p>
								首页「导出」菜单中的「个人备份」包含个人条目、隐藏记录、主题和搜索引擎偏好。普通站点
								JSON 和书签 HTML 只保存条目。
							</p>
						) : (
							<p>
								本站当前未开放个人导出，请在清除浏览器数据前妥善保存重要链接。
							</p>
						)}
						{features.bookmarkImport ? (
							<p>
								在「导入」中选择个人备份，可以在确认后替换当前个人收藏和偏好。请先备份当前数据，再恢复其他设备上的收藏。
							</p>
						) : (
							<p>本站当前未开放个人导入。</p>
						)}
					</div>
				</Panel>
				<Panel title="推荐网站">
					<div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
						{settings.applicationsEnabled ? (
							<>
								<p>
									通过「申请收录」推荐值得分享的网站，无需账号或邮箱。申请审核通过后才会加入公共目录，提交时请只填写公开信息。
								</p>
								<p>
									目前无法查询审核结果，也不会发送通知。只是想保存自己的常用链接时，请使用首页的个人收藏功能。
								</p>
							</>
						) : (
							<p>本站当前未开放收录申请，你仍可浏览公共目录。</p>
						)}
					</div>
				</Panel>
				<Panel title="图片与链接信息">
					<div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
						<p>
							{settings.remoteImagesEnabled
								? '本站允许显示外部网站提供的图片；站点图标加载失败时使用文字图标。'
								: '本站使用自己的图片与文字图标，不影响打开链接。'}
						</p>
						<p>
							{settings.metadataFetchEnabled && settings.metadataProxyTemplate
								? '添加个人收藏时，本站配置的服务会接收目标网址，帮助填写标题和描述；你可以修改自动填写的内容。'
								: '添加收藏时，请手动填写名称与描述。'}
						</p>
						<p>
							点击站点或搜索引擎会前往对应网站。如收录申请表出现验证提示，请按提示完成验证。
						</p>
					</div>
				</Panel>
			</main>
			<footer className="border-t border-border">
				<div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 flex flex-wrap justify-between gap-3 text-xs text-muted-foreground">
					<span>{settings.name} · 公共导航与个人收藏</span>
					<nav aria-label="页脚导航" className="flex gap-4">
						<Link to="/">首页</Link>
						{settings.applicationsEnabled && <Link to="/submit">申请收录</Link>}
					</nav>
				</div>
			</footer>
		</div>
	)
}
