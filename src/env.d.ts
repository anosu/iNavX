/// <reference types="vite/client" />

import type { Settings } from '../shared/catalog'

declare global {
	interface ImportMetaEnv {
		readonly APP_VERSION: string
	}

	interface Window {
		__INAV_BACKEND__?: boolean
		__INAV_SETTINGS__?: Settings
	}
}
