import assert from 'node:assert/strict'
import test from 'node:test'
import { deriveAnonymousActor } from './actor.ts'
import type { D1Database, Env, RateLimiter } from './env.ts'
import { MAX_MESSAGE_BYTES } from './guestbook-service.ts'
import worker from './index.ts'
import { createStatsDatabase } from './test/d1-sqlite.ts'

const PAGE_URL = 'https://hydblog.xyz/api/stats/page'
const TOTAL_URL = 'https://hydblog.xyz/api/stats/total'
const HEALTH_URL = 'https://hydblog.xyz/api/stats/health'
const GUESTBOOK_URL = 'https://hydblog.xyz/api/guestbook'
const GUESTBOOK_LIKE_URL = 'https://hydblog.xyz/api/guestbook/like'
const GUESTBOOK_REMOVE_URL = 'https://hydblog.xyz/api/guestbook/remove'
const LINKS_URL = 'https://hydblog.xyz/api/links'
const SECRET = 'test-actor-secret'
const VISITOR = '203.0.113.7'
const OTHER_VISITOR = '198.51.100.9'

type TestEnv = {
	env: Env
	assets: string[]
	limiterKeys: string[]
	guestbookLimiterKeys: string[]
	linksLimiterKeys: string[]
}

function createEnv(options: {
	db?: D1Database
	secret?: string
	limiter?: 'allow' | 'deny'
	guestbookLimiter?: 'allow' | 'deny'
	linksLimiter?: 'allow' | 'deny'
} = {}): TestEnv {
	const assets: string[] = []
	const limiterKeys: string[] = []
	const guestbookLimiterKeys: string[] = []
	const linksLimiterKeys: string[] = []
	const env: Env = {
		STATS_DB: options.db ?? createStatsDatabase(),
		ASSETS: {
			async fetch(request: Request) {
				assets.push(new URL(request.url).pathname)
				return new Response('asset', { status: 200 })
			},
		},
	}
	if (options.secret !== undefined) env.STATS_ACTOR_SECRET = options.secret
	if (options.limiter !== undefined) {
		const limiter: RateLimiter = {
			async limit({ key }) {
				limiterKeys.push(key)
				return { success: options.limiter === 'allow' }
			},
		}
		env.STATS_RATE_LIMITER = limiter
	}
	if (options.guestbookLimiter !== undefined) {
		const limiter: RateLimiter = {
			async limit({ key }) {
				guestbookLimiterKeys.push(key)
				return { success: options.guestbookLimiter === 'allow' }
			},
		}
		env.GUESTBOOK_RATE_LIMITER = limiter
	}
	if (options.linksLimiter !== undefined) {
		const limiter: RateLimiter = {
			async limit({ key }) {
				linksLimiterKeys.push(key)
				return { success: options.linksLimiter === 'allow' }
			},
		}
		env.LINKS_RATE_LIMITER = limiter
	}
	return { env, assets, limiterKeys, guestbookLimiterKeys, linksLimiterKeys }
}

function pageRequest(
	body: unknown,
	{ ip = VISITOR, headers = {}, ...init }: RequestInit & { ip?: string } = {},
): Request {
	return new Request(PAGE_URL, {
		method: 'POST',
		body: typeof body === 'string' ? body : JSON.stringify(body),
		...init,
		headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...headers },
	})
}

const post = (env: Env, body: unknown, init?: RequestInit & { ip?: string }) =>
	worker.fetch(pageRequest(body, init), env)

const json = async (response: Response) => (await response.json()) as Record<string, unknown>

const errorCode = async (response: Response) =>
	((await json(response)).error as { code: string }).code

type GuestbookReplyJson = {
	id: number
	body: string
	handle: string
	mine: boolean
	createdAt: string
	likes: number
	liked: boolean
}

type GuestbookMessageJson = GuestbookReplyJson & {
	replyCount?: number
	replies?: GuestbookReplyJson[]
}

type GuestbookListJson = {
	messages: GuestbookMessageJson[]
	nextBefore: number | null
	total: number
}

function guestbookRequest(
	url: string,
	body: unknown,
	{ ip = VISITOR, headers = {}, ...init }: RequestInit & { ip?: string } = {},
): Request {
	return new Request(url, {
		method: 'POST',
		body: typeof body === 'string' ? body : JSON.stringify(body),
		...init,
		headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...headers },
	})
}

