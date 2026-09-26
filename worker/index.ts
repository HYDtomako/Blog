import { deriveAnonymousActor } from './actor.ts'
import type { Env } from './env.ts'
import {
	GuestbookProblem,
	MAX_MESSAGE_BYTES,
	parseCreateRequest,
	parseLikeRequest,
	parseListQuery,
	parseRemoveRequest,
	type GuestbookCreateRequest,
	type GuestbookLikeRequest,
	type GuestbookListQuery,
	type GuestbookRemoveRequest,
} from './guestbook-service.ts'
import { createMessage, readThread, removeMessage, toggleMessageLike } from './guestbook-store.ts'
import { clientIp, failure, isRateLimited, json, readJsonBody, toErrorResponse } from './http.ts'
import {
	MAX_BODY_BYTES,
	isJsonContentType,
	parsePageRequest,
	type StatsEvent,
} from './stats-service.ts'
import { applyPageEvent, checkDatabase, readTotalStats } from './stats-store.ts'

async function handlePageStats(request: Request, env: Env): Promise<Response> {
	if (request.method !== 'POST') {
		return failure(405, 'method_not_allowed', 'use POST /api/stats/page', { allow: 'POST' })
	}
	if (!isJsonContentType(request.headers.get('content-type'))) {
		return failure(415, 'invalid_content_type', 'content-type must be application/json')
	}

	let parsed: { path: string, event: StatsEvent }
	try {
		parsed = parsePageRequest(await readJsonBody(request, MAX_BODY_BYTES))
	} catch (error) {
		return toErrorResponse(error)
	}

	// Likes are only meaningful with a pseudonymous identity, so without the secret they are
	// reported as unavailable while views keep working.
	const secret = env.STATS_ACTOR_SECRET
	const actorId = secret === undefined ? null : await deriveAnonymousActor(clientIp(request), secret)

	if (await isRateLimited(env.STATS_RATE_LIMITER, actorId)) {
		return failure(429, 'rate_limited', 'too many requests', { 'retry-after': '60' })
	}
	if (parsed.event === 'view') {
		return json(await applyPageEvent(env.STATS_DB, parsed.path, { event: 'view', actorId }))
	}
	if (actorId === null) {
		return failure(503, 'likes_unavailable', 'likes require STATS_ACTOR_SECRET')
	}
	return json(await applyPageEvent(env.STATS_DB, parsed.path, { event: parsed.event, actorId }))
}

async function handleTotalStats(request: Request, env: Env): Promise<Response> {
	if (request.method !== 'GET') {
		return failure(405, 'method_not_allowed', 'use GET /api/stats/total', { allow: 'GET' })
	}
	return json(await readTotalStats(env.STATS_DB))
}

async function handleHealth(request: Request, env: Env): Promise<Response> {
	if (request.method !== 'GET') {
		return failure(405, 'method_not_allowed', 'use GET /api/stats/health', { allow: 'GET' })
	}
	try {
		const ok = await checkDatabase(env.STATS_DB)
		return json({ ok }, ok ? 200 : 503)
	} catch {
		return json({ ok: false }, 503)
	}
}

/** The board is anonymous but never nameless, so every route needs the weekly actor hash. */
async function guestbookActor(request: Request, env: Env): Promise<string | null> {
	const secret = env.STATS_ACTOR_SECRET
	return secret === undefined ? null : await deriveAnonymousActor(clientIp(request), secret)
}

function guestbookUnavailable(): Response {
	return failure(503, 'guestbook_unavailable', 'guestbook requires STATS_ACTOR_SECRET')
}

function guestbookFailure(error: unknown): Response {
	if (error instanceof GuestbookProblem && error.retryAfter !== undefined) {
		return failure(error.status, error.code, error.message, { 'retry-after': String(error.retryAfter) })
	}
	return toErrorResponse(error)
}

async function handleGuestbook(request: Request, env: Env): Promise<Response> {
	if (request.method === 'GET') return handleGuestbookList(request, env)
	if (request.method === 'POST') return handleGuestbookCreate(request, env)
	return failure(405, 'method_not_allowed', 'use GET or POST /api/guestbook', { allow: 'GET, POST' })
}

