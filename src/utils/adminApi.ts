import type { z } from 'zod'

export class ApiError extends Error {
	readonly status: number

	constructor(status: number, message: string) {
		super(message)
		this.name = 'ApiError'
		this.status = status
	}
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

// Mutation callers may ignore successful bodies; consumed data must use requestAdminData.
export async function requestAdminApi(
	path: string,
	csrfToken?: string,
	requestBody?: unknown,
	method?: HttpMethod,
	revision?: string,
): Promise<unknown> {
	const response = await fetch(`/api/${path}`, {
		method: method ?? (requestBody === undefined ? 'GET' : 'POST'),
		credentials: 'same-origin',
		headers: {
			...(revision ? { 'If-Match': JSON.stringify(revision) } : {}),
			...(requestBody !== undefined
				? { 'Content-Type': 'application/json' }
				: {}),
			...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
		},
		body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
	})
	if (!response.headers.get('Content-Type')?.includes('application/json'))
		throw new ApiError(response.status, '后台接口不可用，请先启动服务端')

	let responseBody: unknown
	try {
		responseBody = await response.json()
	} catch {
		throw new ApiError(response.status, '后台响应格式异常，请刷新后重试')
	}
	if (!response.ok) {
		const message =
			responseBody !== null &&
			typeof responseBody === 'object' &&
			'error' in responseBody &&
			typeof responseBody.error === 'string' &&
			responseBody.error
				? responseBody.error
				: '操作失败'
		throw new ApiError(response.status, message)
	}
	return responseBody
}

export async function requestAdminData<T>(
	path: string,
	schema: z.ZodType<T>,
	csrfToken?: string,
	requestBody?: unknown,
	method?: HttpMethod,
): Promise<T> {
	const result = schema.safeParse(
		await requestAdminApi(path, csrfToken, requestBody, method),
	)
	if (!result.success) throw new ApiError(200, '后台响应格式异常，请刷新后重试')
	return result.data
}