const postGuestbook = (env: Env, url: string, body: unknown, init?: RequestInit & { ip?: string }) =>
	worker.fetch(guestbookRequest(url, body, init), env)

const guestbookJson = async (response: Response) => (await response.json()) as GuestbookMessageJson

const readGuestbook = (env: Env, ip = VISITOR) =>
	worker.fetch(new Request(GUESTBOOK_URL, { headers: { 'cf-connecting-ip': ip } }), env)

const guestbookList = async (response: Response) => (await response.json()) as GuestbookListJson

function linksRequest(
	body: unknown,
	{ ip = VISITOR, headers = {}, ...init }: RequestInit & { ip?: string } = {},
): Request {
	return new Request(LINKS_URL, {
		method: 'POST',
		body: typeof body === 'string' ? body : JSON.stringify(body),
		...init,
		headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...headers },
	})
}

const postLinks = (env: Env, body: unknown, init?: RequestInit & { ip?: string }) =>
	worker.fetch(linksRequest(body, init), env)

/** The submit route reads the target site over the global fetch; this stands in for it. */
function stubSiteFetch(html: string, init: { status?: number; url?: string; type?: string } = {}) {
	const original = globalThis.fetch
	const status = init.status ?? 200
	globalThis.fetch = (async () => ({
		ok: status >= 200 && status < 300,
		status,
		url: init.url ?? 'https://example.com/',
		headers: new Headers({ 'content-type': init.type ?? 'text/html; charset=utf-8' }),
		text: async () => html,
	})) as unknown as typeof fetch
	return () => {
		globalThis.fetch = original
	}
}

const SITE_HTML = `<html><head><title>Rui&#39;s Blog</title>
<meta name="description" content="Code and indie making">
<link rel="icon" href="/icon.png"></head></html>`

test('the first view reports views 1 with normalized path and no-store', async () => {
	const { env } = createEnv({ secret: SECRET })
	const response = await post(env, { path: '/2026/04/04/transformer-learning-notes/', event: 'view' })

	assert.equal(response.status, 200)
	assert.equal(response.headers.get('cache-control'), 'no-store')
	assert.deepEqual(await json(response), {
		path: '/2026/04/04/transformer-learning-notes',
		views: 1,
		likes: 0,
		liked: false,
	})
})

test('repeated views from the same and other visitors accumulate', async () => {
	const { env } = createEnv({ secret: SECRET })
	await post(env, { path: '/notes/', event: 'view' })
	await post(env, { path: '/notes', event: 'view' })
	const other = await post(env, { path: '/notes/', event: 'view' }, { ip: OTHER_VISITOR })

	assert.deepEqual(await json(other), { path: '/notes', views: 3, likes: 0, liked: false })
})

test('liking twice from one visitor counts once and stays liked', async () => {
	const { env } = createEnv({ secret: SECRET })
	const first = await post(env, { path: '/notes/', event: 'like' })
	const second = await post(env, { path: '/notes/', event: 'like' })

	assert.equal(first.status, 200)
	assert.deepEqual(await json(first), { path: '/notes', views: 0, likes: 1, liked: true })
	assert.deepEqual(await json(second), { path: '/notes', views: 0, likes: 1, liked: true })
})

test('a second visitor adds a like and a view reports liked only for the liker', async () => {
	const { env } = createEnv({ secret: SECRET })
	await post(env, { path: '/notes', event: 'like' })
	const second = await post(env, { path: '/notes', event: 'like' }, { ip: OTHER_VISITOR })

	assert.deepEqual(await json(second), { path: '/notes', views: 0, likes: 2, liked: true })
	assert.deepEqual(await json(await post(env, { path: '/notes', event: 'view' })), {
		path: '/notes',
		views: 1,
		likes: 2,
		liked: true,
	})
})

test('unlike steps the counter back and is idempotent', async () => {
	const { env } = createEnv({ secret: SECRET })
	await post(env, { path: '/notes', event: 'like' })
	await post(env, { path: '/notes', event: 'like' }, { ip: OTHER_VISITOR })

	assert.deepEqual(await json(await post(env, { path: '/notes', event: 'unlike' })), {
		path: '/notes',
		views: 0,
		likes: 1,
		liked: false,
	})
	assert.deepEqual(await json(await post(env, { path: '/notes', event: 'unlike' })), {
		path: '/notes',
		views: 0,
		likes: 1,
		liked: false,
	})
	assert.deepEqual(await json(await post(env, { path: '/unseen', event: 'unlike' })), {
		path: '/unseen',
		views: 0,
		likes: 0,
		liked: false,
	})
})

