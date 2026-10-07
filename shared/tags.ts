import { z } from 'zod'

export const MAX_TAGS = 30
const MAX_TAG_LENGTH = 100

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

export interface TagInputDraft {
	tags: string[]
	draft: string
}

export function createTagInput(tags: readonly string[] = []): TagInputDraft {
	return { tags: [...new Set(tags)], draft: '' }
}

export function readTagInput(value: TagInputDraft): string[] {
	const draft = value.draft.trim()
	return [
		...new Set([
			...value.tags.map((tag) => tag.trim()),
			...(draft ? [draft] : []),
		]),
	]
}