async function handleGuestbookList(request: Request, env: Env): Promise<Response> {
	const actorId = await guestbookActor(request, env)
	if (actorId === null) return guestbookUnavailable()

	let query: GuestbookListQuery
	try {
		query = parseListQuery(new URL(request.url))
	} catch (error) {
		return toErrorResponse(error)
	}
	return json(await readThread(env.STATS_DB, actorId, query))
}

async function handleGuestbookCreate(request: Request, env: Env): Promise<Response> {
	if (!isJsonContentType(request.headers.get('content-type'))) {
		return failure(415, 'invalid_content_type', 'content-type must be application/json')
	}

	const actorId = await guestbookActor(request, env)
	if (actorId === null) return guestbookUnavailable()
	if (await isRateLimited(env.GUESTBOOK_RATE_LIMITER, actorId)) {
		return failure(429, 'rate_limited', 'too many requests', { 'retry-after': '60' })
	}

	let parsed: GuestbookCreateRequest
	try {
		parsed = parseCreateRequest(await readJsonBody(request, MAX_MESSAGE_BYTES))
	} catch (error) {
		return toErrorResponse(error)
	}

	try {
		return json(await createMessage(env.STATS_DB, actorId, parsed.body, parsed.parentId), 201)
	} catch (error) {
		return guestbookFailure(error)
	}
}

async function handleGuestbookLike(request: Request, env: Env): Promise<Response> {
	if (request.method !== 'POST') {
		return failure(405, 'method_not_allowed', 'use POST /api/guestbook/like', { allow: 'POST' })
	}
	if (!isJsonContentType(request.headers.get('content-type'))) {
		return failure(415, 'invalid_content_type', 'content-type must be application/json')
	}

	const actorId = await guestbookActor(request, env)
	if (actorId === null) return guestbookUnavailable()
	if (await isRateLimited(env.GUESTBOOK_RATE_LIMITER, actorId)) {
		return failure(429, 'rate_limited', 'too many requests', { 'retry-after': '60' })
	}

	let parsed: GuestbookLikeRequest
	try {
		parsed = parseLikeRequest(await readJsonBody(request, MAX_MESSAGE_BYTES))
	} catch (error) {
		return toErrorResponse(error)
	}

	try {
		return json(await toggleMessageLike(env.STATS_DB, actorId, parsed.id, parsed.liked))
	} catch (error) {
		return guestbookFailure(error)
	}
}

async function handleGuestbookRemove(request: Request, env: Env): Promise<Response> {
	if (request.method !== 'POST') {
		return failure(405, 'method_not_allowed', 'use POST /api/guestbook/remove', { allow: 'POST' })
	}
	if (!isJsonContentType(request.headers.get('content-type'))) {
		return failure(415, 'invalid_content_type', 'content-type must be application/json')
	}

	const actorId = await guestbookActor(request, env)
	if (actorId === null) return guestbookUnavailable()
	if (await isRateLimited(env.GUESTBOOK_RATE_LIMITER, actorId)) {
		return failure(429, 'rate_limited', 'too many requests', { 'retry-after': '60' })
	}

	let parsed: GuestbookRemoveRequest
	try {
		parsed = parseRemoveRequest(await readJsonBody(request, MAX_MESSAGE_BYTES))
	} catch (error) {
		return toErrorResponse(error)
	}

	try {
		return json(await removeMessage(env.STATS_DB, actorId, parsed.id))
	} catch (error) {
		return guestbookFailure(error)
	}
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const { pathname } = new URL(request.url)
		if (pathname === '/api/stats/page') return handlePageStats(request, env)
		if (pathname === '/api/stats/total') return handleTotalStats(request, env)
		if (pathname === '/api/stats/health') return handleHealth(request, env)
		if (pathname === '/api/guestbook') return handleGuestbook(request, env)
		if (pathname === '/api/guestbook/like') return handleGuestbookLike(request, env)
		if (pathname === '/api/guestbook/remove') return handleGuestbookRemove(request, env)
		return env.ASSETS.fetch(request)
	},
}
