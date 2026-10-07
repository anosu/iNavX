import { useEffect, useRef, useState } from 'react'
import { ResourceImage } from '@/components/atoms/ResourceImage'
import { useImageUrl } from '@/hooks/useImageUrl'
import { requestAdminApi, requestAdminData } from '@/utils/adminApi'
import {
	type MediaFile,
	mediaListSchema,
	mediaSchema,
} from '../../../shared/adminApi'
import { MAX_MEDIA_BYTES } from '../../../shared/limits'
import { buttonClass, Dialog, dangerClass, Field, inputClass } from './ui'

export function ImageField({
	label,
	value,
	onChange,
	csrf,
	onBusyChange,
}: {
	label: string
	value: string
	onChange: (url: string) => void
	csrf: string
	onBusyChange?: (busy: boolean) => void
}) {
	const fileRef = useRef<HTMLInputElement>(null)
	const active = useRef(true)
	const [open, setOpen] = useState(false)
	const [items, setItems] = useState<MediaFile[]>([])
	const [refresh, setRefresh] = useState(0)
	const [busy, setBusy] = useState(false)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState('')
	const [deleting, setDeleting] = useState<MediaFile>()
	const preview = useImageUrl(value)
	useEffect(() => {
		if (!busy) return
		onBusyChange?.(true)
		return () => onBusyChange?.(false)
	}, [busy, onBusyChange])
	useEffect(() => {
		active.current = true
		return () => {
			active.current = false
		}
	}, [])
	// biome-ignore lint/correctness/useExhaustiveDependencies: refresh invalidates the library after upload/delete or retry.
	useEffect(() => {
		if (!open) return
		let cancelled = false
		setLoading(true)
		setError('')
		void requestAdminData('admin/media', mediaListSchema)
			.then(
				(data) => {
					if (!cancelled) setItems(data.items)
				},
				(reason: unknown) => {
					if (!cancelled)
						setError(
							reason instanceof Error ? reason.message : '图片库加载失败',
						)
				},
			)
			.finally(() => {
				if (!cancelled) setLoading(false)
			})
		return () => {
			cancelled = true
		}
	}, [open, refresh])
	const upload = async (file: File) => {
		if (file.size > MAX_MEDIA_BYTES || file.size === 0) {
			setError('请选择 2 MiB 以内的图片')
			return
		}
		setBusy(true)
		setError('')
		try {
			const data = await new Promise<string>((resolve, reject) => {
				const reader = new FileReader()
				reader.onload = () => resolve(String(reader.result).split(',')[1])
				reader.onerror = () => reject(new Error('读取图片失败'))
				reader.readAsDataURL(file)
			})
			if (!active.current) return
			const item = await requestAdminData('admin/media', mediaSchema, csrf, {
				data,
			})
			if (active.current) {
				onChange(item.url)
				setRefresh((n) => n + 1)
			}
		} catch (reason) {
			if (active.current)
				setError(reason instanceof Error ? reason.message : '上传失败')
		} finally {
			if (active.current) setBusy(false)
		}
	}
	return (
		<div className="min-w-0 space-y-2">
			<Field label={label}>
				<input
					className={inputClass}
					disabled={busy}
					value={value}
					maxLength={4096}
					placeholder="/media/图片.svg 或 https://…"
					onChange={(event) => onChange(event.target.value)}
				/>
			</Field>
			<div className="flex flex-wrap items-center gap-2">
				{preview && (
					<ResourceImage
						src={preview}
						alt={`${label}预览`}
						width={32}
						height={32}
						className="h-8 w-8 rounded object-contain bg-muted"
					/>
				)}
				<input
					ref={fileRef}
					type="file"
					className="hidden"
					accept="image/png,image/jpeg,image/gif,image/webp,image/x-icon,image/vnd.microsoft.icon,image/svg+xml"
					aria-label={`上传${label}`}
					onChange={(event) => {
						const file = event.target.files?.[0]
						event.target.value = ''
						if (file) void upload(file)
					}}
				/>
				<button
					type="button"
					className={buttonClass}
					disabled={busy}
					onClick={() => fileRef.current?.click()}
				>
					{busy ? '正在上传…' : '上传图片'}
				</button>
				<button
					type="button"
					className={buttonClass}
					disabled={busy}
					onClick={() => setOpen(true)}
				>
					图片库
				</button>
			</div>
			<p className="text-xs text-muted-foreground">
				PNG、JPEG、GIF、WebP、ICO 或静态 SVG，最大 2 MiB。上传后需保存表单。
			</p>
			{error && !open && (
				<p role="alert" className="text-xs text-error">
					{error}
				</p>
			)}
			{open && (
				<Dialog
					title="图片库"
					description="上传后即可复用。选择图片后仍需保存当前表单；删除图片会影响所有引用它的内容。"
					size="lg"
					onClose={() => {
						if (!busy) setOpen(false)
					}}
					busy={busy}
				>
					{error && (
						<p role="alert" className="text-sm text-error">
							{error}
							<button
								type="button"
								className={`${buttonClass} ml-2`}
								onClick={() => setRefresh((n) => n + 1)}
							>
								重试
							</button>
						</p>
					)}
					{loading ? (
						<output>正在加载图片…</output>
					) : items.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							图片库为空，请先上传图片。
						</p>
					) : (
						<div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
							{items.map((item) => (
								<div
									key={item.name}
									className="min-w-0 rounded-md border border-border p-3 space-y-2"
								>
									<ResourceImage
										src={item.url}
										alt={item.name}
										width={120}
										height={80}
										className="h-20 w-full object-contain bg-muted rounded"
									/>
									<p
										className="truncate text-xs text-muted-foreground"
										title={item.name}
									>
										{item.name}
									</p>
									<p className="text-xs text-muted-foreground">
										{Math.ceil(item.size / 1024)} KiB
									</p>
									<div className="flex flex-wrap justify-end gap-2">
										<button
											type="button"
											className={buttonClass}
											disabled={busy}
											onClick={() => {
												onChange(item.url)
												setOpen(false)
											}}
										>
											使用
										</button>
										<button
											type="button"
											className={dangerClass}
											disabled={busy}
											onClick={() => setDeleting(item)}
										>
											删除
										</button>
									</div>
								</div>
							))}
						</div>
					)}
				</Dialog>
			)}
			{deleting && (
				<Dialog
					title="永久删除图片"
					description="所有使用此图片的图标或封面将无法继续显示。此操作不可撤销。"
					onClose={() => {
						if (!busy) setDeleting(undefined)
					}}
					busy={busy}
					footer={
						<div className="flex justify-end gap-2">
							<button
								type="button"
								className={buttonClass}
								disabled={busy}
								onClick={() => setDeleting(undefined)}
							>
								取消
							</button>
							<button
								type="button"
								className={dangerClass}
								disabled={busy}
								onClick={async () => {
									setBusy(true)
									setError('')
									try {
										await requestAdminApi(
											`admin/media/${deleting.name}`,
											csrf,
											{},
											'DELETE',
										)
										if (active.current) {
											if (value === deleting.url) onChange('')
											setDeleting(undefined)
											setRefresh((n) => n + 1)
										}
									} catch (reason) {
										if (active.current) {
											setError(
												reason instanceof Error ? reason.message : '删除失败',
											)
											setDeleting(undefined)
										}
									} finally {
										if (active.current) setBusy(false)
									}
								}}
							>
								确认删除
							</button>
						</div>
					}
				/>
			)}
		</div>
	)
}
