import assert from 'node:assert/strict'
import test from 'node:test'
import {
	DEFAULT_PAGE_SIZE,
	MAX_MESSAGE_CODE_POINTS,
	MAX_PAGE_SIZE,
	GuestbookProblem,
	handleOf,
	likeBody,
	listBody,
	messageBody,
	parseCreateRequest,
	parseLikeRequest,
	parseListQuery,
	parseMessageBody,
	parseRemoveRequest,
	removeBody,
	replyBody,
	type GuestbookProblemCode,
	type GuestbookRow,
} from './guestbook-service.ts'

const ROW: GuestbookRow = {
	id: 12,
	body: 'hello',
	actor_id: 'a3f9c0ffee',
	created_at: '2026-09-26 04:12:03',
}

const query = (search: string) => parseListQuery(new URL(`https://hydblog.xyz/api/guestbook${search}`))

/** Asserts the code and status the routes turn into an error response. */
function rejects(
	run: () => unknown,
	code: GuestbookProblemCode,
	status = 400,
): void {
	assert.throws(run, (error: unknown) => {
		return error instanceof GuestbookProblem && error.code === code && error.status === status
	})
}

test('parseMessageBody trims the message and collapses runs of blank lines', () => {
	assert.equal(parseMessageBody('  hello  '), 'hello')
	assert.equal(parseMessageBody('line one\nline two'), 'line one\nline two')
	assert.equal(parseMessageBody('a\n\nb'), 'a\n\nb')
	assert.equal(parseMessageBody('a\n\n\nb'), 'a\n\nb')
	assert.equal(parseMessageBody('a\n\n\n\n\nb'), 'a\n\nb')
	assert.equal(parseMessageBody('\n\na\n\n\n\nb\n\n'), 'a\n\nb')
	assert.equal(parseMessageBody('tab\there'), 'tab\there')
})

test('parseMessageBody counts Unicode code points, not UTF-16 units', () => {
	const longest = '😀'.repeat(MAX_MESSAGE_CODE_POINTS)
	assert.equal(longest.length, MAX_MESSAGE_CODE_POINTS * 2)
	assert.equal(parseMessageBody(longest), longest)
	assert.equal(parseMessageBody('中'.repeat(MAX_MESSAGE_CODE_POINTS)).length, MAX_MESSAGE_CODE_POINTS)

	rejects(() => parseMessageBody(`${longest}😀`), 'message_too_long')
	rejects(() => parseMessageBody('中'.repeat(MAX_MESSAGE_CODE_POINTS + 1)), 'message_too_long')
})

test('parseMessageBody rejects non-strings, empty text, and control characters', () => {
	for (const value of [null, undefined, 7, true, {}, [], ['hello']]) {
		rejects(() => parseMessageBody(value), 'invalid_message')
	}
	for (const value of ['', '   ', '\n\n', '\t ', ' \n ']) {
		rejects(() => parseMessageBody(value), 'invalid_message')
	}
	for (const value of ['bell\u0007', 'null\u0000byte', 'escape\u001b[31m', 'carriage\rreturn', 'del\u007f']) {
		rejects(() => parseMessageBody(value), 'invalid_message')
	}
})

test('parseMessageBody allows two links and rejects a third', () => {
	assert.equal(parseMessageBody('see https://a.test'), 'see https://a.test')
	assert.equal(parseMessageBody('https://a.test and http://b.test'), 'https://a.test and http://b.test')
	assert.equal(parseMessageBody('a.test b.test c.test'), 'a.test b.test c.test')
	rejects(() => parseMessageBody('https://a.test http://b.test https://c.test'), 'invalid_message')
	rejects(() => parseMessageBody('https://a.test\nhttp://b.test\nhttps://c.test'), 'invalid_message')
})

test('parseCreateRequest treats a missing parentId as a top-level post', () => {
	assert.deepEqual(parseCreateRequest({ body: ' hello ' }), { body: 'hello', parentId: null })
	assert.deepEqual(parseCreateRequest({ body: 'hello', parentId: 12 }), { body: 'hello', parentId: 12 })
})

test('parseCreateRequest rejects unknown fields, missing bodies, and malformed parents', () => {
	for (const body of [null, undefined, 'hello', 12, [], ['hello']]) {
		rejects(() => parseCreateRequest(body), 'invalid_body')
	}
	rejects(() => parseCreateRequest({}), 'invalid_message')
	rejects(() => parseCreateRequest({ body: 'hello', extra: true }), 'invalid_body')
	rejects(() => parseCreateRequest({ body: 'hello', parent: 2 }), 'invalid_body')
	for (const parentId of [0, -1, 1.5, '2', null, Number.MAX_SAFE_INTEGER + 1, true]) {
		rejects(() => parseCreateRequest({ body: 'hello', parentId }), 'invalid_id')
	}
})

