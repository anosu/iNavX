import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { eq, lt } from 'drizzle-orm'
import type { ServerConfig } from '../../config.js'
import type { Store } from '../../db/index.js'
import { admin, sessions } from '../../db/schema.js'
import { AppError } from '../../errors.js'

const digest = (value: string) =>
	createHash('sha256').update(value).digest('hex')
const derive = (password: string, salt: string) =>
	new Promise<Buffer>((resolveValue, reject) =>
		scrypt(
			password,
			salt,
			64,
			{ N: 32768, maxmem: 64 * 1024 * 1024 },
			(error, key) => (error ? reject(error) : resolveValue(key)),
		),
	)
async function hashPassword(password: string) {
	const salt = randomBytes(16).toString('hex')
	return `${salt}:${(await derive(password, salt)).toString('hex')}`
}
async function verifyPassword(password: string, hash: string) {
	const [salt, value] = hash.split(':')
	if (!salt || !value || value.length !== 128) return false
	return timingSafeEqual(
		await derive(password, salt),
		Buffer.from(value, 'hex'),
	)
}

export function createAuth(store: Store, config: ServerConfig) {
	const { db } = store
	const tokenPath = resolve(config.dataDir, '.setup-token')
	function account() {
		return db.select().from(admin).get()
	}
	function setupToken() {
		if (account()) throw new AppError(409, '管理员已初始化')
		if (!existsSync(tokenPath))
			writeFileSync(
				tokenPath,
				process.env.SETUP_TOKEN || randomBytes(32).toString('base64url'),
				{ mode: 0o600, flag: 'wx' },
			)
		return readFileSync(tokenPath, 'utf8').trim()
	}
	async function setup(username: string, password: string, token: string) {
		if (account()) throw new AppError(409, '管理员已初始化')
		if (
			!timingSafeEqual(
				Buffer.from(digest(token)),
				Buffer.from(digest(setupToken())),
			)
		)
			throw new AppError(403, '一次性凭据不正确')
		const passwordHash = await hashPassword(password)
		db.transaction(() => {
			if (account()) throw new AppError(409, '管理员已初始化')
			db.insert(admin).values({ id: 1, username, passwordHash }).run()
		})
		rmSync(tokenPath, { force: true })
		return issueSession()
	}
	function issueSession() {
		const token = randomBytes(32).toString('base64url')
		const csrf = randomBytes(32).toString('base64url')
		const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000
		db.delete(sessions).where(lt(sessions.expiresAt, Date.now())).run()
		db.insert(sessions)
			.values({ tokenHash: digest(token), csrf, expiresAt })
			.run()
		return { token, csrf, expiresAt }
	}
	async function login(username: string, password: string) {
		const value = account()
		if (
			!value ||
			!(await verifyPassword(password, value.passwordHash)) ||
			value.username !== username
		)
			throw new AppError(401, '账号或密码不正确')
		// A concurrent password reset must invalidate an in-flight login too.
		if (account()?.passwordHash !== value.passwordHash)
			throw new AppError(401, '密码已变更，请重新登录')
		return issueSession()
	}
	function session(token?: string) {
		if (!token || token.length > 200) return undefined
		const value = db
			.select()
			.from(sessions)
			.where(eq(sessions.tokenHash, digest(token)))
			.get()
		return value && value.expiresAt > Date.now() ? value : undefined
	}
	function logout(tokenHash: string) {
		db.delete(sessions).where(eq(sessions.tokenHash, tokenHash)).run()
	}
	async function reset(password: string) {
		const value = account()
		if (!value) throw new AppError(409, '管理员尚未初始化')
		const passwordHash = await hashPassword(password)
		db.transaction(() => {
			db.update(admin).set({ passwordHash }).where(eq(admin.id, 1)).run()
			db.delete(sessions).run()
		})
	}
	return { account, setupToken, setup, login, session, logout, reset }
}
