import assert from 'node:assert/strict'
import test from 'node:test'
import type { D1Database } from './env.ts'
import { GuestbookProblem, MIN_SECONDS_BETWEEN_POSTS } from './guestbook-service.ts'
import { createMessage, readThread, removeMessage, toggleMessageLike } from './guestbook-store.ts'
import { createStatsDatabase } from './test/d1-sqlite.ts'

const AUTHOR = 'actor-a'
const OTHER = 'actor-b'
const FIRST_PAGE = { limit: 20, before: null }

/** Ages every message, so seeding a fixture does not trip the write rate limits. */
async function ageMessages(db: D1Database): Promise<void> {
	await db.exec("UPDATE guestbook_messages SET created_at = datetime('now', '-7 days')")
}

/** Posts outside every rate-limit window, keeping fixture setup independent of the policy. */
async function post(
	db: D1Database,
	actorId: string,
	body: string,
	parentId: number | null = null,
) {
	const created = await createMessage(db, actorId, body, parentId)
	await ageMessages(db)
	return created
}

/** Seeds posts of an explicit age so one rate-limit rule can be aimed at. */
async function seed(
	db: D1Database,
	actorId: string,
	count: number,
	ageSeconds: number,
): Promise<void> {
	for (let index = 0; index < count; index += 1) {
		await db
			.prepare(
				`INSERT INTO guestbook_messages (body, actor_id, created_at) VALUES (?1, ?2, datetime('now', ?3))`,
			)
			.bind(`seed ${index}`, actorId, `-${ageSeconds} seconds`)
			.run()
	}
}

async function countRows(db: D1Database, table: string): Promise<number> {
	const row = await db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).first<{ total: number }>()
	return row?.total ?? 0
}

function isProblem(code: string, status: number) {
	return (error: unknown) => error instanceof GuestbookProblem && error.code === code && error.status === status
}

async function problemOf(run: () => Promise<unknown>): Promise<GuestbookProblem> {
	try {
		await run()
	} catch (error) {
		assert.ok(error instanceof GuestbookProblem, `expected a GuestbookProblem, got ${String(error)}`)
		return error
	}
	throw new Error('expected the write to be refused')
}

