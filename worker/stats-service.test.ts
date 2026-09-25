import assert from 'node:assert/strict'
import test from 'node:test'
import {
	MAX_BODY_BYTES,
	StatsProblem,
	exceedsBodyLimit,
	isJsonContentType,
	normalizePagePath,
	pageStatsBody,
	parsePageRequest,
	parseStatsEvent,
	totalStatsBody,
} from './stats-service.ts'

const rejectsPath = (value: unknown) =>
	assert.throws(
		() => normalizePagePath(value),
		(error: unknown) => error instanceof StatsProblem && error.code === 'invalid_path',
	)

test('normalizePagePath drops the trailing slash and keeps the root path', () => {
	assert.equal(normalizePagePath('/2026/04/04/transformer-learning-notes/'), '/2026/04/04/transformer-learning-notes')
	assert.equal(normalizePagePath('/about'), '/about')
	assert.equal(normalizePagePath('/'), '/')
	assert.equal(normalizePagePath('/en/notes/'), '/en/notes')
	assert.equal(normalizePagePath('/a/b/'), '/a/b')
})

test('normalizePagePath accepts unreserved, percent-encoded, and dotted segments', () => {
	assert.equal(normalizePagePath('/a-b_c.d~e/'), '/a-b_c.d~e')
	assert.equal(normalizePagePath('/2026/04/04/notes%20one/'), '/2026/04/04/notes%20one')
	assert.equal(normalizePagePath('/a/.hidden/'), '/a/.hidden')
})

test('normalizePagePath rejects relative, absolute-URL, traversal, and oversized paths', () => {
	rejectsPath('../x')
	rejectsPath('..')
	rejectsPath('http://example.com/notes/')
	rejectsPath('https://example.com/notes/')
	rejectsPath('notes/2026/')
	rejectsPath('/notes/../about/')
	rejectsPath('//notes//about')
	rejectsPath('/notes//about')
	rejectsPath(`/${'a'.repeat(200)}`)
	rejectsPath('/notes?page=2')
	rejectsPath('/notes#top')
	rejectsPath('/笔记/')
	rejectsPath('')
	rejectsPath(null)
	rejectsPath(42)
})

test('normalizePagePath measures the length limit in path characters', () => {
	const longest = `/${'a'.repeat(199)}`
	assert.equal(longest.length, 200)
	assert.equal(normalizePagePath(longest), longest)
	rejectsPath(`${longest}/`)
	rejectsPath(`/${'a'.repeat(200)}/`)
})

test('parseStatsEvent only accepts the three supported events', () => {
	assert.equal(parseStatsEvent('view'), 'view')
	assert.equal(parseStatsEvent('like'), 'like')
	assert.equal(parseStatsEvent('unlike'), 'unlike')
	for (const value of ['VIEW', 'likes', '', undefined, null, 1, {}]) {
		assert.throws(
			() => parseStatsEvent(value),
			(error: unknown) => error instanceof StatsProblem && error.code === 'invalid_event',
		)
	}
})

test('parsePageRequest requires an object body and validates both fields', () => {
	assert.deepEqual(parsePageRequest({ path: '/notes/', event: 'view' }), { path: '/notes', event: 'view' })
	assert.deepEqual(parsePageRequest({ path: '/notes/', event: 'like', extra: true }), {
		path: '/notes',
		event: 'like',
	})
	for (const body of [null, 'view', 7, ['/notes'], []]) {
		assert.throws(
			() => parsePageRequest(body),
			(error: unknown) => error instanceof StatsProblem && error.code === 'invalid_body',
		)
	}
	assert.throws(
		() => parsePageRequest({ path: '../x', event: 'view' }),
		(error: unknown) => error instanceof StatsProblem && error.code === 'invalid_path',
	)
	assert.throws(
		() => parsePageRequest({ path: '/notes', event: 'clap' }),
		(error: unknown) => error instanceof StatsProblem && error.code === 'invalid_event',
	)
})

test('StatsProblem carries the HTTP status for oversized bodies', () => {
	const problem = new StatsProblem('invalid_body', 'too large', 413)
	assert.equal(problem.status, 413)
	assert.equal(problem.code, 'invalid_body')
	assert.ok(problem instanceof Error)
})

test('isJsonContentType accepts parameters and rejects simple-content-type posts', () => {
	assert.equal(isJsonContentType('application/json'), true)
	assert.equal(isJsonContentType('application/json; charset=utf-8'), true)
	assert.equal(isJsonContentType('Application/JSON'), true)
	assert.equal(isJsonContentType(null), false)
	assert.equal(isJsonContentType(''), false)
	assert.equal(isJsonContentType('text/plain'), false)
	assert.equal(isJsonContentType('application/x-www-form-urlencoded'), false)
	assert.equal(isJsonContentType('multipart/form-data; boundary=x'), false)
	assert.equal(isJsonContentType('application/jsonp'), false)
})

test('exceedsBodyLimit measures UTF-8 bytes at the 2KB boundary', () => {
	assert.equal(exceedsBodyLimit('a'.repeat(MAX_BODY_BYTES)), false)
	assert.equal(exceedsBodyLimit('a'.repeat(MAX_BODY_BYTES + 1)), true)
	assert.equal(exceedsBodyLimit('中'.repeat(683)), true)
	assert.equal(exceedsBodyLimit('中'.repeat(682)), false)
})

test('response shaping never leaks extra fields and defaults a missing row to zeros', () => {
	assert.deepEqual(pageStatsBody('/notes', { views: 12, likes: 3 }, true), {
		path: '/notes',
		views: 12,
		likes: 3,
		liked: true,
	})
	assert.deepEqual(Object.keys(pageStatsBody('/notes', null, false)), ['path', 'views', 'likes', 'liked'])
	assert.deepEqual(pageStatsBody('/notes', null, false), { path: '/notes', views: 0, likes: 0, liked: false })
	assert.deepEqual(totalStatsBody({ views: 1234, likes: 56, pages: 7 }), { views: 1234, likes: 56, pages: 7 })
	assert.deepEqual(totalStatsBody({ views: null, likes: null, pages: 0 }), { views: 0, likes: 0, pages: 0 })
	assert.deepEqual(totalStatsBody(null), { views: 0, likes: 0, pages: 0 })
})