test('parseLikeRequest requires an id and a boolean liked flag', () => {
	assert.deepEqual(parseLikeRequest({ id: 3, liked: true }), { id: 3, liked: true })
	assert.deepEqual(parseLikeRequest({ id: 3, liked: false }), { id: 3, liked: false })
	for (const body of [null, 'like', 3, []]) {
		rejects(() => parseLikeRequest(body), 'invalid_body')
	}
	rejects(() => parseLikeRequest({ id: 3 }), 'invalid_body')
	rejects(() => parseLikeRequest({ id: 3, liked: 'yes' }), 'invalid_body')
	rejects(() => parseLikeRequest({ id: 3, liked: 1 }), 'invalid_body')
	rejects(() => parseLikeRequest({ id: 3, liked: true, extra: 1 }), 'invalid_body')
	rejects(() => parseLikeRequest({ id: 0, liked: true }), 'invalid_id')
	rejects(() => parseLikeRequest({ liked: true }), 'invalid_id')
	rejects(() => parseLikeRequest({ id: '3', liked: true }), 'invalid_id')
})

test('parseRemoveRequest only accepts a single positive id', () => {
	assert.deepEqual(parseRemoveRequest({ id: 9 }), { id: 9 })
	rejects(() => parseRemoveRequest('9'), 'invalid_body')
	rejects(() => parseRemoveRequest({}), 'invalid_id')
	rejects(() => parseRemoveRequest({ id: 9, liked: true }), 'invalid_body')
})

test('parseListQuery defaults and clamps the limit and reads the cursor', () => {
	assert.deepEqual(query(''), { limit: DEFAULT_PAGE_SIZE, before: null })
	assert.deepEqual(query('?limit=5'), { limit: 5, before: null })
	assert.deepEqual(query('?limit=5&before=12'), { limit: 5, before: 12 })
	assert.deepEqual(query('?limit=500'), { limit: MAX_PAGE_SIZE, before: null })
	assert.deepEqual(query('?limit=0'), { limit: 1, before: null })
	assert.deepEqual(query('?limit=-3'), { limit: 1, before: null })
	assert.deepEqual(query('?limit=2.5'), { limit: DEFAULT_PAGE_SIZE, before: null })
	assert.deepEqual(query('?limit=abc'), { limit: DEFAULT_PAGE_SIZE, before: null })
	assert.deepEqual(query('?limit='), { limit: DEFAULT_PAGE_SIZE, before: null })
	assert.deepEqual(query('?before=12'), { limit: DEFAULT_PAGE_SIZE, before: 12 })
	assert.deepEqual(query('?before='), { limit: DEFAULT_PAGE_SIZE, before: null })
	for (const before of ['0', '-1', '1.5', 'abc']) {
		rejects(() => query(`?before=${before}`), 'invalid_id')
	}
})

test('GuestbookProblem carries the code and status every route reports', () => {
	const cases: [GuestbookProblemCode, number][] = [
		['invalid_body', 400],
		['invalid_id', 400],
		['invalid_message', 400],
		['invalid_parent', 400],
		['message_too_long', 400],
		['message_not_found', 404],
		['not_author', 403],
		['rate_limited', 429],
	]
	for (const [code, status] of cases) {
		const problem = new GuestbookProblem(code, 'refused', status)
		assert.equal(problem.code, code)
		assert.equal(problem.status, status)
		assert.equal(problem.retryAfter, undefined)
		assert.ok(problem instanceof Error)
	}
	assert.equal(new GuestbookProblem('invalid_body', 'refused').status, 400)
	assert.equal(new GuestbookProblem('rate_limited', 'slow down', 429, 7).retryAfter, 7)
})

test('shaping builds the documented message, reply, list, like, and remove bodies', () => {
	const reply = replyBody(ROW, ROW.actor_id, { likes: 0, liked: false })
	assert.deepEqual(reply, {
		id: 12,
		body: 'hello',
		handle: 'a3f9',
		mine: true,
		createdAt: '2026-09-26 04:12:03',
		likes: 0,
		liked: false,
	})
	assert.deepEqual(Object.keys(reply), ['id', 'body', 'handle', 'mine', 'createdAt', 'likes', 'liked'])

	const message = messageBody(ROW, 'someone-else', {
		likes: 3,
		liked: true,
		replyCount: 1,
		replies: [reply],
	})
	assert.deepEqual(Object.keys(message), [
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
	assert.equal(message.mine, false)
	assert.equal(message.handle, 'a3f9')
	assert.equal(message.likes, 3)
	assert.equal(message.liked, true)
	assert.equal(message.replyCount, 1)
	assert.deepEqual(message.replies, [reply])

	assert.deepEqual(likeBody(12, 3, true), { id: 12, likes: 3, liked: true })
	assert.deepEqual(removeBody(12), { id: 12, removed: true })
	assert.deepEqual(listBody([message], 4, 9), { messages: [message], nextBefore: 4, total: 9 })
	assert.deepEqual(listBody([], null, 0), { messages: [], nextBefore: null, total: 0 })
})

test('shaping never carries the actor hash through', () => {
	const shaped = [
		replyBody(ROW, ROW.actor_id, { likes: 0, liked: false }),
		messageBody(ROW, ROW.actor_id, { likes: 0, liked: false, replyCount: 0, replies: [] }),
		likeBody(ROW.id, 0, false),
		removeBody(ROW.id),
		listBody([], null, 0),
	]
	for (const body of shaped) {
		assert.equal(JSON.stringify(body).includes('actor_id'), false)
		assert.equal(JSON.stringify(body).includes(ROW.actor_id), false)
	}
})

test('handleOf exposes only the leading characters of the actor hash', () => {
	assert.equal(handleOf(ROW.actor_id), 'a3f9')
	assert.equal(handleOf('ab'), 'ab')
	assert.equal(handleOf(''), '')
})
