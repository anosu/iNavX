import { isIP } from 'node:net'

export function clientAddress(
	remote: string,
	forwarded: string | undefined,
	trusted: string[],
) {
	return trusted.includes(remote) && forwarded && isIP(forwarded)
		? forwarded
		: remote
}
