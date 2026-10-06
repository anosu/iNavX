export class StorageWriteError extends Error {
	constructor(cause: unknown) {
		super(
			'保存失败：浏览器存储不可用或容量不足，本次操作未保存，请检查存储设置后重试。',
			{ cause },
		)
		this.name = 'StorageWriteError'
	}
}

export function writeStoredValue(key: string, value: unknown): void {
	try {
		localStorage.setItem(key, JSON.stringify(value))
	} catch (cause) {
		throw new StorageWriteError(cause)
	}
}
