import type { Env } from './env.ts'
import { failure, json, readJsonBody } from './http.ts'
import { ADMIN_HTML } from './admin-page.ts'

/**
 * The one-person control room for the site: totals, per-page stats, the guestbook
 * and the links wall. It is a plain HTML console served straight from the Worker,
 * and every /api/admin route behind it needs `Authorization: Bearer <ADMIN_TOKEN>`.
 */

const MAX_ADMIN_BODY_BYTES = 1024
const LIST_LIMIT = 200
const ALLOWED_LINK_STATUS = ['pending', 'approved', 'rejected'] as const

const TOTAL_SELECT = `SELECT COALESCE(SUM(views), 0) AS views, COALESCE(SUM(likes), 0) AS likes, COUNT(*) AS pages
FROM page_stats`
const PAGES_SELECT = `SELECT path, views, likes, updated_at FROM page_stats
ORDER BY views DESC, likes DESC, path ASC LIMIT ?1`
const GUESTBOOK_COUNT_SELECT = 'SELECT COUNT(*) AS total FROM guestbook_messages'
const GUESTBOOK_SELECT = `SELECT m.id, m.parent_id, m.body, m.created_at, COUNT(l.actor_id) AS likes
FROM guestbook_messages m
LEFT JOIN guestbook_likes l ON l.message_id = m.id
GROUP BY m.id
ORDER BY m.id DESC LIMIT ?1`
const LINKS_COUNT_SELECT = 'SELECT COUNT(*) AS total FROM link_submissions'
const LINKS_PENDING_SELECT = `SELECT COUNT(*) AS total FROM link_submissions WHERE status = 'pending'`
const LINKS_SELECT = `SELECT id, url, domain, name, description, icon, status, created_at FROM link_submissions
ORDER BY id DESC LIMIT ?1`

// The daily chart merges four sources: views come from daily_views (recorded per view),
// likes/messages/links from the created_at column of their own tables, so those three
// reach back before daily_views existed.
const DAILY_DAYS = 30
const DAILY_VIEWS_SELECT = 'SELECT day, views FROM daily_views WHERE day >= ?1 ORDER BY day ASC'
const DAILY_LIKES_SELECT = `SELECT date(created_at) AS day, COUNT(*) AS likes
FROM page_likes WHERE date(created_at) >= ?1 GROUP BY day`
const DAILY_MESSAGES_SELECT = `SELECT date(created_at) AS day, COUNT(*) AS messages
FROM guestbook_messages WHERE date(created_at) >= ?1 GROUP BY day`
const DAILY_LINKS_SELECT = `SELECT date(created_at) AS day, COUNT(*) AS links
FROM link_submissions WHERE date(created_at) >= ?1 GROUP BY day`

// A message is removed together with its replies and every like attached to either.
const REPLY_LIKE_DELETE = `DELETE FROM guestbook_likes
WHERE message_id IN (SELECT id FROM guestbook_messages WHERE parent_id = ?1)`
const REPLY_DELETE = 'DELETE FROM guestbook_messages WHERE parent_id = ?1'
const MESSAGE_LIKE_DELETE = 'DELETE FROM guestbook_likes WHERE message_id = ?1'
const MESSAGE_DELETE = 'DELETE FROM guestbook_messages WHERE id = ?1'

const LINK_STATUS_UPDATE = 'UPDATE link_submissions SET status = ?1 WHERE id = ?2'
const LINK_DELETE = 'DELETE FROM link_submissions WHERE id = ?1'

type CountRow = { total: number }

export function adminPage(): Response {
	return new Response(ADMIN_HTML, {
		headers: {
			'content-type': 'text/html; charset=utf-8',
			'cache-control': 'no-store',
		},
	})
}

