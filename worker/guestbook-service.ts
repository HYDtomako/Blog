export type GuestbookProblemCode =
	| 'invalid_body'
	| 'invalid_id'
	| 'invalid_message'
	| 'invalid_parent'
	| 'message_too_long'
	| 'message_not_found'
	| 'not_author'
	| 'rate_limited'

/** One entry of the board: what a reply carries, and what a top-level message extends. */
export type GuestbookReply = {
	id: number
	body: string
	handle: string
	mine: boolean
	createdAt: string
	likes: number
	liked: boolean
}

export type GuestbookMessage = GuestbookReply & {
	replyCount: number
	replies: GuestbookReply[]
}

export type GuestbookListBody = {
	messages: GuestbookMessage[]
	nextBefore: number | null
	total: number
}

export type GuestbookLikeBody = {
	id: number
	likes: number
	liked: boolean
}

export type GuestbookRemoveBody = {
	id: number
	removed: true
}

/** Row shape of every message SELECT; reply rows add the parent they hang off. */
export type GuestbookRow = {
	id: number
	body: string
	actor_id: string
	created_at: string
}

export type GuestbookReplyRow = GuestbookRow & { parent_id: number }

export type GuestbookCreateRequest = { body: string, parentId: number | null }
export type GuestbookLikeRequest = { id: number, liked: boolean }
export type GuestbookRemoveRequest = { id: number }
export type GuestbookListQuery = { limit: number, before: number | null }

export const MAX_MESSAGE_CODE_POINTS = 500
export const MAX_MESSAGE_BYTES = 4096
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 50
export const MAX_REPLIES_PER_THREAD = 20
export const RETRACT_WINDOW_SECONDS = 600
export const MIN_SECONDS_BETWEEN_POSTS = 10
export const MAX_POSTS_PER_MINUTE = 3
export const MAX_POSTS_PER_DAY = 30

const HANDLE_LENGTH = 4
const MAX_LINKS = 2
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000B-\u001F\u007F]/
const EXCESS_NEWLINES_PATTERN = /\n{3,}/g
const LINK_PATTERN = /https?:\/\//g

export class GuestbookProblem extends Error {
	readonly code: GuestbookProblemCode
	readonly status: number
	readonly retryAfter: number | undefined

	constructor(
		code: GuestbookProblemCode,
		message: string,
		status = 400,
		retryAfter?: number,
	) {
		super(message)
		this.code = code
		this.status = status
		this.retryAfter = retryAfter
	}
}

export function parseMessageBody(value: unknown): string {
	if (typeof value !== 'string') {
		throw new GuestbookProblem('invalid_message', 'message must be a string')
	}
	const text = value.trim()
	if (text === '') {
		throw new GuestbookProblem('invalid_message', 'message must not be empty')
	}
	// Length is measured in Unicode code points so emoji count once, like the public ask contract.
	if ([...text].length > MAX_MESSAGE_CODE_POINTS) {
		throw new GuestbookProblem(
			'message_too_long',
			`message must be at most ${MAX_MESSAGE_CODE_POINTS} code points`,
		)
	}
	if (CONTROL_CHARACTER_PATTERN.test(text)) {
		throw new GuestbookProblem('invalid_message', 'message must not contain control characters')
	}
	const collapsed = text.replace(EXCESS_NEWLINES_PATTERN, '\n\n')
	if ((collapsed.match(LINK_PATTERN) ?? []).length > MAX_LINKS) {
		throw new GuestbookProblem('invalid_message', `message must not contain more than ${MAX_LINKS} links`)
	}
	return collapsed
}

export function parseCreateRequest(value: unknown): GuestbookCreateRequest {
	const record = requireObject(value)
	rejectUnknownFields(record, ['body', 'parentId'])
	const parentId = record.parentId === undefined ? null : parseId(record.parentId)
	return { body: parseMessageBody(record.body), parentId }
}

export function parseLikeRequest(value: unknown): GuestbookLikeRequest {
	const record = requireObject(value)
	rejectUnknownFields(record, ['id', 'liked'])
	if (typeof record.liked !== 'boolean') {
		throw new GuestbookProblem('invalid_body', 'liked must be a boolean')
	}
	return { id: parseId(record.id), liked: record.liked }
}

export function parseRemoveRequest(value: unknown): GuestbookRemoveRequest {
	const record = requireObject(value)
	rejectUnknownFields(record, ['id'])
	return { id: parseId(record.id) }
}

/** The limit is clamped rather than rejected; an absent or empty cursor asks for the newest page. */
export function parseListQuery(url: URL): GuestbookListQuery {
	const requested = url.searchParams.get('limit')
	const parsed = requested === null || requested.trim() === '' ? DEFAULT_PAGE_SIZE : Number(requested)
	const limit = Number.isSafeInteger(parsed) ? Math.min(Math.max(parsed, 1), MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE
	const before = url.searchParams.get('before')
	return { limit, before: before === null || before === '' ? null : parseId(Number(before)) }
}

/** Public handle a guest is known by: the leading characters of the weekly actor hash. */
export function handleOf(actorId: string): string {
	return actorId.slice(0, HANDLE_LENGTH)
}

export function replyBody(
	row: GuestbookRow,
	actorId: string,
	stats: { likes: number, liked: boolean },
): GuestbookReply {
	return {
		id: row.id,
		body: row.body,
		handle: handleOf(row.actor_id),
		mine: row.actor_id === actorId,
		createdAt: row.created_at,
		likes: stats.likes,
		liked: stats.liked,
	}
}

export function messageBody(
	row: GuestbookRow,
	actorId: string,
	stats: { likes: number, liked: boolean, replyCount: number, replies: GuestbookReply[] },
): GuestbookMessage {
	return {
		...replyBody(row, actorId, stats),
		replyCount: stats.replyCount,
		replies: stats.replies,
	}
}

export function listBody(
	messages: GuestbookMessage[],
	nextBefore: number | null,
	total: number,
): GuestbookListBody {
	return { messages, nextBefore, total }
}

export function likeBody(id: number, likes: number, liked: boolean): GuestbookLikeBody {
	return { id, likes, liked }
}

export function removeBody(id: number): GuestbookRemoveBody {
	return { id, removed: true }
}

function requireObject(value: unknown): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new GuestbookProblem('invalid_body', 'body must be a JSON object')
	}
	return value as Record<string, unknown>
}

function rejectUnknownFields(record: Record<string, unknown>, allowed: readonly string[]): void {
	const unknown = Object.keys(record).find((key) => !allowed.includes(key))
	if (unknown !== undefined) {
		throw new GuestbookProblem('invalid_body', `unsupported field: ${unknown}`)
	}
}

function parseId(value: unknown): number {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
		throw new GuestbookProblem('invalid_id', 'id must be a positive integer')
	}
	return value
}