test('invalid paths are rejected with invalid_path', async () => {
	const { env } = createEnv({ secret: SECRET })
	const paths = ['../x', 'http://example.com/notes/', `/${'a'.repeat(200)}`, 'notes/', '/notes//about', '', 7]
	for (const path of paths) {
		const response = await post(env, { path, event: 'view' })
		assert.equal(response.status, 400, `path ${JSON.stringify(path)}`)
		assert.equal(((await json(response)).error as { code: string }).code, 'invalid_path')
		assert.equal(response.headers.get('cache-control'), 'no-store')
	}
})

test('invalid events and invalid bodies are rejected separately', async () => {
	const { env } = createEnv({ secret: SECRET })

	const badEvent = await post(env, { path: '/notes', event: 'clap' })
	assert.equal(badEvent.status, 400)
	assert.equal(((await json(badEvent)).error as { code: string }).code, 'invalid_event')

	for (const body of ['{"path":', '[]', 'null', '"view"', '']) {
		const response = await post(env, body)
		assert.equal(response.status, 400, `body ${body}`)
		assert.equal(((await json(response)).error as { code: string }).code, 'invalid_body')
	}

	const missingFields = await post(env, {})
	assert.equal(missingFields.status, 400)
	assert.equal(((await json(missingFields)).error as { code: string }).code, 'invalid_path')
})

test('non-JSON content types are refused before the body is read', async () => {
	const { env } = createEnv({ secret: SECRET })
	const contentTypes = [null, 'text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x']

	for (const contentType of contentTypes) {
		const headers = contentType === null ? { 'content-type': '' } : { 'content-type': contentType }
		const response = await post(env, 'path=%2Fnotes&event=like', { headers })
		assert.equal(response.status, 415, `content-type ${contentType}`)
		assert.equal(((await json(response)).error as { code: string }).code, 'invalid_content_type')
		assert.equal(response.headers.get('cache-control'), 'no-store')
	}
})

test('a JSON content type with parameters is accepted', async () => {
	const { env } = createEnv({ secret: SECRET })
	const response = await post(env, { path: '/notes', event: 'view' }, {
		headers: { 'content-type': 'application/json; charset=utf-8' },
	})
	assert.equal(response.status, 200)
})

test('oversized bodies are refused by length header or measured size', async () => {
	const { env } = createEnv({ secret: SECRET })
	const oversized = JSON.stringify({ path: '/notes', event: 'view', padding: 'x'.repeat(4096) })

	const declared = await post(env, oversized, { headers: { 'content-length': '5000' } })
	assert.equal(declared.status, 413)
	assert.equal(((await json(declared)).error as { code: string }).code, 'invalid_body')

	const measured = await post(env, oversized)
	assert.equal(measured.status, 413)
	assert.equal(((await json(measured)).error as { code: string }).code, 'invalid_body')
})

test('views work without STATS_ACTOR_SECRET while likes report 503', async () => {
	const { env } = createEnv()
	const view = await post(env, { path: '/notes', event: 'view' })
	assert.deepEqual(await json(view), { path: '/notes', views: 1, likes: 0, liked: false })

	for (const event of ['like', 'unlike']) {
		const response = await post(env, { path: '/notes', event })
		assert.equal(response.status, 503)
		assert.equal(((await json(response)).error as { code: string }).code, 'likes_unavailable')
	}
	assert.deepEqual(await json(await post(env, { path: '/notes', event: 'view' })), {
		path: '/notes',
		views: 2,
		likes: 0,
		liked: false,
	})
})

test('the rate limiter keys on the visitor pseudonym and returns 429 with retry-after', async () => {
	const { env, limiterKeys } = createEnv({ secret: SECRET, limiter: 'deny' })
	const response = await post(env, { path: '/notes', event: 'view' })

	assert.equal(response.status, 429)
	assert.equal(response.headers.get('retry-after'), '60')
	assert.equal(response.headers.get('cache-control'), 'no-store')
	assert.equal(((await json(response)).error as { code: string }).code, 'rate_limited')
	assert.match(limiterKeys[0] ?? '', /^[0-9a-f]{64}$/)
	assert.equal(limiterKeys[0]?.includes(VISITOR), false)
})

