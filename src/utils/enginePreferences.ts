import type { Engine } from '../../shared/catalog'

export interface EnginePreference {
	id: string
	enabled: boolean
}

export function reconcileEngines(
	defaults: Engine[],
	preferences: EnginePreference[] | null,
): Engine[] {
	const available = defaults.filter((engine) => engine.enabled)
	if (!preferences) return available
	const ordered: Engine[] = []
	for (const item of preferences) {
		const engine = available.find((value) => value.id === item.id)
		if (engine && !ordered.some((value) => value.id === item.id))
			ordered.push({ ...engine, enabled: item.enabled })
	}
	for (const engine of available)
		if (!ordered.some((value) => value.id === engine.id)) ordered.push(engine)
	if (ordered.length && !ordered.some((engine) => engine.enabled))
		ordered[0] = { ...ordered[0], enabled: true }
	return ordered
}
