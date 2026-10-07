import { mkdirSync, writeFileSync } from 'node:fs'
import {
	DEFAULT_CATEGORIES,
	DEFAULT_ENGINES,
	DEFAULT_SETTINGS,
} from '../shared/defaults'
import {
	ADMIN_PAGE_SIZE,
	MAX_API_BODY_BYTES,
	MAX_APPLICATION_HISTORY,
	MAX_CATALOG_CATEGORIES,
	MAX_CATALOG_SITES,
	MAX_MEDIA_BYTES,
	MAX_MEDIA_FILES,
	MAX_PENDING_APPLICATIONS,
	MAX_SEARCH_ENGINES,
} from '../shared/limits'

mkdirSync('runtime', { recursive: true })
writeFileSync(
	'runtime/defaults.json',
	`${JSON.stringify({
		categories: DEFAULT_CATEGORIES,
		engines: DEFAULT_ENGINES,
		settings: DEFAULT_SETTINGS,
		limits: {
			sites: MAX_CATALOG_SITES,
			categories: MAX_CATALOG_CATEGORIES,
			engines: MAX_SEARCH_ENGINES,
			applications: MAX_APPLICATION_HISTORY,
			pending: MAX_PENDING_APPLICATIONS,
			pageSize: ADMIN_PAGE_SIZE,
			bodyBytes: MAX_API_BODY_BYTES,
			mediaBytes: MAX_MEDIA_BYTES,
			mediaFiles: MAX_MEDIA_FILES,
		},
	})}\n`,
)