test('the rate limiter allows requests under the limit and is skipped when unbound', async () => {
	const allowed = createEnv({ secret: SECRET, limiter: 'allow' })
	assert.equal((await post(allowed.env, { path: '/notes', event: 'view' })).status, 200)
	assert.equal(allowed.limiterKeys.length, 1)

	const unbound = createEnv({ secret: SECRET })
	assert.equal((await post(unbound.env, { path: '/notes', event: 'view' })).status, 200)
	assert.equal(unbound.limiterKeys.length, 0)
})

test('a missing limiter key degrades to no rate limit instead of one shared bucket', async () => {
	const { env, limiterKeys } = createEnv({ limiter: 'deny' })
	assert.equal((await post(env, { path: '/notes', event: 'view' })).status, 200)
	assert.equal(limiterKeys.length, 0)
})

test('non-POST requests to the page endpoint are rejected with 405', async () => {
	const { env } = createEnv({ secret: SECRET })
	for (const method of ['GET', 'PUT', 'DELETE', 'OPTIONS', 'HEAD']) {
		const response = await worker.fetch(new Request(PAGE_URL, { method }), env)
		assert.equal(response.status, 405, method)
		assert.equal(response.headers.get('allow'), 'POST')
		assert.equal(response.headers.get('cache-control'), 'no-store')
		assert.equal(((await json(response)).error as { code: string }).code, 'method_not_allowed')
	}
})

test('total aggregates views, likes, and pages', async () => {
	const { env } = createEnv({ secret: SECRET })
	await post(env, { path: '/notes', event: 'view' })
	await post(env, { path: '/notes', event: 'view' })
	await post(env, { path: '/about', event: 'view' }, { ip: OTHER_VISITOR })
	await post(env, { path: '/notes', event: 'like' })

	const response = await worker.fetch(new Request(TOTAL_URL), env)
	assert.equal(response.status, 200)
	assert.equal(response.headers.get('cache-control'), 'no-store')
	assert.deepEqual(await json(response), { views: 3, likes: 1, pages: 2 })

	const rejected = await worker.fetch(new Request(TOTAL_URL, { method: 'POST' }), env)
	assert.equal(rejected.status, 405)
	assert.equal(rejected.headers.get('allow'), 'GET')
})

test('health probes the database and reports 503 when it is unreachable', async () => {
	const healthy = createEnv()
	const ok = await worker.fetch(new Request(HEALTH_URL), healthy.env)
	assert.equal(ok.status, 200)
	assert.equal(ok.headers.get('cache-control'), 'no-store')
	assert.deepEqual(await json(ok), { ok: true })

	const broken = createEnv({ db: unreachableDatabase() })
	const failed = await worker.fetch(new Request(HEALTH_URL), broken.env)
	assert.equal(failed.status, 503)
	assert.deepEqual(await json(failed), { ok: false })

	const rejected = await worker.fetch(new Request(HEALTH_URL, { method: 'PUT' }), healthy.env)
	assert.equal(rejected.status, 405)
})

test('page and total responses never wrap the payload in an ok field', async () => {
	const { env } = createEnv({ secret: SECRET })
	const page = await json(await post(env, { path: '/notes', event: 'view' }))
	assert.deepEqual(Object.keys(page), ['path', 'views', 'likes', 'liked'])
	const total = await json(await worker.fetch(new Request(TOTAL_URL), env))
	assert.deepEqual(Object.keys(total), ['views', 'likes', 'pages'])
})

test('every other path falls through to the assets fetcher', async () => {
	const { env, assets } = createEnv()
	for (const path of ['/', '/about/', '/2026/04/04/notes/', '/api/stats/unknown', '/api/stats']) {
		const response = await worker.fetch(new Request(`https://hydblog.xyz${path}`), env)
		assert.equal(response.status, 200)
		assert.equal(await response.text(), 'asset')
	}
	assert.deepEqual(assets, ['/', '/about/', '/2026/04/04/notes/', '/api/stats/unknown', '/api/stats'])
})

