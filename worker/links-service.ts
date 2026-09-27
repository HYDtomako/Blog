import {
	domainOf,
	normalizeSubmittedUrl,
	parseHtmlMetadata,
	type LinkMetadata,
} from '../shared/link-metadata.ts'

export type LinksProblemCode = 'invalid_body' | 'invalid_url' | 'signal_lost' | 'rate_limited'

export type LinksSubmitRequest = { url: string }

/** One row of the public wall: a link somebody sent in, waiting to be picked up. */
export type LinksSubmission = {
	url: string
	name: string
	description?: string
	icon?: string
	domain: string
	createdAt: string
}

export type LinksWallBody = { submissions: LinksSubmission[], total: number }

export const MAX_URL_BODY_BYTES = 1024
export const SITE_FETCH_TIMEOUT_MS = 6000
export const MAX_SITE_BYTES = 262144
export const MAX_SUBMISSIONS_PER_DAY = 10
export const DAILY_RETRY_AFTER = 3600
/** Newest first; the wall is a feed, not an archive. */
export const WALL_SIZE = 50
const SITE_USER_AGENT = 'refined-x-links/1.0'

export class LinksProblem extends Error {
	readonly code: LinksProblemCode
	readonly status: number
	readonly retryAfter: number | undefined

	constructor(code: LinksProblemCode, message: string, status = 400, retryAfter?: number) {
		super(message)
		this.code = code
		this.status = status
		this.retryAfter = retryAfter
	}
}

/** A submission carries nothing but a URL, so this is the whole request contract. */
export function parseSubmitRequest(value: unknown): LinksSubmitRequest {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new LinksProblem('invalid_body', 'body must be a JSON object')
	}
	const record = value as Record<string, unknown>
	const unknown = Object.keys(record).find((key) => key !== 'url')
	if (unknown !== undefined) throw new LinksProblem('invalid_body', `unsupported field: ${unknown}`)
	if (typeof record.url !== 'string') throw new LinksProblem('invalid_url', 'url must be a string')
	const url = normalizeSubmittedUrl(record.url)
	if (url === null) throw new LinksProblem('invalid_url', 'url must be a public http(s) address')
	return { url: url.href }
}

/**
 * Reads the site's own head tags. A reachable page without metadata still returns
 * (empty metadata) so a link can join on its domain alone; an unreachable one is a 502.
 */
export async function fetchSiteMetadata(
	url: string,
	fetchImpl: typeof fetch = fetch,
): Promise<LinkMetadata> {
	let response: Response
	try {
		response = await fetchImpl(url, {
			redirect: 'follow',
			headers: { 'user-agent': SITE_USER_AGENT, accept: 'text/html,application/xhtml+xml' },
			signal: AbortSignal.timeout(SITE_FETCH_TIMEOUT_MS),
		})
	} catch {
		throw new LinksProblem('signal_lost', 'unable to reach this site', 502)
	}
	if (!response.ok) {
		throw new LinksProblem('signal_lost', `site answered HTTP ${response.status}`, 502)
	}
	const type = response.headers.get('content-type') ?? ''
	if (type !== '' && !type.includes('html')) return {}
	const html = await readTextLimited(response, MAX_SITE_BYTES)
	if (html === '') return {}
	return parseHtmlMetadata(html, response.url || url)
}

/** The submitted link as the wall shows it; the domain stands in for a missing title. */
export function submissionBody(
	url: string,
	metadata: LinkMetadata,
): Omit<LinksSubmission, 'createdAt'> {
	const body: Omit<LinksSubmission, 'createdAt'> = {
		url,
		name: metadata.title?.trim() || domainOf(url),
		domain: domainOf(url),
	}
	if (metadata.description !== undefined) body.description = metadata.description
	if (metadata.icon !== undefined) body.icon = metadata.icon
	return body
}

export function wallBody(submissions: LinksSubmission[], total: number): LinksWallBody {
	return { submissions, total }
}

async function readTextLimited(response: Response, maxBytes: number): Promise<string> {
	const declared = Number.parseInt(response.headers.get('content-length') ?? '', 10)
	if (Number.isFinite(declared) && declared > maxBytes) return ''
	try {
		return (await response.text()).slice(0, maxBytes)
	} catch {
		return ''
	}
}
