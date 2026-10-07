import { useState } from 'react'
import { useImageUrl } from '@/hooks/useImageUrl'
import { usePublicCatalog } from '@/hooks/usePublicCatalog'
import { useTheme } from '@/hooks/useTheme'
import { NavLogoIcon } from './Icons'
import { ResourceImage } from './ResourceImage'

export function SiteLogo({ size = 26 }: { size?: number }) {
	const { settings } = usePublicCatalog()
	const { isDark } = useTheme()
	const primary = useImageUrl(settings.logoUrl)
	const dark = useImageUrl(settings.presentation.logoDarkUrl)
	const url = isDark && dark ? dark : primary
	const [failed, setFailed] = useState<string>()
	return url && url !== failed ? (
		<ResourceImage
			key={url}
			src={url}
			onError={() => setFailed(url)}
			alt=""
			width={size}
			height={size}
			className="shrink-0 rounded object-contain"
		/>
	) : (
		<NavLogoIcon size={size} />
	)
}
