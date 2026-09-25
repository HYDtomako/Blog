import assert from 'node:assert/strict'
import test from 'node:test'
import type { D1Database, Env, RateLimiter } from './env.ts'
import worker from './index.ts'
import { createStatsDatabase } from './test/d1-sqlite.ts'

const PAGE_URL = 'https://example.com/api/stats/page'
const TOTAL_URL = 'https://example.com/api/stats/total'
const HEALTH_URL = 'https://example.com/api/stats/health'
const SECRET = 'test-actor-secret'
const VISITOR = '203.0.113.7'
const OTHER_VISITOR = '198.51.100.9'

type TestEnv = {
	env: Env
	assets: string[]
	limiterKeys: string[]
}

function createEnv(options: {
	db?: D1Database
	secret?: string
	limiter?: 'allow' | 'deny'
} = {}): TestEnv {
	const assets: string[] = []
	const limiterKeys: string[] = []
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
	return { env, assets, limiterKeys }
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
		const response = await worker.fetch(new Request(`https://example.com${path}`), env)
		assert.equal(response.status, 200)
		assert.equal(await response.text(), 'asset')
	}
	assert.deepEqual(assets, ['/', '/about/', '/2026/04/04/notes/', '/api/stats/unknown', '/api/stats'])
})

function unreachableDatabase(): D1Database {
	const fail = () => {
		throw new Error('database unavailable')
	}
	return { prepare: fail, batch: fail, exec: fail }
}
