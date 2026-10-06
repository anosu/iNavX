function copySynchronously(value: string): boolean {
	const previousFocus = document.activeElement
	const input = document.createElement('textarea')
	input.value = value
	input.style.cssText =
		'position:fixed;top:0;left:0;opacity:0;pointer-events:none'
	// A modal dialog makes the rest of the document inert.
	const host = previousFocus?.closest('dialog[open]') ?? document.body
	host.appendChild(input)
	try {
		input.focus()
		input.select()
		return document.execCommand('copy')
	} catch {
		return false
	} finally {
		input.remove()
		if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
			previousFocus.focus({ preventScroll: true })
	}
}

export async function copyText(value: string): Promise<void> {
	// iOS requires the synchronous attempt within the original user gesture.
	if (copySynchronously(value)) return
	if (!navigator.clipboard) throw new Error('Clipboard unavailable')
	await navigator.clipboard.writeText(value)
}
