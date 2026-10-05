import { useId, useRef } from 'react'
import { XIcon } from '@/components/atoms/Icons'
import { inputVariants } from '@/components/atoms/Input'
import {
	MAX_TAGS,
	parseTagInput,
	readTagInput,
	type TagInputDraft,
	tagsSchema,
} from '../../../shared/tags'

export function TagInput({
	id,
	label,
	hint,
	value,
	onChange,
}: {
	id?: string
	label: string
	hint?: string
	value: TagInputDraft
	onChange: (value: TagInputDraft) => void
}) {
	const generatedId = useId()
	const inputId = id ?? generatedId
	const hintId = `${inputId}-hint`
	const { tags, draft } = value
	const inputRef = useRef<HTMLInputElement>(null)
	const current = readTagInput(value)
	const parsed = tagsSchema.safeParse(current)
	const error = parsed.success ? '' : parsed.error.issues[0].message
	const publish = (nextTags: string[], nextDraft: string) => {
		onChange({ tags: nextTags, draft: nextDraft })
	}
	const commit = () => {
		if (parsed.success) publish(parsed.data, '')
	}
	const remove = (tag: string) => {
		const pending = parseTagInput(draft)
		publish(
			tags.filter((value) => value !== tag),
			pending.includes(tag)
				? pending.filter((value) => value !== tag).join(', ')
				: draft,
		)
		inputRef.current?.focus()
	}
	return (
		<div className="grid min-w-0 content-start gap-1.5 text-sm">
			<label htmlFor={inputId} className="font-medium">
				{label}
			</label>
			{tags.length > 0 && (
				<div className="flex min-w-0 flex-wrap gap-1.5">
					{tags.map((tag) => (
						<span key={tag} className="badge badge-primary max-w-full gap-1">
							<span className="truncate" title={tag}>
								{tag}
							</span>
							<button
								type="button"
								onClick={() => remove(tag)}
								aria-label={`删除标签 ${tag}`}
								className="shrink-0 rounded p-0.5 hover:text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
							>
								<XIcon size={12} />
							</button>
						</span>
					))}
				</div>
			)}
			<input
				id={inputId}
				ref={inputRef}
				className={inputVariants({ error: Boolean(error) })}
				value={draft}
				onChange={(event) => {
					const text = event.target.value
					if (
						!(event.nativeEvent as InputEvent).isComposing &&
						/[,，]/.test(text)
					) {
						const parts = text.split(/[,，]/)
						const tail = parts.pop() ?? ''
						publish(
							[...new Set([...tags, ...parseTagInput(parts.join(','))])],
							tail,
						)
					} else publish(tags, text)
				}}
				onKeyDown={(event) => {
					if (event.nativeEvent.isComposing) return
					if (
						event.key === 'Enter' ||
						event.key === ',' ||
						event.key === '，'
					) {
						event.preventDefault()
						commit()
					} else if (event.key === 'Backspace' && !draft && tags.length) {
						event.preventDefault()
						remove(tags[tags.length - 1])
					}
				}}
				placeholder="输入标签后按 Enter"
				autoComplete="off"
				aria-describedby={hintId}
				aria-invalid={error ? true : undefined}
			/>
			<p
				id={hintId}
				className={`text-xs leading-relaxed ${error ? 'text-error' : 'text-muted-foreground'}`}
			>
				{error ||
					`Enter 或中英文逗号添加，点 × 删除。${current.length}/${MAX_TAGS}，每个最多 100 个字符。`}
			</p>
			{hint && (
				<p className="text-xs text-muted-foreground leading-relaxed">{hint}</p>
			)}
		</div>
	)
}
