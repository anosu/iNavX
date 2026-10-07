import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from '@playwright/test'

export default defineConfig({
	testDir: './tests/e2e',
	workers: 1,
	fullyParallel: false,
	timeout: 45000,
	expect: { timeout: 15000 },
	outputDir:
		process.env.PLAYWRIGHT_OUTPUT_DIR ||
		join(tmpdir(), 'inavx-playwright-results'),
	use: {
		browserName: 'chromium',
		headless: true,
		viewport: { width: 390, height: 844 },
		trace: 'retain-on-failure',
	},
})
