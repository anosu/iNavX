import { usePublicCatalog } from '@/hooks/usePublicCatalog'

export function SiteFooterInfo() {
	const { presentation } = usePublicCatalog().settings
	if (!presentation.footerText && !presentation.footerLinks.length) return null
	return (
		<div className="flex w-full flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
			{presentation.footerText && (
				<p className="min-w-0 whitespace-pre-wrap break-words">
					{presentation.footerText}
				</p>
			)}
			{presentation.footerLinks.length > 0 && (
				<nav aria-label="自定义页脚链接" className="flex flex-wrap gap-4">
					{presentation.footerLinks.map((link, index) => (
						<a
							// biome-ignore lint/suspicious/noArrayIndexKey: Stateless links can legitimately share the same address and label.
							key={`${link.url}:${index}`}
							href={link.url}
							rel="noreferrer"
							className="max-w-full break-words hover:text-foreground"
						>
							{link.label}
						</a>
					))}
				</nav>
			)}
		</div>
	)
}