test('guestbook routes refuse other methods with 405 and an allow header', async () => {
	const { env } = createEnv({ secret: SECRET })
	for (const method of ['GET', 'PUT', 'DELETE', 'OPTIONS', 'HEAD']) {
		for (const url of [GUESTBOOK_LIKE_URL, GUESTBOOK_REMOVE_URL]) {
			const response = await worker.fetch(new Request(url, { method }), env)
			assert.equal(response.status, 405, `${method} ${url}`)
			assert.equal(response.headers.get('allow'), 'POST')
			assert.equal(response.headers.get('cache-control'), 'no-store')
			assert.equal(await errorCode(response), 'method_not_allowed')
		}
	}
	for (const method of ['PUT', 'DELETE', 'OPTIONS', 'HEAD']) {
		const response = await worker.fetch(new Request(GUESTBOOK_URL, { method }), env)
		assert.equal(response.status, 405, method)
		assert.equal(response.headers.get('allow'), 'GET, POST')
		assert.equal(response.headers.get('cache-control'), 'no-store')
		assert.equal(await errorCode(response), 'method_not_allowed')
	}
})

test('guestbook writes require a JSON content type before the body is read', async () => {
	const { env } = createEnv({ secret: SECRET })
	for (const url of [GUESTBOOK_URL, GUESTBOOK_LIKE_URL, GUESTBOOK_REMOVE_URL]) {
		const response = await postGuestbook(env, url, 'body=hello', {
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
		})
		assert.equal(response.status, 415, url)
		assert.equal(await errorCode(response), 'invalid_content_type')
		assert.equal(response.headers.get('cache-control'), 'no-store')
	}
})

test('guestbook bodies over the message byte cap are refused with 413', async () => {
	const { env } = createEnv({ secret: SECRET })
	const oversized = JSON.stringify({ body: 'x'.repeat(MAX_MESSAGE_BYTES) })

	const declared = await postGuestbook(env, GUESTBOOK_URL, oversized, {
		headers: { 'content-length': '9000' },
	})
	assert.equal(declared.status, 413)
	assert.equal(await errorCode(declared), 'invalid_body')
	assert.equal(declared.headers.get('cache-control'), 'no-store')

	const measured = await postGuestbook(env, GUESTBOOK_URL, oversized)
	assert.equal(measured.status, 413)
	assert.equal(await errorCode(measured), 'invalid_body')
})

