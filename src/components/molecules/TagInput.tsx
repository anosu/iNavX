import { useId } from 'react'
import { inputVariants } from '@/components/atoms/Input'
import { MAX_TAGS, parseTagInput, tagsSchema } from '../../../shared/tags'

export function TagInput({
	id,
	value,
	onChange,
}: {
	id?: string
	value: string
	onChange: (value: string) => void
}) {
	const hintId = useId()
	const tags = parseTagInput(value)
	const parsed = tagsSchema.safeParse(tags)
	const error = parsed.success ? '' : parsed.error.issues[0].message
	return (
		<div className="min-w-0 space-y-1.5">
			<input
				id={id}
				className={inputVariants({ error: Boolean(error) })}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
						event.preventDefault()
						onChange(`${value.replace(/[,，\s]+$/, '')}, `)
					}
				}}
				placeholder="例如：开发工具，开源"
				autoComplete="off"
				aria-describedby={hintId}
				aria-invalid={error ? true : undefined}
			/>
			<p
				id={hintId}
				className={`text-xs leading-relaxed ${error ? 'text-error' : 'text-muted-foreground'}`}
			>
				{error ||
					`用中英文逗号或 Enter 分隔，自动去重。${tags.length}/${MAX_TAGS}，每个最多 100 个字符。`}
			</p>
		</div>
	)
}
