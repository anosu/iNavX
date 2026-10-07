/** Stable automatic colors; category names and sort positions do not own color. */
const palette = [
	'#8b5cf6',
	'#3b82f6',
	'#10b981',
	'#ec4899',
	'#f59e0b',
	'#06b6d4',
	'#f97316',
	'#22c55e',
	'#14b8a6',
	'#f43f5e',
	'#6366f1',
	'#eab308',
]

export function getCategoryColor(id: string, color = ''): string {
	if (color.length === 7 && /^#[0-9a-fA-F]{6}$/.test(color)) return color
	let hash = 0
	for (const character of id)
		hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0
	return palette[hash % palette.length] ?? '#8b5cf6'
}