test('the guestbook happy path posts, replies, lists, likes, and removes', async () => {
	const { env } = createEnv({ secret: SECRET })

	const created = await postGuestbook(env, GUESTBOOK_URL, { body: '  first post  ' })
	assert.equal(created.status, 201)
	assert.equal(created.headers.get('cache-control'), 'no-store')
	const thread = await guestbookJson(created)
	assert.deepEqual(Object.keys(thread), [
		'id',
		'body',
		'handle',
		'mine',
		'createdAt',
		'likes',
		'liked',
		'replyCount',
		'replies',
	])
	assert.equal(thread.body, 'first post')
	assert.equal(thread.mine, true)
	assert.equal(thread.likes, 0)
	assert.equal(thread.liked, false)
	assert.equal(thread.replyCount, 0)
	assert.deepEqual(thread.replies, [])
	assert.match(thread.handle, /^[0-9a-f]{4}$/)
	assert.match(thread.createdAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
	assert.equal(JSON.stringify(thread).includes('actor_id'), false)

	const replied = await postGuestbook(env, GUESTBOOK_URL, { body: 'a reply', parentId: thread.id }, {
		ip: OTHER_VISITOR,
	})
	assert.equal(replied.status, 201)
	assert.equal(replied.headers.get('cache-control'), 'no-store')
	const reply = await guestbookJson(replied)
	assert.deepEqual(Object.keys(reply), ['id', 'body', 'handle', 'mine', 'createdAt', 'likes', 'liked'])
	assert.equal(reply.mine, true)

	const listedResponse = await readGuestbook(env)
	assert.equal(listedResponse.status, 200)
	assert.equal(listedResponse.headers.get('cache-control'), 'no-store')
	const listed = await guestbookList(listedResponse)
	assert.deepEqual(Object.keys(listed), ['messages', 'nextBefore', 'total'])
	assert.equal(listed.total, 1)
	assert.equal(listed.nextBefore, null)
	assert.equal(listed.messages.length, 1)
	assert.equal(listed.messages[0].body, 'first post')
	assert.equal(listed.messages[0].mine, true)
	assert.equal(listed.messages[0].replyCount, 1)
	assert.equal(listed.messages[0].replies?.[0].body, 'a reply')
	assert.equal(listed.messages[0].replies?.[0].mine, false)

	const liked = await postGuestbook(env, GUESTBOOK_LIKE_URL, { id: thread.id, liked: true })
	assert.equal(liked.status, 200)
	assert.equal(liked.headers.get('cache-control'), 'no-store')
	assert.deepEqual(await json(liked), { id: thread.id, likes: 1, liked: true })

	const likedAgain = await postGuestbook(env, GUESTBOOK_LIKE_URL, { id: thread.id, liked: true })
	assert.deepEqual(await json(likedAgain), { id: thread.id, likes: 1, liked: true })

	const likedByOther = await postGuestbook(env, GUESTBOOK_LIKE_URL, { id: thread.id, liked: true }, {
		ip: OTHER_VISITOR,
	})
	assert.deepEqual(await json(likedByOther), { id: thread.id, likes: 2, liked: true })

	const unliked = await postGuestbook(env, GUESTBOOK_LIKE_URL, { id: thread.id, liked: false })
	assert.deepEqual(await json(unliked), { id: thread.id, likes: 1, liked: false })

	const removed = await postGuestbook(env, GUESTBOOK_REMOVE_URL, { id: thread.id })
	assert.equal(removed.status, 200)
	assert.equal(removed.headers.get('cache-control'), 'no-store')
	assert.deepEqual(await json(removed), { id: thread.id, removed: true })

	const emptiedResponse = await readGuestbook(env)
	assert.equal(emptiedResponse.status, 200)
	assert.equal(emptiedResponse.headers.get('cache-control'), 'no-store')
	const emptied = await guestbookList(emptiedResponse)
	assert.equal(emptied.total, 0)
	assert.deepEqual(emptied.messages, [])
})

test('guestbook reads and writes reject malformed ids and messages', async () => {
	const { env } = createEnv({ secret: SECRET })

	const tooLong = await postGuestbook(env, GUESTBOOK_URL, { body: '😀'.repeat(501) })
	assert.equal(tooLong.status, 400)
	assert.equal(await errorCode(tooLong), 'message_too_long')

	const badParent = await postGuestbook(env, GUESTBOOK_URL, { body: 'hello', parentId: 404 })
	assert.equal(badParent.status, 400)
	assert.equal(await errorCode(badParent), 'invalid_parent')

	const badId = await postGuestbook(env, GUESTBOOK_LIKE_URL, { id: 0, liked: true })
	assert.equal(badId.status, 400)
	assert.equal(await errorCode(badId), 'invalid_id')

	const badCursor = await worker.fetch(new Request(`${GUESTBOOK_URL}?before=0`), env)
	assert.equal(badCursor.status, 400)
	assert.equal(await errorCode(badCursor), 'invalid_id')
	assert.equal(badCursor.headers.get('cache-control'), 'no-store')
})

test('guestbook reports a missing message and an unauthorized removal', async () => {
	const { env } = createEnv({ secret: SECRET })
	const thread = await guestbookJson(await postGuestbook(env, GUESTBOOK_URL, { body: 'mine' }))

	const missing = await postGuestbook(env, GUESTBOOK_LIKE_URL, { id: thread.id + 999, liked: true })
	assert.equal(missing.status, 404)
	assert.equal(await errorCode(missing), 'message_not_found')
	assert.equal(missing.headers.get('cache-control'), 'no-store')

	const refused = await postGuestbook(env, GUESTBOOK_REMOVE_URL, { id: thread.id }, {
		ip: OTHER_VISITOR,
	})
	assert.equal(refused.status, 403)
	assert.equal(await errorCode(refused), 'not_author')
	assert.equal(refused.headers.get('cache-control'), 'no-store')
})

test('the guestbook is unavailable without STATS_ACTOR_SECRET', async () => {
	const { env } = createEnv()
	const listed = await worker.fetch(new Request(GUESTBOOK_URL), env)
	assert.equal(listed.status, 503)
	assert.equal(await errorCode(listed), 'guestbook_unavailable')
	assert.equal(listed.headers.get('cache-control'), 'no-store')

	const writes: [string, unknown][] = [
		[GUESTBOOK_URL, { body: 'hello' }],
		[GUESTBOOK_LIKE_URL, { id: 1, liked: true }],
		[GUESTBOOK_REMOVE_URL, { id: 1 }],
	]
	for (const [url, body] of writes) {
		const response = await postGuestbook(env, url, body)
		assert.equal(response.status, 503, url)
		assert.equal(await errorCode(response), 'guestbook_unavailable')
		assert.equal(response.headers.get('cache-control'), 'no-store')
	}
})

test('the guestbook limiter keys on the visitor pseudonym and returns 429 with retry-after', async () => {
	const { env, guestbookLimiterKeys } = createEnv({ secret: SECRET, guestbookLimiter: 'deny' })
	const response = await postGuestbook(env, GUESTBOOK_URL, { body: 'hello' })

	assert.equal(response.status, 429)
	assert.equal(response.headers.get('retry-after'), '60')
	assert.equal(response.headers.get('cache-control'), 'no-store')
	assert.equal(await errorCode(response), 'rate_limited')
	assert.match(guestbookLimiterKeys[0] ?? '', /^[0-9a-f]{64}$/)
	assert.equal(guestbookLimiterKeys[0]?.includes(VISITOR), false)
})

test('the guestbook write policy reports rate_limited with the seconds to wait', async () => {
	const db = createStatsDatabase()
	const { env } = createEnv({ db, secret: SECRET })
	const actorId = await deriveAnonymousActor(VISITOR, SECRET)
	for (let index = 0; index < 3; index += 1) {
		await db
			.prepare(
				`INSERT INTO guestbook_messages (body, actor_id, created_at) VALUES (?1, ?2, datetime('now', '-30 seconds'))`,
			)
			.bind('seed', actorId)
			.run()
	}

	const response = await postGuestbook(env, GUESTBOOK_URL, { body: 'one too many' })
	assert.equal(response.status, 429)
	assert.equal(response.headers.get('retry-after'), '60')
	assert.equal(response.headers.get('cache-control'), 'no-store')
	assert.equal(await errorCode(response), 'rate_limited')
})

function unreachableDatabase(): D1Database {
	const fail = () => {
		throw new Error('database unavailable')
	}
	return { prepare: fail, batch: fail, exec: fail }
}

test('a submitted url is read from the site and stored as a pending signal', async () => {
	const restore = stubSiteFetch(SITE_HTML)
	try {
		const db = createStatsDatabase()
		const { env, linksLimiterKeys } = createEnv({ db, secret: SECRET, linksLimiter: 'allow' })
		const response = await postLinks(env, { url: 'example.com' })

		assert.equal(response.status, 201)
		assert.equal(response.headers.get('cache-control'), 'no-store')
		const payload = await json(response)
		assert.equal(payload.url, 'https://example.com/')
		assert.equal(payload.name, "Rui's Blog")
		assert.equal(payload.description, 'Code and indie making')
		assert.equal(payload.icon, 'https://example.com/icon.png')
		assert.equal(payload.domain, 'example.com')
		assert.match(String(payload.createdAt), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)

		const row = await db
			.prepare('SELECT url, status FROM link_submissions WHERE url = ?1')
			.bind('https://example.com/')
			.first<{ url: string, status: string }>()
		assert.deepEqual(row, { url: 'https://example.com/', status: 'pending' })

		assert.match(linksLimiterKeys[0] ?? '', /^[0-9a-f]{64}$/)
		assert.equal(linksLimiterKeys[0]?.includes(VISITOR), false)
	} finally {
		restore()
	}
})

test('an unreachable site answers 502 signal_lost', async () => {
	const restore = stubSiteFetch('gone', { status: 404 })
	try {
		const { env } = createEnv({ secret: SECRET, linksLimiter: 'allow' })
		const response = await postLinks(env, { url: 'https://example.com/' })

		assert.equal(response.status, 502)
		assert.equal(response.headers.get('cache-control'), 'no-store')
		assert.equal(await errorCode(response), 'signal_lost')
	} finally {
		restore()
	}
})

test('the wall is public and only submission methods are refused', async () => {
	const restore = stubSiteFetch(SITE_HTML)
	try {
		const { env } = createEnv({ secret: SECRET, linksLimiter: 'allow' })

		// Whatever people send in is visible to everybody, newest first, with no pseudonym in it.
		const empty = await worker.fetch(new Request(LINKS_URL, { headers: { 'cf-connecting-ip': VISITOR } }), env)
		assert.equal(empty.status, 200)
		assert.deepEqual(await json(empty), { submissions: [], total: 0 })

		await postLinks(env, { url: 'example.com' })
		await postLinks(env, { url: 'https://other.example.org/' }, { ip: OTHER_VISITOR })

		const wall = await worker.fetch(new Request(LINKS_URL, { headers: { 'cf-connecting-ip': VISITOR } }), env)
		assert.equal(wall.status, 200)
		assert.equal(wall.headers.get('cache-control'), 'no-store')
		const body = (await json(wall)) as unknown as { submissions: Record<string, unknown>[], total: number }
		assert.equal(body.total, 2)
		assert.deepEqual(Object.keys(body.submissions[0]).sort(), [
			'createdAt',
			'description',
			'domain',
			'icon',
			'name',
			'url',
		])
		assert.equal(JSON.stringify(body).includes('actor'), false)

		// The wall renders without STATS_ACTOR_SECRET; only writing needs it.
		const anonymous = createEnv({ linksLimiter: 'allow' })
		const readable = await worker.fetch(new Request(LINKS_URL, { headers: { 'cf-connecting-ip': VISITOR } }), anonymous.env)
		assert.equal(readable.status, 200)

		const wrongMethod = await worker.fetch(
			new Request(LINKS_URL, { method: 'DELETE', headers: { 'cf-connecting-ip': VISITOR } }),
			env,
		)
		assert.equal(wrongMethod.status, 405)
		assert.equal(wrongMethod.headers.get('allow'), 'GET, POST')
	} finally {
		restore()
	}
})

test('links submissions reject other content types and malformed bodies', async () => {
	const { env } = createEnv({ secret: SECRET, linksLimiter: 'allow' })

	const wrongType = await postLinks(env, 'url=example.com', { headers: { 'content-type': 'text/plain' } })
	assert.equal(wrongType.status, 415)
	assert.equal(await errorCode(wrongType), 'invalid_content_type')

	const privateHost = await postLinks(env, { url: 'http://127.0.0.1/' })
	assert.equal(privateHost.status, 400)
	assert.equal(await errorCode(privateHost), 'invalid_url')

	const unknownField = await postLinks(env, { url: 'https://example.com/', note: 'hi' })
	assert.equal(unknownField.status, 400)
	assert.equal(await errorCode(unknownField), 'invalid_body')

	const oversized = await postLinks(env, { url: `https://example.com/${'a'.repeat(2000)}` })
	assert.equal(oversized.status, 413)
	assert.equal(await errorCode(oversized), 'invalid_body')

	const notJson = await postLinks(env, '{not json')
	assert.equal(notJson.status, 400)
	assert.equal(await errorCode(notJson), 'invalid_body')
})

test('links submissions are gated by the actor secret and the visitor limiter', async () => {
	const withoutSecret = createEnv({ linksLimiter: 'allow' })
	const unavailable = await postLinks(withoutSecret.env, { url: 'https://example.com/' })
	assert.equal(unavailable.status, 503)
	assert.equal(unavailable.headers.get('cache-control'), 'no-store')
	assert.equal(await errorCode(unavailable), 'links_unavailable')

	const limited = createEnv({ secret: SECRET, linksLimiter: 'deny' })
	const response = await postLinks(limited.env, { url: 'https://example.com/' })
	assert.equal(response.status, 429)
	assert.equal(response.headers.get('retry-after'), '60')
	assert.equal(await errorCode(response), 'rate_limited')
})

test('the links wall is rate limited on reads and writes alike', async () => {
	const limited = createEnv({ secret: SECRET, linksLimiter: 'deny' })
	const write = await postLinks(limited.env, { url: 'https://example.com/' })
	assert.equal(write.status, 429)
	assert.equal(write.headers.get('retry-after'), '60')
	assert.equal(await errorCode(write), 'rate_limited')

	const read = await worker.fetch(
		new Request(LINKS_URL, { headers: { 'cf-connecting-ip': VISITOR } }),
		limited.env,
	)
	assert.equal(read.status, 429)
	assert.equal(await errorCode(read), 'rate_limited')
})

