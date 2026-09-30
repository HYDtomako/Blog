import type { D1Database } from './env.ts'
import {
	DAILY_RETRY_AFTER,
	LinksProblem,
	MAX_SUBMISSIONS_PER_DAY,
	WALL_SIZE,
	submissionBody,
	wallBody,
	type LinksSubmission,
	type LinksWallBody,
} from './links-service.ts'
import type { LinkMetadata } from '../shared/link-metadata.ts'
import { signalDepth } from '../shared/link-metadata.ts'

export type SubmissionRow = {
	url: string
	domain: string
	name: string
	description: string | null
	icon: string | null
	created_at: string
}

type CountRow = { total: number }

/** Resubmitting the same address refreshes it instead of piling up duplicates. */
const SUBMISSION_UPSERT = `INSERT INTO link_submissions (url, domain, name, description, icon, depth, actor_id)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
ON CONFLICT (actor_id, url) DO UPDATE SET
	name = ?3, description = ?4, icon = ?5, depth = ?6, created_at = datetime('now')`
const SUBMISSION_SELECT = `SELECT url, domain, name, description, icon, created_at FROM link_submissions
WHERE actor_id = ?1 AND url = ?2`
const WALL_SELECT = `SELECT url, domain, name, description, icon, created_at FROM link_submissions
WHERE status = 'approved'
ORDER BY created_at DESC, id DESC LIMIT ?1`
const WALL_TOTAL_SELECT = "SELECT COUNT(*) AS total FROM link_submissions WHERE status = 'approved'"
const RECENT_COUNT_SELECT = `SELECT COUNT(*) AS total FROM link_submissions
WHERE actor_id = ?1 AND created_at > datetime('now', ?2)`
const DAY_WINDOW = '-1 day'

/** Stores one link from the wall. The actor hash is never read back out of the database. */
export async function createSubmission(
	db: D1Database,
	actorId: string,
	url: string,
	metadata: LinkMetadata,
): Promise<LinksSubmission> {
	await enforceDailyLimit(db, actorId)
	const body = submissionBody(url, metadata)
	await db
		.prepare(SUBMISSION_UPSERT)
		.bind(
			body.url,
			body.domain,
			body.name,
			body.description ?? null,
			body.icon ?? null,
			signalDepth(body.url),
			actorId,
		)
		.run()

	// RETURNING is not surfaced by every D1 runtime, so the row is read back explicitly.
	const row = await db.prepare(SUBMISSION_SELECT).bind(actorId, body.url).first<SubmissionRow>()
	return row === null ? { ...body, createdAt: new Date().toISOString().slice(0, 19).replace('T', ' ') } : rowBody(row)
}

/** The public wall: the newest approved submissions, exactly as everybody sees them. */
export async function readWall(db: D1Database): Promise<LinksWallBody> {
	const [rows, total] = await Promise.all([
		db.prepare(WALL_SELECT).bind(WALL_SIZE).all<SubmissionRow>(),
		db.prepare(WALL_TOTAL_SELECT).first<CountRow>(),
	])
	return wallBody(rows.results.map(rowBody), total?.total ?? rows.results.length)
}

export async function countSubmissionsSince(
	db: D1Database,
	actorId: string,
	window: string = DAY_WINDOW,
): Promise<number> {
	const row = await db.prepare(RECENT_COUNT_SELECT).bind(actorId, window).first<CountRow>()
	return row?.total ?? 0
}

function rowBody(row: SubmissionRow): LinksSubmission {
	const body: LinksSubmission = {
		url: row.url,
		name: row.name,
		domain: row.domain,
		createdAt: row.created_at,
	}
	if (row.description !== null) body.description = row.description
	if (row.icon !== null) body.icon = row.icon
	return body
}

async function enforceDailyLimit(db: D1Database, actorId: string): Promise<void> {
	const total = await countSubmissionsSince(db, actorId)
	if (total < MAX_SUBMISSIONS_PER_DAY) return
	throw new LinksProblem(
		'rate_limited',
		`at most ${MAX_SUBMISSIONS_PER_DAY} submissions per day`,
		429,
		DAILY_RETRY_AFTER,
	)
}
