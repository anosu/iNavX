/* ============================================================
   iNav Icon Library
   统一 SVG 图标组件，避免各处重复定义
   所有图标默认 16×16，stroke-based，继承 currentColor
   ============================================================ */

interface IconProps {
	size?: number
	className?: string
	strokeWidth?: number
}

type SvgProps = React.SVGAttributes<SVGElement> & IconProps

function Icon({
	size = 16,
	className,
	strokeWidth = 2,
	children,
	...rest
}: SvgProps & { children: React.ReactNode }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={strokeWidth}
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
			aria-hidden="true"
			{...rest}
		>
			{children}
		</svg>
	)
}

/* ---- 搜索 ---- */
export function SearchIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<circle cx="11" cy="11" r="8" />
			<path d="m21 21-4.35-4.35" />
		</Icon>
	)
}

/* ---- 关闭 / 清除 ---- */
export function XIcon(props: IconProps) {
	return (
		<Icon {...props} strokeWidth={props.strokeWidth ?? 2.5}>
			<path d="M18 6 6 18" />
			<path d="m6 6 12 12" />
		</Icon>
	)
}

export function ChevronLeftIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="m15 18-6-6 6-6" />
		</Icon>
	)
}

export function ChevronRightIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="m9 18 6-6-6-6" />
		</Icon>
	)
}

/* ---- 太阳（亮色模式） ---- */
export function SunIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<circle cx="12" cy="12" r="4" />
			<path d="M12 2v2" />
			<path d="M12 20v2" />
			<path d="m4.93 4.93 1.41 1.41" />
			<path d="m17.66 17.66 1.41 1.41" />
			<path d="M2 12h2" />
			<path d="M20 12h2" />
			<path d="m6.34 17.66-1.41 1.41" />
			<path d="m19.07 4.93-1.41 1.41" />
		</Icon>
	)
}

/* ---- 月亮（暗色模式） ---- */
export function MoonIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
		</Icon>
	)
}

/* ---- 外链 ---- */
export function ExternalLinkIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
			<polyline points="15 3 21 3 21 9" />
			<line x1="10" y1="14" x2="21" y2="3" />
		</Icon>
	)
}

/* ---- 信息 ---- */
export function InfoIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<circle cx="12" cy="12" r="10" />
			<path d="M12 16v-4" />
			<path d="M12 8h.01" />
		</Icon>
	)
}

/* ---- 上传 ---- */
export function UploadIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
			<polyline points="17 8 12 3 7 8" />
			<line x1="12" y1="3" x2="12" y2="15" />
		</Icon>
	)
}

/* ---- 下载 ---- */
export function DownloadIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
			<polyline points="7 10 12 15 17 10" />
			<line x1="12" y1="15" x2="12" y2="3" />
		</Icon>
	)
}

/* ---- 垃圾桶 ---- */
export function TrashIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<polyline points="3 6 5 6 21 6" />
			<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
			<path d="M10 11v6M14 11v6" />
			<path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
		</Icon>
	)
}

/* ---- 勾选 ---- */
export function CheckIcon(props: IconProps) {
	return (
		<Icon {...props} strokeWidth={props.strokeWidth ?? 2.5}>
			<polyline points="20 6 9 17 4 12" />
		</Icon>
	)
}

/* ---- 加号 ---- */
export function PlusIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M12 5v14" />
			<path d="M5 12h14" />
		</Icon>
	)
}

/* ---- 编辑（铅笔） ---- */
export function EditIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
			<path d="m15 5 4 4" />
		</Icon>
	)
}

/* ---- 置顶图钉 ---- */
export function PinIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<line x1="12" y1="17" x2="12" y2="22" />
			<path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
		</Icon>
	)
}

/* ---- 取消置顶 ---- */
export function PinOffIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<line x1="2" y1="2" x2="22" y2="22" />
			<line x1="12" y1="17" x2="12" y2="22" />
			<path d="M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h12" />
			<path d="M15 9.34V6h1a2 2 0 0 0 0-4H7.89" />
		</Icon>
	)
}

/* ---- 设置（齿轮） ---- */
export function SettingsIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
			<circle cx="12" cy="12" r="3" />
		</Icon>
	)
}

/* ---- 命令（⌘） ---- */
export function CommandIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />
		</Icon>
	)
}

/* ---- 刷新 ---- */
export function RefreshIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
			<path d="M3 3v5h5" />
			<path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
			<path d="M16 16h5v5" />
		</Icon>
	)
}

/* ---- 复制 ---- */
export function CopyIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
			<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
		</Icon>
	)
}

/* ---- iNav Logo (四格) ---- */
export function NavLogoIcon({
	size = 28,
	className,
}: {
	size?: number
	className?: string
}) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			aria-hidden="true"
			className={className}
		>
			<rect
				x="3"
				y="3"
				width="7"
				height="7"
				rx="1.5"
				fill="var(--color-primary)"
			/>
			<rect
				x="14"
				y="3"
				width="7"
				height="7"
				rx="1.5"
				fill="var(--color-primary)"
				opacity="0.65"
			/>
			<rect
				x="3"
				y="14"
				width="7"
				height="7"
				rx="1.5"
				fill="var(--color-primary)"
				opacity="0.4"
			/>
			<rect
				x="14"
				y="14"
				width="7"
				height="7"
				rx="1.5"
				fill="var(--color-primary)"
				opacity="0.2"
			/>
		</svg>
	)
}

/* ---- 地球 ---- */
export function GlobeIcon(props: IconProps) {
	return (
		<Icon {...props}>
			<circle cx="12" cy="12" r="10" />
			<line x1="2" y1="12" x2="22" y2="12" />
			<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
		</Icon>
	)
}
