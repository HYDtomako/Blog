import assert from 'node:assert/strict'
import test from 'node:test'
import type { D1Database, Env } from './env.ts'
import worker from './index.ts'
import { createStatsDatabase } from './test/d1-sqlite.ts'

const BASE = 'https://hydblog.xyz'
const ADMIN_PAGE = `${BASE}/admin`
const TOKEN = 'test-admin-token'
const OTHER_TOKEN = 'not-the-token'

function createEnv(options: { db?: D1Database, adminToken?: string | null } = {}): Env {
	const env: Env = {
		STATS_DB: options.db ?? createStatsDatabase(),
		ASSETS: {
			async fetch() {
				return new Response('asset', { status: 200 })
			},
		},
	}
	if (options.adminToken !== null) env.ADMIN_TOKEN = options.adminToken ?? TOKEN
	return env
}

function adminRequest(path: string, init: RequestInit = {}, token: string = TOKEN): Request {
	return new Request(BASE + path, {
		...init,
		headers: { authorization: `Bearer ${token}`, ...init.headers },
	})
}

const getAdmin = (env: Env, path: string, token = TOKEN) =>
	worker.fetch(adminRequest(path, {}, token), env)

const postAdmin = (env: Env, path: string, body: unknown, token = TOKEN) =>
	worker.fetch(
		adminRequest(path, {
			method: 'POST',
			body: JSON.stringify(body),
			headers: { 'content-type': 'application/json' },
		}, token),
		env,
	)

const json = async (response: Response) => (await response.json()) as Record<string, unknown>

async function seedPage(db: D1Database, path: string, views: number, likes: number) {
	await db.prepare('INSERT INTO page_stats (path, views, likes) VALUES (?1, ?2, ?3)').bind(path, views, likes).run()
}

async function seedMessage(db: D1Database, parentId: number | null, body: string): Promise<number> {
	const row = await db
		.prepare('INSERT INTO guestbook_messages (parent_id, body, actor_id) VALUES (?1, ?2, ?3) RETURNING id')
		.bind(parentId, body, 'actor-x')
		.first<{ id: number }>()
	return row?.id ?? 0
}

async function seedLike(db: D1Database, messageId: number, actor: string) {
	await db.prepare('INSERT INTO guestbook_likes (message_id, actor_id) VALUES (?1, ?2)').bind(messageId, actor).run()
}

async function seedLink(db: D1Database, url: string, status = 'pending'): Promise<number> {
	const row = await db
		.prepare(`INSERT INTO link_submissions (url, domain, name, description, icon, depth, status, actor_id)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) RETURNING id`)
		.bind(url, 'example.com', 'Example', 'A site', null, 0, status, 'actor-x')
		.first<{ id: number }>()
	return row?.id ?? 0
}

async function countRows(db: D1Database, table: string): Promise<number> {
	const row = await db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).first<{ total: number }>()
	return row?.total ?? 0
}

test('serves the admin console without a token and without caching', async () => {
	const env = createEnv()
	const response = await worker.fetch(new Request(ADMIN_PAGE), env)

	assert.equal(response.status, 200)
	assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8')
	assert.equal(response.headers.get('cache-control'), 'no-store')
	const html = await response.text()
	assert.match(html, /hydblog 后台/)
	assert.match(html, /\/api\/admin\/overview/)
	assert.match(html, /后台口令/)

	// The trailing slash reaches the same console.
	const slashed = await worker.fetch(new Request(`${ADMIN_PAGE}/`), env)
	assert.equal(slashed.status, 200)
})

test('every admin api route refuses a request without the token', async () => {
	const env = createEnv()
	for (const route of ['/api/admin/overview', '/api/admin/pages', '/api/admin/guestbook', '/api/admin/links']) {
		const missing = await worker.fetch(new Request(BASE + route), env)
		assert.equal(missing.status, 401, route)
		assert.equal(missing.headers.get('www-authenticate'), 'Bearer')

		const wrong = await worker.fetch(new Request(BASE + route, { headers: { authorization: `Bearer ${OTHER_TOKEN}` } }), env)
		assert.equal(wrong.status, 401, route)

		const bare = await worker.fetch(new Request(BASE + route, { headers: { authorization: TOKEN } }), env)
		assert.equal(bare.status, 401, route)
	}
})

test('admin stays locked when no token is configured at all', async () => {
	const unset = createEnv({ adminToken: null })
	assert.equal((await getAdmin(unset, '/api/admin/overview')).status, 401)
	const empty = createEnv({ adminToken: '' })
	assert.equal((await getAdmin(empty, '/api/admin/overview')).status, 401)
})

test('the overview aggregates stats and counts every table', async () => {
	const db = createStatsDatabase()
	await seedPage(db, '/a', 10, 2)
	await seedPage(db, '/b', 5, 0)
	await seedMessage(db, null, 'hello')
	await seedLink(db, 'https://one.example.com/', 'approved')
	await seedLink(db, 'https://two.example.com/', 'pending')

	const env = createEnv({ db })
	const response = await getAdmin(env, '/api/admin/overview')
	assert.equal(response.status, 200)
	assert.equal(response.headers.get('cache-control'), 'no-store')
	assert.deepEqual(await json(response), {
		views: 15,
		likes: 2,
		pages: 2,
		guestbook: 1,
		links: 2,
		pendingLinks: 1,
	})
})

