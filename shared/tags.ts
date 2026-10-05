import { z } from 'zod'

export const MAX_TAGS = 30
export const MAX_TAG_LENGTH = 100

export const tagsSchema = z
	.array(
		z
			.string()
			.trim()
			.min(1, '标签不能为空')
			.max(MAX_TAG_LENGTH, '每个标签最多 100 个字符'),
	)
	.max(MAX_TAGS, '最多添加 30 个标签')
	.transform((tags) => [...new Set(tags)])
	.default([])

/** Commas separate tags; spaces inside a tag are preserved. */
export function parseTagInput(value: string): string[] {
	return [
		...new Set(
			value
				.split(/[,，\n]/)
				.map((tag) => tag.trim())
				.filter(Boolean),
		),
	]
}
