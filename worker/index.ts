import { deriveAnonymousActor } from './actor.ts'
import type { Env } from './env.ts'
import {
	MAX_BODY_BYTES,
	StatsProblem,
	exceedsBodyLimit,
	isJsonContentType,
	parsePageRequest,
	type StatsEvent,
} from './stats-service.ts'
import { applyPageEvent, checkDatabase, readTotalStats } from './stats-store.ts'

const JSON_HEADERS = { 'cache-control': 'no-store' }

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
	return Response.json(body, { status, headers: { ...JSON_HEADERS, ...headers } })
}

function failure(
	status: number,
	code: string,
	message: string,
	headers: Record<string, string> = {},
): Response {
	return json({ error: { code, message } }, status, headers)
}

function clientIp(request: Request): string {
	return request.headers.get('cf-connecting-ip') ?? '0.0.0.0'
}

async function readPageBody(request: Request): Promise<unknown> {
	const declared = Number.parseInt(request.headers.get('content-length') ?? '', 10)
	if (declared > MAX_BODY_BYTES) {
		throw new StatsProblem('invalid_body', `body must be at most ${MAX_BODY_BYTES} bytes`, 413)
	}
	const text = await request.text()
	if (exceedsBodyLimit(text)) {
		throw new StatsProblem('invalid_body', `body must be at most ${MAX_BODY_BYTES} bytes`, 413)
	}
	try {
		return JSON.parse(text) as unknown
	} catch {
		throw new StatsProblem('invalid_body', 'body must be valid JSON')
	}
}

async function rateLimited(env: Env, actorId: string | null): Promise<boolean> {
	if (actorId === null || env.STATS_RATE_LIMITER === undefined) return false
	const { success } = await env.STATS_RATE_LIMITER.limit({ key: actorId })
	return !success
}

async function handlePageStats(request: Request, env: Env): Promise<Response> {
	if (request.method !== 'POST') {
		return failure(405, 'method_not_allowed', 'use POST /api/stats/page', { allow: 'POST' })
	}
	if (!isJsonContentType(request.headers.get('content-type'))) {
		return failure(415, 'invalid_content_type', 'content-type must be application/json')
	}

	let parsed: { path: string, event: StatsEvent }
	try {
		parsed = parsePageRequest(await readPageBody(request))
	} catch (error) {
		if (error instanceof StatsProblem) return failure(error.status, error.code, error.message)
		throw error
	}

	// Likes are only meaningful with a pseudonymous identity, so without the secret they are
	// reported as unavailable while views keep working.
	const secret = env.STATS_ACTOR_SECRET
	const actorId = secret === undefined ? null : await deriveAnonymousActor(clientIp(request), secret)

	if (await rateLimited(env, actorId)) {
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

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const { pathname } = new URL(request.url)
		if (pathname === '/api/stats/page') return handlePageStats(request, env)
		if (pathname === '/api/stats/total') return handleTotalStats(request, env)
		if (pathname === '/api/stats/health') return handleHealth(request, env)
		return env.ASSETS.fetch(request)
	},
}