test('the pages list is sorted by views', async () => {
	const db = createStatsDatabase()
	await seedPage(db, '/quiet', 1, 0)
	await seedPage(db, '/busy', 40, 3)

	const payload = (await json(await getAdmin(createEnv({ db }), '/api/admin/pages'))) as {
		pages: { path: string, views: number, likes: number }[]
	}
	assert.deepEqual(payload.pages.map((page) => page.path), ['/busy', '/quiet'])
	assert.equal(payload.pages[0].views, 40)
})

test('the guestbook list carries the like count for each message', async () => {
	const db = createStatsDatabase()
	const root = await seedMessage(db, null, 'first')
	const reply = await seedMessage(db, root, 'reply')
	await seedLike(db, root, 'visitor-a')
	await seedLike(db, root, 'visitor-b')
	await seedLike(db, reply, 'visitor-a')

	const payload = (await json(await getAdmin(createEnv({ db }), '/api/admin/guestbook'))) as {
		messages: { id: number, parent_id: number | null, body: string, likes: number }[]
	}
	assert.deepEqual(payload.messages.map((message) => message.body), ['reply', 'first'])
	assert.deepEqual(payload.messages.map((message) => message.likes), [1, 2])
	assert.equal(payload.messages[1].parent_id, null)
})

test('the links list shows the moderation status of every submission', async () => {
	const db = createStatsDatabase()
	await seedLink(db, 'https://approved.example.com/', 'approved')
	await seedLink(db, 'https://pending.example.com/', 'pending')

	const payload = (await json(await getAdmin(createEnv({ db }), '/api/admin/links'))) as {
		links: { url: string, status: string }[]
	}
	assert.deepEqual(payload.links.map((link) => [link.url, link.status]), [
		['https://pending.example.com/', 'pending'],
		['https://approved.example.com/', 'approved'],
	])
})

test('deleting a guestbook message takes its replies and every like with it', async () => {
	const db = createStatsDatabase()
	const root = await seedMessage(db, null, 'root')
	const reply = await seedMessage(db, root, 'reply')
	const untouched = await seedMessage(db, null, 'keep me')
	await seedLike(db, root, 'visitor-a')
	await seedLike(db, reply, 'visitor-b')
	await seedLike(db, untouched, 'visitor-c')

	const env = createEnv({ db })
	const response = await postAdmin(env, '/api/admin/guestbook/delete', { id: root })
	assert.equal(response.status, 200)
	assert.deepEqual(await json(response), { ok: true, id: root })

	assert.equal(await countRows(db, 'guestbook_messages'), 1)
	assert.equal(await countRows(db, 'guestbook_likes'), 1)
	const left = await db.prepare('SELECT body FROM guestbook_messages').first<{ body: string }>()
	assert.equal(left?.body, 'keep me')
})

test('a link status can be flipped between the allowed states only', async () => {
	const db = createStatsDatabase()
	const id = await seedLink(db, 'https://example.com/')

	const env = createEnv({ db })
	const approved = await postAdmin(env, '/api/admin/links/status', { id, status: 'approved' })
	assert.equal(approved.status, 200)
	assert.deepEqual(await json(approved), { ok: true, id, status: 'approved' })
	assert.equal((await db.prepare('SELECT status FROM link_submissions WHERE id = ?1').bind(id).first<{ status: string }>())?.status, 'approved')

	const rejected = await postAdmin(env, '/api/admin/links/status', { id, status: 'rejected' })
	assert.equal(rejected.status, 200)
	assert.equal((await db.prepare('SELECT status FROM link_submissions WHERE id = ?1').bind(id).first<{ status: string }>())?.status, 'rejected')

	const bogus = await postAdmin(env, '/api/admin/links/status', { id, status: 'published' })
	assert.equal(bogus.status, 400)

	const noId = await postAdmin(env, '/api/admin/links/status', { status: 'approved' })
	assert.equal(noId.status, 400)

	const badBody = await postAdmin(env, '/api/admin/links/status', ['nope'])
	assert.equal(badBody.status, 400)
})

test('a link submission can be deleted outright', async () => {
	const db = createStatsDatabase()
	const id = await seedLink(db, 'https://example.com/')
	const env = createEnv({ db })

	const response = await postAdmin(env, '/api/admin/links/delete', { id })
	assert.equal(response.status, 200)
	assert.deepEqual(await json(response), { ok: true, id })
	assert.equal(await countRows(db, 'link_submissions'), 0)

	const missing = await postAdmin(env, '/api/admin/links/delete', { id: 0 })
	assert.equal(missing.status, 400)
})

test('admin routes reject the wrong method and unknown paths', async () => {
	const env = createEnv()

	const wrongMethod = await postAdmin(env, '/api/admin/overview', {})
	assert.equal(wrongMethod.status, 405)
	assert.equal(wrongMethod.headers.get('allow'), 'GET')

	const unknown = await getAdmin(env, '/api/admin/does-not-exist')
	assert.equal(unknown.status, 404)
	assert.equal(await responseCode(unknown), 'not_found')
})

test('the admin console leaves every other path to the assets', async () => {
	const env = createEnv()
	const response = await worker.fetch(new Request(`${BASE}/about/`), env)
	assert.equal(response.status, 200)
	assert.equal(await response.text(), 'asset')
})

async function responseCode(response: Response): Promise<string> {
	const body = await json(response)
	return (body.error as { code: string }).code
}
