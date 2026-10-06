const STORAGE_KEY = 'inav-recent-sites'
const LIMIT = 20

/** Store URLs only; names and visibility always come from the current catalog. */
export function readRecentSites(): string[] {
	try {
		const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
		return Array.isArray(value)
			? [
					...new Set(
						value.filter((url): url is string => typeof url === 'string'),
					),
				].slice(0, LIMIT)
			: []
	} catch {
		return []
	}
}

export function recordSiteOpen(url: string) {
	try {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify(
				[url, ...readRecentSites().filter((item) => item !== url)].slice(
					0,
					LIMIT,
				),
			),
		)
	} catch {
		// Optional history must never prevent opening a site.
	}
}

export function clearRecentSites() {
	localStorage.removeItem(STORAGE_KEY)
}
