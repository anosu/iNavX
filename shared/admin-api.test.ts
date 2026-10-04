import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError, requestAdminApi } from '../src/utils/adminApi.js'

test('admin transport preserves JSON bodies, CSRF and same-origin credentials', async (t) => {
	const originalFetch = globalThis.fetch
	t.after(() => {
		globalThis.fetch = originalFetch
	})
	const requests: { path: string; options?: RequestInit }[] = []
	globalThis.fetch = async (path, options) => {
		requests.push({ path: String(path), options })
		return Response.json({ ok: true })
	}
	assert.deepEqual(await requestAdminApi('admin/catalog'), { ok: true })
	await requestAdminApi('admin/sites', 'test-csrf', { name: 'example' }, 'PUT')
	assert.equal(requests[0].path, '/api/admin/catalog')
	assert.equal(requests[0].options?.method, 'GET')
	assert.equal(requests[0].options?.body, undefined)
	assert.equal(requests[1].options?.method, 'PUT')
	assert.equal(requests[1].options?.credentials, 'same-origin')
	assert.deepEqual(requests[1].options?.headers, {
		'Content-Type': 'application/json',
		'X-CSRF-Token': 'test-csrf',
	})
	assert.deepEqual(JSON.parse(String(requests[1].options?.body)), {
		name: 'example',
	})
})

test('admin transport reports typed HTTP errors for valid, malformed and non-JSON error bodies', async (t) => {
	const originalFetch = globalThis.fetch
	t.after(() => {
		globalThis.fetch = originalFetch
	})
	for (const [body, expected] of [
		[{ error: '会话已失效' }, '会话已失效'],
		[null, '操作失败'],
		[{ error: { private: 'not a display message' } }, '操作失败'],
	] as const) {
		globalThis.fetch = async () => Response.json(body, { status: 401 })
		await assert.rejects(requestAdminApi('admin/catalog'), (error: unknown) => {
			assert.ok(error instanceof ApiError)
			assert.equal(error.status, 401)
			assert.equal(error.message, expected)
			return true
		})
	}
	globalThis.fetch = async () =>
		new Response('<html>Unavailable</html>', { status: 503 })
	await assert.rejects(requestAdminApi('admin/catalog'), (error: unknown) => {
		assert.ok(error instanceof ApiError)
		assert.equal(error.status, 503)
		assert.match(error.message, /后台接口不可用/)
		return true
	})
})
