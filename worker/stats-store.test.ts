import assert from 'node:assert/strict'
import test from 'node:test'
import type { D1Database, D1PreparedStatement } from './env.ts'
import { applyPageEvent, checkDatabase, readTotalStats } from './stats-store.ts'
import { createStatsDatabase } from './test/d1-sqlite.ts'

const view = (db: D1Database, path: string, actorId: string | null = null) =>
	applyPageEvent(db, path, { event: 'view', actorId })

const like = (db: D1Database, path: string, actorId: string) =>
	applyPageEvent(db, path, { event: 'like', actorId })

const unlike = (db: D1Database, path: string, actorId: string) =>
	applyPageEvent(db, path, { event: 'unlike', actorId })

const countRows = (db: D1Database, table: string) =>
	db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).first<{ total: number }>()

/** Emulates a runtime that runs write statements but never returns their RETURNING rows. */
const hideReturningRows = (db: D1Database): D1Database => ({
	prepare: (query: string) =>
		/RETURNING/i.test(query) ? withoutRows(db.prepare(query)) : db.prepare(query),
	batch: (statements) => db.batch(statements),
	exec: (query) => db.exec(query),
})

const withoutRows = (statement: D1PreparedStatement): D1PreparedStatement => ({
	bind: (...values: unknown[]) => withoutRows(statement.bind(...values)),
	run: () => statement.run(),
	async first() {
		await statement.run()
		return null
	},
	all: () => statement.all(),
})

test('the first view creates the row with views 1', async () => {
	const db = createStatsDatabase()
	assert.deepEqual(await view(db, '/2026/04/04/notes/'), {
		path: '/2026/04/04/notes/',
		views: 1,
		likes: 0,
		liked: false,
	})
	assert.equal((await countRows(db, 'page_stats'))?.total, 1)
})

test('repeated views of the same path accumulate', async () => {
	const db = createStatsDatabase()
	await view(db, '/notes')
	await view(db, '/notes')
	assert.deepEqual(await view(db, '/notes'), { path: '/notes', views: 3, likes: 0, liked: false })
	assert.equal((await countRows(db, 'page_stats'))?.total, 1)
})

test('views keep working when the runtime does not surface RETURNING rows', async () => {
	const db = hideReturningRows(createStatsDatabase())
	await view(db, '/notes')
	assert.deepEqual(await view(db, '/notes'), { path: '/notes', views: 2, likes: 0, liked: false })
})

test('view reports whether the current actor has already liked the page', async () => {
	const db = createStatsDatabase()
	await view(db, '/notes', 'actor-a')
	await like(db, '/notes', 'actor-a')
	assert.deepEqual(await view(db, '/notes', 'actor-a'), { path: '/notes', views: 2, likes: 1, liked: true })
	assert.deepEqual(await view(db, '/notes', 'actor-b'), { path: '/notes', views: 3, likes: 1, liked: false })
})

test('liking twice from the same actor stays idempotent', async () => {
	const db = createStatsDatabase()
	assert.deepEqual(await like(db, '/notes', 'actor-a'), { path: '/notes', views: 0, likes: 1, liked: true })
	assert.deepEqual(await like(db, '/notes', 'actor-a'), { path: '/notes', views: 0, likes: 1, liked: true })
	assert.equal((await countRows(db, 'page_likes'))?.total, 1)
	assert.equal((await readTotalStats(db)).likes, 1)
})

test('likes from different actors count separately', async () => {
	const db = createStatsDatabase()
	await like(db, '/notes', 'actor-a')
	await like(db, '/notes', 'actor-b')
	const stats = await like(db, '/notes', 'actor-c')
	assert.equal(stats.likes, 3)
	assert.equal(stats.liked, true)
	assert.equal((await countRows(db, 'page_likes'))?.total, 3)
})

test('a first like on an unseen path creates the page row', async () => {
	const db = createStatsDatabase()
	assert.deepEqual(await like(db, '/fresh', 'actor-a'), { path: '/fresh', views: 0, likes: 1, liked: true })
	await view(db, '/fresh', 'actor-a')
	assert.deepEqual(await like(db, '/fresh', 'actor-a'), { path: '/fresh', views: 1, likes: 1, liked: true })
})

test('unlike steps the counter back and never goes past zero', async () => {
	const db = createStatsDatabase()
	await like(db, '/notes', 'actor-a')
	await like(db, '/notes', 'actor-b')
	assert.deepEqual(await unlike(db, '/notes', 'actor-a'), { path: '/notes', views: 0, likes: 1, liked: false })
	await db.exec("UPDATE page_stats SET likes = 0 WHERE path = '/notes'")
	assert.deepEqual(await unlike(db, '/notes', 'actor-b'), { path: '/notes', views: 0, likes: 0, liked: false })
	assert.equal((await readTotalStats(db)).likes, 0)
})

test('unliking a page that was never liked is a no-op', async () => {
	const db = createStatsDatabase()
	await view(db, '/notes')
	assert.deepEqual(await unlike(db, '/notes', 'actor-a'), { path: '/notes', views: 1, likes: 0, liked: false })
	assert.deepEqual(await unlike(db, '/notes', 'actor-a'), { path: '/notes', views: 1, likes: 0, liked: false })
	assert.deepEqual(await unlike(db, '/never-seen', 'actor-a'), {
		path: '/never-seen',
		views: 0,
		likes: 0,
		liked: false,
	})
	assert.equal((await countRows(db, 'page_likes'))?.total, 0)
})

test('an actor can like again after unliking', async () => {
	const db = createStatsDatabase()
	await like(db, '/notes', 'actor-a')
	await unlike(db, '/notes', 'actor-a')
	assert.deepEqual(await like(db, '/notes', 'actor-a'), { path: '/notes', views: 0, likes: 1, liked: true })
})

test('total aggregates views, likes, and page count', async () => {
	const db = createStatsDatabase()
	assert.deepEqual(await readTotalStats(db), { views: 0, likes: 0, pages: 0 })
	await view(db, '/a')
	await view(db, '/a')
	await view(db, '/b')
	await like(db, '/a', 'actor-a')
	await like(db, '/b', 'actor-a')
	await like(db, '/b', 'actor-b')
	assert.deepEqual(await readTotalStats(db), { views: 3, likes: 3, pages: 2 })
})

test('checkDatabase reports a reachable database', async () => {
	assert.equal(await checkDatabase(createStatsDatabase()), true)
})
