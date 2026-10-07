export function isChunkLoadError(error: unknown): boolean {
	return (
		error instanceof Error &&
		/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk .+ failed|Unable to preload CSS/i.test(
			error.message,
		)
	)
}
