import { useCallback, useRef, useState } from 'react'
import { writeStoredValue } from '@/utils/browserStorage'

const identity = <T>(value: T): unknown => value

// Persist outside React state updaters: failed writes must leave the current state intact.
export function useStoredState<T>(
	key: string,
	load: () => T,
	serialize: (value: T) => unknown = identity,
) {
	const [value, setValue] = useState(load)
	const current = useRef(value)
	const update = useCallback(
		(next: T | ((previous: T) => T)) => {
			const resolved = next instanceof Function ? next(current.current) : next
			writeStoredValue(key, serialize(resolved))
			current.current = resolved
			setValue(resolved)
		},
		[key, serialize],
	)
	return [value, update] as const
}
