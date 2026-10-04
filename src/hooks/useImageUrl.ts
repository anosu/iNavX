import { getFaviconUrl } from '@/utils/favicon'
import { resolveImageUrl } from '../../shared/resources'
import { usePublicCatalog } from './usePublicCatalog'

export function useImageUrl(value: string | undefined): string | undefined {
	const { settings } = usePublicCatalog()
	return resolveImageUrl(
		value,
		window.location.origin,
		settings.remoteImagesEnabled,
	)
}

export function useSiteIconUrl(iconUrl: string | undefined, siteUrl: string) {
	const { settings } = usePublicCatalog()
	return useImageUrl(iconUrl || getFaviconUrl(siteUrl, settings))
}
