import { useId, useRef, useState } from 'react'
import { XIcon } from '@/components/atoms/Icons'
import { inputVariants } from '@/components/atoms/Input'
import {
	MAX_TAGS,
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
	const [deleteCandidate, setDeleteCandidate] = useState<TagInputDraft | null>(
		null,
	)
	const selectedTag = deleteCandidate === value ? tags.at(-1) : undefined
	const current = readTagInput(value)
	const parsed = tagsSchema.safeParse(current)
	const error = parsed.success ? '' : parsed.error.issues[0].message
	const publish = (nextTags: string[], nextDraft: string) => {
		setDeleteCandidate(null)
		onChange({ tags: nextTags, draft: nextDraft })
	}
	const commit = () => {
		if (parsed.success) publish(parsed.data, '')
	}
	const remove = (tag: string) => {
		publish(
			tags.filter((value) => value !== tag),
			draft.trim() === tag ? '' : draft,
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
						<span
							key={tag}
							className={`badge badge-primary max-w-full gap-1 ${selectedTag === tag ? 'ring-2 ring-primary' : ''}`}
						>
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
					publish(tags, event.target.value)
				}}
				onBlur={() => setDeleteCandidate(null)}
				onPointerDown={() => setDeleteCandidate(null)}
				onCompositionStart={() => setDeleteCandidate(null)}
				onKeyDown={(event) => {
					if (
						event.nativeEvent.isComposing ||
						event.ctrlKey ||
						event.metaKey ||
						event.altKey
					) {
						setDeleteCandidate(null)
						return
					}
					if (event.key === 'Enter') {
						event.preventDefault()
						commit()
					} else if (event.key === 'Backspace' && !draft && tags.length) {
						event.preventDefault()
						if (event.repeat) return
						if (selectedTag) remove(selectedTag)
						else setDeleteCandidate(value)
					} else setDeleteCandidate(null)
				}}
				placeholder="输入标签后按 Enter"
				autoComplete="off"
				aria-describedby={hintId}
				aria-invalid={error ? true : undefined}
			/>
			<p
				id={hintId}
				aria-live="polite"
				className={`text-xs leading-relaxed ${error ? 'text-error' : 'text-muted-foreground'}`}
			>
				{error ||
					(selectedTag
						? `已选中标签“${selectedTag}”，再按一次 Backspace 删除。`
						: `Enter 添加，逗号可用于标签内容，点 × 删除。空输入时连按两次 Backspace 删除最后一项。${current.length}/${MAX_TAGS}，每个最多 100 个字符。`)}
			</p>
			{hint && (
				<p className="text-xs text-muted-foreground leading-relaxed">{hint}</p>
			)}
		</div>
	)
}
