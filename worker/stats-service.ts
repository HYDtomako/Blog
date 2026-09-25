export type StatsEvent = 'view' | 'like' | 'unlike'

export type StatsProblemCode = 'invalid_body' | 'invalid_path' | 'invalid_event'

export type PageStatsView = {
	path: string
	views: number
	likes: number
	liked: boolean
}

export type TotalStatsView = {
	views: number
	likes: number
	pages: number
}

export type PageEventInput =
	| { event: 'view', actorId: string | null }
	| { event: 'like' | 'unlike', actorId: string }

export const MAX_PATH_LENGTH = 200
export const MAX_BODY_BYTES = 2048

const PAGE_PATH_PATTERN = /^\/[A-Za-z0-9\-._~\/%]*$/

export class StatsProblem extends Error {
	readonly code: StatsProblemCode
	readonly status: number

	constructor(code: StatsProblemCode, message: string, status = 400) {
		super(message)
		this.code = code
		this.status = status
	}
}

export function normalizePagePath(value: unknown): string {
	if (typeof value !== 'string') {
		throw new StatsProblem('invalid_path', 'path must be a string')
	}
	if (!value.startsWith('/')) {
		throw new StatsProblem('invalid_path', 'path must start with "/"')
	}
	if (value.length > MAX_PATH_LENGTH) {
		throw new StatsProblem('invalid_path', `path must be at most ${MAX_PATH_LENGTH} characters`)
	}
	if (!PAGE_PATH_PATTERN.test(value)) {
		throw new StatsProblem('invalid_path', 'path must be an unreserved site path')
	}
	if (value.includes('..') || value.includes('//')) {
		throw new StatsProblem('invalid_path', 'path must not contain ".." or "//"')
	}
	const trimmed = value.replace(/\/+$/, '')
	return trimmed === '' ? '/' : trimmed
}

export function parseStatsEvent(value: unknown): StatsEvent {
	if (value === 'view' || value === 'like' || value === 'unlike') return value
	throw new StatsProblem('invalid_event', 'event must be view, like, or unlike')
}

export function parsePageRequest(value: unknown): { path: string, event: StatsEvent } {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new StatsProblem('invalid_body', 'body must be a JSON object')
	}
	const record = value as Record<string, unknown>
	return { path: normalizePagePath(record.path), event: parseStatsEvent(record.event) }
}

/** Rejects cross-site form posts, which can only send simple content types. */
export function isJsonContentType(value: string | null): boolean {
	if (value === null) return false
	return value.split(';')[0].trim().toLowerCase() === 'application/json'
}

export function exceedsBodyLimit(text: string): boolean {
	return new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES
}

export function pageStatsBody(
	path: string,
	stats: { views: number, likes: number } | null,
	liked: boolean,
): PageStatsView {
	return { path, views: stats?.views ?? 0, likes: stats?.likes ?? 0, liked }
}

export function totalStatsBody(
	stats: { views: number | null, likes: number | null, pages: number | null } | null,
): TotalStatsView {
	return { views: stats?.views ?? 0, likes: stats?.likes ?? 0, pages: stats?.pages ?? 0 }
}
