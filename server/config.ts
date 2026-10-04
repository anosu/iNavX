import { isIP } from 'node:net'
import { resolve } from 'node:path'

export interface ServerConfig {
	dataDir: string
	backupDir: string
	databasePath: string
	migrationsDir: string
	seedPath: string
	distDir: string
	port: number
	host: string
	origin: string
	publicOrigin: string
	secureCookies: boolean
	turnstileSiteKey: string
	turnstileSecretKey: string
	trustedProxyIps: string[]
}
export function loadConfig(): ServerConfig {
	const dataDir = resolve(process.env.DATA_DIR || './data')
	const port = Number(process.env.PORT || 3000)
	if (!Number.isInteger(port) || port < 1 || port > 65535)
		throw new Error('PORT 无效')
	const origin = new URL(process.env.APP_ORIGIN || `http://localhost:${port}`)
		.origin
	if (
		Boolean(process.env.TURNSTILE_SITE_KEY) !==
		Boolean(process.env.TURNSTILE_SECRET_KEY)
	)
		throw new Error('Turnstile 必须同时配置 SITE_KEY 和 SECRET_KEY')
	const trustedProxyIps = (process.env.TRUSTED_PROXY_IPS || '')
		.split(',')
		.map((ip) => ip.trim())
		.filter(Boolean)
	if (trustedProxyIps.some((ip) => !isIP(ip)))
		throw new Error('TRUSTED_PROXY_IPS 必须是逗号分隔的完整 IP 地址')
	return {
		dataDir,
		databasePath: resolve(dataDir, 'inav.sqlite'),
		backupDir: resolve(process.env.BACKUP_DIR || './backups'),
		migrationsDir: resolve('migrations'),
		seedPath: resolve('src/data/sites.json'),
		distDir: resolve('dist'),
		port,
		host: process.env.HOST || '0.0.0.0',
		origin,
		publicOrigin: process.env.PUBLIC_ORIGIN
			? new URL(process.env.PUBLIC_ORIGIN).origin
			: '',
		secureCookies: origin.startsWith('https://'),
		turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || '',
		turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY || '',
		trustedProxyIps,
	}
}
