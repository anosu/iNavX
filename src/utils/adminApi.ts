export class ApiError extends Error {
	readonly status: number

	constructor(status: number, message: string) {
		super(message)
		this.name = 'ApiError'
		this.status = status
	}
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

// The transport checks HTTP errors; callers validate successful domain payloads.
export async function requestAdminApi<T = unknown>(
	path: string,
	csrfToken?: string,
	requestBody?: unknown,
	method?: HttpMethod,
): Promise<T> {
	const response = await fetch(`/api/${path}`, {
		method: method ?? (requestBody === undefined ? 'GET' : 'POST'),
		credentials: 'same-origin',
		headers: {
			...(requestBody !== undefined
				? { 'Content-Type': 'application/json' }
				: {}),
			...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
		},
		body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
	})
	if (!response.headers.get('Content-Type')?.includes('application/json'))
		throw new ApiError(response.status, '后台接口不可用，请先启动服务端')

	const responseBody: unknown = await response.json()
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
	return responseBody as T
}