export async function handleAdmin(
	request: Request,
	env: Env,
	pathname: string,
): Promise<Response> {
	if (!(await isAuthorized(request, env))) {
		return failure(401, 'unauthorized', 'a valid admin token is required', {
			'www-authenticate': 'Bearer',
		})
	}

	if (pathname === '/api/admin/overview') {
		if (request.method !== 'GET') return methodNotAllowed('GET')
		return json(await readOverview(env))
	}
	if (pathname === '/api/admin/pages') {
		if (request.method !== 'GET') return methodNotAllowed('GET')
		return json(await readPages(env))
	}
	if (pathname === '/api/admin/daily') {
		if (request.method !== 'GET') return methodNotAllowed('GET')
		return json(await readDaily(env))
	}
	if (pathname === '/api/admin/guestbook') {
		if (request.method !== 'GET') return methodNotAllowed('GET')
		return json(await readGuestbook(env))
	}
	if (pathname === '/api/admin/links') {
		if (request.method !== 'GET') return methodNotAllowed('GET')
		return json(await readLinks(env))
	}
	if (pathname === '/api/admin/guestbook/delete') {
		if (request.method !== 'POST') return methodNotAllowed('POST')
		return deleteGuestbookMessage(request, env)
	}
	if (pathname === '/api/admin/links/status') {
		if (request.method !== 'POST') return methodNotAllowed('POST')
		return setLinkStatus(request, env)
	}
	if (pathname === '/api/admin/links/delete') {
		if (request.method !== 'POST') return methodNotAllowed('POST')
		return deleteLink(request, env)
	}
	return failure(404, 'not_found', 'unknown admin route')
}

function methodNotAllowed(allow: string): Response {
	return failure(405, 'method_not_allowed', `use ${allow} on this admin route`, { allow })
}

async function readOverview(env: Env): Promise<Record<string, number>> {
	const [totals, guests, links, pending] = await Promise.all([
		env.STATS_DB.prepare(TOTAL_SELECT).first<{ views: number | null, likes: number | null, pages: number | null }>(),
		env.STATS_DB.prepare(GUESTBOOK_COUNT_SELECT).first<CountRow>(),
		env.STATS_DB.prepare(LINKS_COUNT_SELECT).first<CountRow>(),
		env.STATS_DB.prepare(LINKS_PENDING_SELECT).first<CountRow>(),
	])
	return {
		views: totals?.views ?? 0,
		likes: totals?.likes ?? 0,
		pages: totals?.pages ?? 0,
		guestbook: guests?.total ?? 0,
		links: links?.total ?? 0,
		pendingLinks: pending?.total ?? 0,
	}
}

async function readPages(env: Env): Promise<unknown> {
	const rows = await env.STATS_DB.prepare(PAGES_SELECT).bind(LIST_LIMIT).all<{
		path: string
		views: number
		likes: number
		updated_at: string
	}>()
	return { pages: rows.results }
}

type DailyDay = { day: string, views: number, likes: number, messages: number, links: number }

async function readDaily(env: Env): Promise<{ days: DailyDay[] }> {
	const days = recentUtcDays(DAILY_DAYS)
	const from = days[0]
	const [views, likes, messages, links] = await Promise.all([
		env.STATS_DB.prepare(DAILY_VIEWS_SELECT).bind(from).all<{ day: string, views: number }>(),
		env.STATS_DB.prepare(DAILY_LIKES_SELECT).bind(from).all<{ day: string, likes: number }>(),
		env.STATS_DB.prepare(DAILY_MESSAGES_SELECT).bind(from).all<{ day: string, messages: number }>(),
		env.STATS_DB.prepare(DAILY_LINKS_SELECT).bind(from).all<{ day: string, links: number }>(),
	])
	const byDay = <T extends { day: string }>(rows: T[]): Map<string, T> =>
		new Map(rows.map((row) => [row.day, row]))
	const viewsByDay = byDay(views.results)
	const likesByDay = byDay(likes.results)
	const messagesByDay = byDay(messages.results)
	const linksByDay = byDay(links.results)
	return {
		days: days.map((day) => ({
			day,
			views: viewsByDay.get(day)?.views ?? 0,
			likes: likesByDay.get(day)?.likes ?? 0,
			messages: messagesByDay.get(day)?.messages ?? 0,
			links: linksByDay.get(day)?.links ?? 0,
		})),
	}
}

