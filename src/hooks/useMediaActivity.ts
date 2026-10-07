import { useCallback, useState } from 'react'

/** Keep saves and route-leave protection active until all image operations finish. */
export function useMediaActivity() {
	const [pending, setPending] = useState(0)
	const onBusyChange = useCallback((busy: boolean) => {
		setPending((count) => count + (busy ? 1 : -1))
	}, [])
	return { mediaBusy: pending > 0, onBusyChange }
}