test('a thread reports its reply without the reply becoming a thread', async () => {
	const db = createStatsDatabase()
	const thread = await post(db, AUTHOR, 'hello')
	const reply = await post(db, OTHER, 'nice one', thread.id)

	assert.match(thread.createdAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
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
	assert.deepEqual(Object.keys(reply), ['id', 'body', 'handle', 'mine', 'createdAt', 'likes', 'liked'])
	assert.equal(thread.mine, true)
	assert.equal(reply.mine, true)
	// Only a top-level create reports the thread it starts.
	if (!('replyCount' in thread)) assert.fail('a top-level post must report a thread')
	assert.equal(thread.replyCount, 0)
	assert.deepEqual(thread.replies, [])

	const page = await readThread(db, AUTHOR, FIRST_PAGE)
	assert.equal(page.total, 1)
	assert.equal(page.nextBefore, null)
	assert.equal(page.messages.length, 1)
	assert.equal(page.messages[0].id, thread.id)
	assert.equal(page.messages[0].replyCount, 1)
	assert.deepEqual(page.messages[0].replies.map((entry) => entry.id), [reply.id])
	assert.equal(page.messages[0].replies[0].body, 'nice one')
	assert.equal(page.messages[0].replies[0].mine, false)
	assert.equal(JSON.stringify(page).includes('actor_id'), false)
})

test('the thread cursor pages through 3 pages with no gaps or repeats', async () => {
	const db = createStatsDatabase()
	for (const body of ['one', 'two', 'three', 'four', 'five']) await post(db, AUTHOR, body)

	const first = await readThread(db, AUTHOR, { limit: 2, before: null })
	const second = await readThread(db, AUTHOR, { limit: 2, before: first.nextBefore })
	const third = await readThread(db, AUTHOR, { limit: 2, before: second.nextBefore })

	assert.deepEqual(first.messages.map((message) => message.body), ['five', 'four'])
	assert.deepEqual(second.messages.map((message) => message.body), ['three', 'two'])
	assert.deepEqual(third.messages.map((message) => message.body), ['one'])
	assert.equal(first.nextBefore, first.messages[1].id)
	assert.equal(second.nextBefore, second.messages[1].id)
	assert.equal(third.nextBefore, null)

	const seen = [...first.messages, ...second.messages, ...third.messages].map((message) => message.id)
	assert.equal(new Set(seen).size, 5)
	assert.deepEqual(seen, [1, 2, 3, 4, 5].map((id) => 6 - id))
	for (const page of [first, second, third]) assert.equal(page.total, 5)
})

test('a thread keeps its newest 20 replies and still counts them all', async () => {
	const db = createStatsDatabase()
	const thread = await post(db, AUTHOR, 'thread')
	const replies = []
	for (let index = 1; index <= 25; index += 1) {
		replies.push(await post(db, OTHER, `reply ${index}`, thread.id))
	}

	const page = await readThread(db, AUTHOR, FIRST_PAGE)
	const threadView = page.messages[0]
	assert.equal(page.total, 1)
	assert.equal(threadView.replyCount, 25)
	assert.equal(threadView.replies.length, 20)
	assert.deepEqual(threadView.replies.map((reply) => reply.id), replies.slice(5).map((reply) => reply.id))
	assert.deepEqual(
		threadView.replies.map((reply) => reply.body),
		Array.from({ length: 20 }, (_, index) => `reply ${index + 6}`),
	)
})

test('likes are idempotent per actor and restore on unlike', async () => {
	const db = createStatsDatabase()
	const thread = await post(db, AUTHOR, 'thread')

	const liked = { id: thread.id, likes: 1, liked: true }
	assert.deepEqual(await toggleMessageLike(db, AUTHOR, thread.id, true), liked)
	assert.deepEqual(await toggleMessageLike(db, AUTHOR, thread.id, true), liked)
	assert.deepEqual(await toggleMessageLike(db, OTHER, thread.id, true), {
		id: thread.id,
		likes: 2,
		liked: true,
	})
	assert.deepEqual(await toggleMessageLike(db, AUTHOR, thread.id, false), {
		id: thread.id,
		likes: 1,
		liked: false,
	})
	assert.deepEqual(await toggleMessageLike(db, AUTHOR, thread.id, false), {
		id: thread.id,
		likes: 1,
		liked: false,
	})
	assert.equal(await countRows(db, 'guestbook_likes'), 1)
})

test('liking an unknown message reports message_not_found', async () => {
	const db = createStatsDatabase()
	await assert.rejects(() => toggleMessageLike(db, AUTHOR, 404, true), isProblem('message_not_found', 404))
	assert.equal(await countRows(db, 'guestbook_likes'), 0)
})

test('reads report mine and liked per actor, and nothing for a brand-new actor', async () => {
	const db = createStatsDatabase()
	const thread = await post(db, AUTHOR, 'thread')
	const reply = await post(db, OTHER, 'reply', thread.id)
	await toggleMessageLike(db, AUTHOR, reply.id, true)
	await toggleMessageLike(db, OTHER, thread.id, true)

	const mine = await readThread(db, AUTHOR, FIRST_PAGE)
	assert.equal(mine.messages[0].mine, true)
	assert.equal(mine.messages[0].likes, 1)
	assert.equal(mine.messages[0].liked, false)
	assert.equal(mine.messages[0].replies[0].mine, false)
	assert.equal(mine.messages[0].replies[0].likes, 1)
	assert.equal(mine.messages[0].replies[0].liked, true)

	const other = await readThread(db, OTHER, FIRST_PAGE)
	assert.equal(other.messages[0].mine, false)
	assert.equal(other.messages[0].liked, true)
	assert.equal(other.messages[0].replies[0].mine, true)
	assert.equal(other.messages[0].replies[0].liked, false)

	const stranger = await readThread(db, 'actor-new', FIRST_PAGE)
	assert.equal(stranger.messages[0].mine, false)
	assert.equal(stranger.messages[0].liked, false)
	assert.equal(stranger.messages[0].likes, 1)
	assert.equal(stranger.messages[0].replies[0].liked, false)
	assert.equal(stranger.messages[0].replies[0].likes, 1)
})

test('removing a top-level message removes its replies and their likes', async () => {
	const db = createStatsDatabase()
	// One post per actor keeps both inside the retract window, since retraction is the point.
	const thread = await createMessage(db, AUTHOR, 'thread', null)
	const reply = await createMessage(db, OTHER, 'reply', thread.id)
	await toggleMessageLike(db, AUTHOR, reply.id, true)
	await toggleMessageLike(db, OTHER, thread.id, true)

	assert.deepEqual(await removeMessage(db, AUTHOR, thread.id), { id: thread.id, removed: true })
	assert.equal(await countRows(db, 'guestbook_messages'), 0)
	assert.equal(await countRows(db, 'guestbook_likes'), 0)
	assert.deepEqual(await readThread(db, AUTHOR, FIRST_PAGE), {
		messages: [],
		nextBefore: null,
		total: 0,
	})
})

test('removing a reply leaves its thread in place', async () => {
	const db = createStatsDatabase()
	const thread = await createMessage(db, AUTHOR, 'thread', null)
	const reply = await createMessage(db, OTHER, 'reply', thread.id)
	await toggleMessageLike(db, AUTHOR, reply.id, true)

	assert.deepEqual(await removeMessage(db, OTHER, reply.id), { id: reply.id, removed: true })
	assert.equal(await countRows(db, 'guestbook_likes'), 0)
	const page = await readThread(db, AUTHOR, FIRST_PAGE)
	assert.equal(page.total, 1)
	assert.equal(page.messages[0].replyCount, 0)
	assert.deepEqual(page.messages[0].replies, [])
})

test('only the author may remove a message, and only while it is fresh', async () => {
	const db = createStatsDatabase()
	const thread = await createMessage(db, AUTHOR, 'thread', null)

	await assert.rejects(() => removeMessage(db, OTHER, thread.id), isProblem('not_author', 403))
	await ageMessages(db)
	// The retract window closed with the fixture's age, which reads as not_author too.
	await assert.rejects(() => removeMessage(db, AUTHOR, thread.id), isProblem('not_author', 403))
	await assert.rejects(() => removeMessage(db, AUTHOR, 404), isProblem('message_not_found', 404))
	assert.equal(await countRows(db, 'guestbook_messages'), 1)
})

test('a reply needs an existing top-level parent', async () => {
	const db = createStatsDatabase()
	const thread = await post(db, AUTHOR, 'thread')
	const reply = await post(db, OTHER, 'reply', thread.id)

	await assert.rejects(() => createMessage(db, AUTHOR, 'nested', reply.id), isProblem('invalid_parent', 400))
	await assert.rejects(() => createMessage(db, AUTHOR, 'orphan', 404), isProblem('invalid_parent', 400))
	assert.equal(await countRows(db, 'guestbook_messages'), 2)
})

test('a post inside the quiet window is refused with the seconds still to wait', async () => {
	const db = createStatsDatabase()
	await seed(db, AUTHOR, 1, 3)

	const problem = await problemOf(() => createMessage(db, AUTHOR, 'too soon', null))
	assert.equal(problem.code, 'rate_limited')
	assert.equal(problem.status, 429)
	assert.ok((problem.retryAfter ?? 0) >= 1 && (problem.retryAfter ?? 0) <= MIN_SECONDS_BETWEEN_POSTS)
	assert.equal(await countRows(db, 'guestbook_messages'), 1)
})

test('a post after the quiet window is accepted', async () => {
	const db = createStatsDatabase()
	await seed(db, AUTHOR, 1, MIN_SECONDS_BETWEEN_POSTS + 5)

	assert.equal((await createMessage(db, AUTHOR, 'later', null)).body, 'later')
})

test('more than three posts in a minute are refused with retry-after 60', async () => {
	const db = createStatsDatabase()
	await seed(db, AUTHOR, 3, 30)

	const problem = await problemOf(() => createMessage(db, AUTHOR, 'fourth', null))
	assert.equal(problem.code, 'rate_limited')
	assert.equal(problem.status, 429)
	assert.equal(problem.retryAfter, 60)

	const allowed = createStatsDatabase()
	await seed(allowed, AUTHOR, 2, 30)
	assert.equal((await createMessage(allowed, AUTHOR, 'third', null)).body, 'third')
})

test('more than thirty posts in a day are refused with retry-after 3600', async () => {
	const db = createStatsDatabase()
	await seed(db, AUTHOR, 30, 3600)

	const problem = await problemOf(() => createMessage(db, AUTHOR, 'tomorrow', null))
	assert.equal(problem.code, 'rate_limited')
	assert.equal(problem.status, 429)
	assert.equal(problem.retryAfter, 3600)

	const allowed = createStatsDatabase()
	await seed(allowed, AUTHOR, 29, 3600)
	assert.equal((await createMessage(allowed, AUTHOR, 'last one', null)).body, 'last one')
})

test('the write policy is keyed by actor', async () => {
	const db = createStatsDatabase()
	await seed(db, AUTHOR, 3, 30)

	await assert.rejects(() => createMessage(db, AUTHOR, 'blocked', null), isProblem('rate_limited', 429))
	assert.equal((await createMessage(db, OTHER, 'welcome', null)).body, 'welcome')
	assert.equal(await countRows(db, 'guestbook_messages'), 4)
})
