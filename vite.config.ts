import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const pkg = JSON.parse(
	readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
)

export default defineConfig({
	plugins: [react(), tailwindcss()],

	define: {
		// Injected at build time; access via import.meta.env.APP_VERSION
		'import.meta.env.APP_VERSION': JSON.stringify(pkg.version),
	},

	resolve: {
		alias: {
			'@': resolve(__dirname, './src'),
		},
	},

	build: {
		target: 'es2020',
		minify: 'esbuild',
		cssCodeSplit: true,
		cssMinify: true,
		chunkSizeWarningLimit: 200,

		// 注入 <link rel="modulepreload">，并行预加载所有入口 chunk，消除瀑布链
		modulePreload: { polyfill: true },

		rollupOptions: {
			output: {
				manualChunks(id: string) {
					if (id.includes('node_modules/react-dom/')) return 'react-dom'
					if (id.includes('node_modules/react/')) return 'react'
					if (
						id.includes('node_modules/react-router') ||
						id.includes('node_modules/scheduler/')
					) {
						return 'router'
					}
				},
				entryFileNames: 'assets/[name]-[hash].js',
				chunkFileNames: 'assets/[name]-[hash].js',
				assetFileNames: 'assets/[name]-[hash][extname]',
			},
			treeshake: {
				moduleSideEffects: false,
				propertyReadSideEffects: false,
				unknownGlobalSideEffects: false,
			},
		},

		assetsInlineLimit: 4096,
		sourcemap: false,
		reportCompressedSize: true,
	},

	esbuild: {
		drop: ['console', 'debugger'],
		legalComments: 'none',
	},

	preview: {
		port: 4173,
		strictPort: true,
		headers: {
			'Cache-Control': 'no-cache',
		},
	},

	server: {
		proxy: { '/api': 'http://localhost:3000' },
		port: 5173,
		warmup: {
			clientFiles: [
				'./src/pages/Home.tsx',
				'./src/components/organisms/Header.tsx',
				'./src/components/organisms/NavGrid.tsx',
				'./src/components/molecules/NavCard.tsx',
			],
		},
	},
})