/** The last `count` UTC days (YYYY-MM-DD) ending today, oldest first. */
function recentUtcDays(count: number): string[] {
	const days: string[] = []
	const now = new Date()
	for (let offset = count - 1; offset >= 0; offset -= 1) {
		days.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset))
			.toISOString()
			.slice(0, 10))
	}
	return days
}

async function readGuestbook(env: Env): Promise<unknown> {
	const rows = await env.STATS_DB.prepare(GUESTBOOK_SELECT).bind(LIST_LIMIT).all<{
		id: number
		parent_id: number | null
		body: string
		created_at: string
		likes: number
	}>()
	return { messages: rows.results }
}

async function readLinks(env: Env): Promise<unknown> {
	const rows = await env.STATS_DB.prepare(LINKS_SELECT).bind(LIST_LIMIT).all()
	return { links: rows.results }
}

async function deleteGuestbookMessage(request: Request, env: Env): Promise<Response> {
	const id = await readId(request)
	if (id === null) return failure(400, 'invalid_body', 'id must be a positive integer')
	await env.STATS_DB.batch([
		env.STATS_DB.prepare(REPLY_LIKE_DELETE).bind(id),
		env.STATS_DB.prepare(REPLY_DELETE).bind(id),
		env.STATS_DB.prepare(MESSAGE_LIKE_DELETE).bind(id),
		env.STATS_DB.prepare(MESSAGE_DELETE).bind(id),
	])
	return json({ ok: true, id })
}

async function setLinkStatus(request: Request, env: Env): Promise<Response> {
	const payload = await readObject(request)
	if (payload === null) return failure(400, 'invalid_body', 'body must be a JSON object')
	const id = positiveInteger(payload.id)
	const status = payload.status
	if (id === null) return failure(400, 'invalid_body', 'id must be a positive integer')
	if (typeof status !== 'string' || !(ALLOWED_LINK_STATUS as readonly string[]).includes(status)) {
		return failure(400, 'invalid_body', `status must be one of ${ALLOWED_LINK_STATUS.join(', ')}`)
	}
	await env.STATS_DB.prepare(LINK_STATUS_UPDATE).bind(status, id).run()
	return json({ ok: true, id, status })
}

async function deleteLink(request: Request, env: Env): Promise<Response> {
	const id = await readId(request)
	if (id === null) return failure(400, 'invalid_body', 'id must be a positive integer')
	await env.STATS_DB.prepare(LINK_DELETE).bind(id).run()
	return json({ ok: true, id })
}

async function readId(request: Request): Promise<number | null> {
	const payload = await readObject(request)
	return payload === null ? null : positiveInteger(payload.id)
}

async function readObject(request: Request): Promise<Record<string, unknown> | null> {
	try {
		const value = await readJsonBody(request, MAX_ADMIN_BODY_BYTES)
		if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
		return value as Record<string, unknown>
	} catch {
		return null
	}
}

function positiveInteger(value: unknown): number | null {
	return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

async function isAuthorized(request: Request, env: Env): Promise<boolean> {
	const expected = env.ADMIN_TOKEN
	if (expected === undefined || expected === '') return false
	const header = request.headers.get('authorization')
	if (header === null || !header.startsWith('Bearer ')) return false
	return sameSecret(header.slice('Bearer '.length), expected)
}

/** Compares the two secrets through their digests so the check does not leak length. */
async function sameSecret(a: string, b: string): Promise<boolean> {
	const encoder = new TextEncoder()
	const [digestA, digestB] = await Promise.all([
		crypto.subtle.digest('SHA-256', encoder.encode(a)),
		crypto.subtle.digest('SHA-256', encoder.encode(b)),
	])
	const bytesA = new Uint8Array(digestA)
	const bytesB = new Uint8Array(digestB)
	let diff = 0
	for (let i = 0; i < bytesA.length; i += 1) diff |= bytesA[i] ^ bytesB[i]
	return diff === 0
}
