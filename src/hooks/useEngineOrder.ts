import { useCallback, useMemo, useState } from 'react'
import {
	type EnginePreference,
	reconcileEngines,
} from '@/utils/enginePreferences'
import type { Engine } from '../../shared/catalog'
import { usePublicCatalog } from './usePublicCatalog'

const STORAGE_KEY = 'inav:engine-order'
function loadPreferences(): EnginePreference[] | null {
	try {
		const value: unknown = JSON.parse(
			localStorage.getItem(STORAGE_KEY) || 'null',
		)
		return Array.isArray(value) &&
			value.every(
				(item: unknown) =>
					item !== null &&
					typeof item === 'object' &&
					'id' in item &&
					typeof item.id === 'string' &&
					'enabled' in item &&
					typeof item.enabled === 'boolean',
			)
			? value
			: null
	} catch {
		return null
	}
}
export interface UseEngineOrderReturn {
	engines: Engine[]
	enabledEngines: Engine[]
	toggleEngine: (id: string) => void
	moveEngine: (fromIndex: number, toIndex: number) => void
	resetToDefault: () => void
}
export function useEngineOrder(): UseEngineOrderReturn {
	const { engines: defaults } = usePublicCatalog()
	const [preferences, setPreferences] = useState(loadPreferences)
	const engines = useMemo(
		() => reconcileEngines(defaults, preferences),
		[defaults, preferences],
	)
	const persist = useCallback((next: Engine[]) => {
		const stored = next.map(({ id, enabled }) => ({ id, enabled }))
		setPreferences(stored)
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
		} catch {
			/* Storage is optional. */
		}
	}, [])
	const toggleEngine = useCallback(
		(id: string) => {
			const next = engines.map((engine) =>
				engine.id === id ? { ...engine, enabled: !engine.enabled } : engine,
			)
			if (next.some((engine) => engine.enabled)) persist(next)
		},
		[engines, persist],
	)
	const moveEngine = useCallback(
		(from: number, to: number) => {
			if (
				from === to ||
				from < 0 ||
				to < 0 ||
				from >= engines.length ||
				to >= engines.length
			)
				return
			const next = [...engines]
			const [moved] = next.splice(from, 1)
			if (moved) next.splice(to, 0, moved)
			persist(next)
		},
		[engines, persist],
	)
	const resetToDefault = useCallback(() => {
		setPreferences(null)
		try {
			localStorage.removeItem(STORAGE_KEY)
		} catch {
			/* Storage is optional. */
		}
	}, [])
	return {
		engines,
		enabledEngines: engines.filter((engine) => engine.enabled),
		toggleEngine,
		moveEngine,
		resetToDefault,
	}
}
