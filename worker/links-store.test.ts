import assert from 'node:assert/strict'
import test from 'node:test'
import type { D1Database } from './env.ts'
import { LinksProblem, MAX_SUBMISSIONS_PER_DAY, WALL_SIZE } from './links-service.ts'
import { countSubmissionsSince, createSubmission, readWall } from './links-store.ts'
import { createStatsDatabase } from './test/d1-sqlite.ts'

const ACTOR = 'actor-a'
const OTHER_ACTOR = 'actor-b'
const URL_A = 'https://example.com/'

async function countRows(db: D1Database, table: string): Promise<number> {
	const row = await db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).first<{ total: number }>()
	return row?.total ?? 0
}

function submission(db: D1Database, url: string, actor = ACTOR, title = 'Example') {
	return createSubmission(db, actor, url, { title, description: 'A site', icon: 'https://example.com/icon.png' })
}

function approve(db: D1Database, url: string) {
	return db.prepare(`UPDATE link_submissions SET status = 'approved' WHERE url = ?1`).bind(url).run()
}

test('a submission is stored as a pending signal with its parsed card', async () => {
	const db = createStatsDatabase()
	const body = await submission(db, URL_A)

	assert.equal(body.url, URL_A)
	assert.equal(body.name, 'Example')
	assert.equal(body.description, 'A site')
	assert.equal(body.icon, 'https://example.com/icon.png')
	assert.equal(body.domain, 'example.com')
	assert.match(body.createdAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)

	const row = await db
		.prepare('SELECT url, domain, name, description, icon, status, actor_id FROM link_submissions')
		.first<Record<string, unknown>>()
	assert.deepEqual(row, {
		url: URL_A,
		domain: 'example.com',
		name: 'Example',
		description: 'A site',
		icon: 'https://example.com/icon.png',
		status: 'pending',
		actor_id: ACTOR,
	})
})

test('the wall shows the newest approved submissions to everybody', async () => {
	const db = createStatsDatabase()
	await submission(db, 'https://one.example.com/', ACTOR, 'One')
	await submission(db, 'https://two.example.com/', OTHER_ACTOR, 'Two')
	await approve(db, 'https://one.example.com/')
	await approve(db, 'https://two.example.com/')

	const wall = await readWall(db)
	assert.equal(wall.total, 2)
	assert.deepEqual(wall.submissions.map((item) => item.name), ['Two', 'One'])
	// The wall is public: no pseudonym, no depth, nothing but what a visitor may see.
	assert.deepEqual(Object.keys(wall.submissions[0]).sort(), [
		'createdAt',
		'description',
		'domain',
		'icon',
		'name',
		'url',
	])

	for (let index = 0; index < WALL_SIZE + 5; index += 1) {
		// A fresh actor per row keeps the daily cap out of the way of the flood.
		const url = `https://flood-${index}.example.com/`
		await submission(db, url, `actor-${index}`, `Flood ${index}`)
		await approve(db, url)
	}
	const capped = await readWall(db)
	assert.equal(capped.submissions.length, WALL_SIZE)
	assert.equal(capped.total, WALL_SIZE + 7)
})

test('submissions stay off the wall until they are approved', async () => {
	const db = createStatsDatabase()
	await submission(db, 'https://pending.example.com/', ACTOR, 'Pending')

	const before = await readWall(db)
	assert.equal(before.total, 0)
	assert.deepEqual(before.submissions, [])

	await approve(db, 'https://pending.example.com/')
	const after = await readWall(db)
	assert.equal(after.total, 1)
	assert.deepEqual(after.submissions.map((item) => item.name), ['Pending'])
})

test('resubmitting the same address refreshes it instead of duplicating', async () => {
	const db = createStatsDatabase()
	await submission(db, URL_A)
	await submission(db, URL_A, ACTOR, 'Renamed')

	assert.equal(await countRows(db, 'link_submissions'), 1)
	const row = await db.prepare('SELECT name FROM link_submissions').first<{ name: string }>()
	assert.equal(row?.name, 'Renamed')
	// A different visitor submitting the same site keeps their own row.
	await submission(db, URL_A, OTHER_ACTOR)
	assert.equal(await countRows(db, 'link_submissions'), 2)
})

test('the daily cap stops a slow drip of submissions', async () => {
	const db = createStatsDatabase()
	for (let index = 0; index < MAX_SUBMISSIONS_PER_DAY; index += 1) {
		await submission(db, `https://example.com/site-${index}`)
	}
	assert.equal(await countSubmissionsSince(db, ACTOR), MAX_SUBMISSIONS_PER_DAY)

	await assert.rejects(
		() => submission(db, 'https://example.com/one-too-many'),
		(error: unknown) => error instanceof LinksProblem
			&& error.code === 'rate_limited'
			&& error.status === 429
			&& error.retryAfter === 3600,
	)
	assert.equal(await countRows(db, 'link_submissions'), MAX_SUBMISSIONS_PER_DAY)

	// Another visitor is unaffected, and a window that starts in the future counts nothing.
	await submission(db, 'https://example.com/fresh', OTHER_ACTOR)
	assert.equal(await countSubmissionsSince(db, OTHER_ACTOR), 1)
	assert.equal(await countSubmissionsSince(db, ACTOR, '+1 day'), 0)
	assert.equal(await countSubmissionsSince(db, ACTOR), MAX_SUBMISSIONS_PER_DAY)
})

test('a row stored without metadata still answers with a domain name', async () => {
	const db = createStatsDatabase()
	const body = await createSubmission(db, ACTOR, 'https://bare.example.org/page', {})

	assert.equal(body.name, 'bare.example.org')
	assert.equal(body.domain, 'bare.example.org')
	assert.equal(body.description, undefined)
	assert.equal(body.icon, undefined)

	await db.prepare(`UPDATE link_submissions SET status = 'approved'`).run()
	const wall = await readWall(db)
	assert.equal(wall.submissions[0].url, 'https://bare.example.org/page')
})
