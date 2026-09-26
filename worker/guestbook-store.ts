import type { D1Database } from './env.ts'
import {
	GuestbookProblem,
	MAX_POSTS_PER_DAY,
	MAX_POSTS_PER_MINUTE,
	MAX_REPLIES_PER_THREAD,
	MIN_SECONDS_BETWEEN_POSTS,
	RETRACT_WINDOW_SECONDS,
	likeBody,
	listBody,
	messageBody,
	removeBody,
	replyBody,
	type GuestbookLikeBody,
	type GuestbookListBody,
	type GuestbookListQuery,
	type GuestbookMessage,
	type GuestbookReply,
	type GuestbookRemoveBody,
	type GuestbookReplyRow,
	type GuestbookRow,
} from './guestbook-service.ts'

type CountRow = { total: number }
type ParentCountRow = { parent_id: number, total: number }
type LikeCountRow = { message_id: number, total: number }

const THREAD_PAGE_SELECT = `SELECT id, body, actor_id, created_at FROM guestbook_messages
WHERE parent_id IS NULL ORDER BY id DESC LIMIT ?1`
const THREAD_PAGE_BEFORE_SELECT = `SELECT id, body, actor_id, created_at FROM guestbook_messages
WHERE parent_id IS NULL AND id < ?1 ORDER BY id DESC LIMIT ?2`
const THREAD_TOTAL_SELECT = 'SELECT COUNT(*) AS total FROM guestbook_messages WHERE parent_id IS NULL'
const MESSAGE_INSERT = `INSERT INTO guestbook_messages (parent_id, body, actor_id) VALUES (?1, ?2, ?3)
RETURNING id, body, actor_id, created_at`
const MESSAGE_LATEST_SELECT = `SELECT id, body, actor_id, created_at FROM guestbook_messages
WHERE actor_id = ?1 AND parent_id IS ?2 ORDER BY id DESC LIMIT 1`
const PARENT_SELECT = 'SELECT id FROM guestbook_messages WHERE id = ?1 AND parent_id IS NULL'
const MESSAGE_SELECT = 'SELECT id, actor_id FROM guestbook_messages WHERE id = ?1'
const LAST_POST_SELECT = `SELECT CAST(?2 - (strftime('%s', 'now') - strftime('%s', created_at)) AS INTEGER) AS wait
FROM guestbook_messages WHERE actor_id = ?1 ORDER BY id DESC LIMIT 1`
const RECENT_POST_COUNT_SELECT = `SELECT COUNT(*) AS total FROM guestbook_messages
WHERE actor_id = ?1 AND created_at > datetime('now', ?2)`
const MESSAGE_LIKE_COUNT_SELECT = 'SELECT COUNT(*) AS total FROM guestbook_likes WHERE message_id = ?1'
const MESSAGE_LIKED_SELECT = 'SELECT 1 AS liked FROM guestbook_likes WHERE message_id = ?1 AND actor_id = ?2'
const LIKE_INSERT = 'INSERT INTO guestbook_likes (message_id, actor_id) VALUES (?1, ?2) ON CONFLICT DO NOTHING'
const LIKE_DELETE = 'DELETE FROM guestbook_likes WHERE message_id = ?1 AND actor_id = ?2'
const FRESH_MESSAGE_SELECT = `SELECT 1 AS fresh FROM guestbook_messages
WHERE id = ?1 AND actor_id = ?2 AND created_at > datetime('now', ?3)`
const REPLY_LIKE_DELETE = `DELETE FROM guestbook_likes
WHERE message_id IN (SELECT id FROM guestbook_messages WHERE parent_id = ?1)`
const REPLY_DELETE = 'DELETE FROM guestbook_messages WHERE parent_id = ?1'
const MESSAGE_LIKE_DELETE = 'DELETE FROM guestbook_likes WHERE message_id = ?1'
const MESSAGE_DELETE = 'DELETE FROM guestbook_messages WHERE id = ?1'

const MINUTE_WINDOW = '-60 seconds'
const DAY_WINDOW = '-1 day'
const RETRACT_WINDOW = `-${RETRACT_WINDOW_SECONDS} seconds`
const MINUTE_RETRY_AFTER = 60
const DAY_RETRY_AFTER = 3600

/** `IN (?, ?, ...)` needs one placeholder per bound id; ids are never interpolated into SQL. */
function placeholders(count: number): string {
	return Array.from({ length: count }, () => '?').join(', ')
}

const REPLY_COUNT_SELECT = (count: number) =>
	`SELECT parent_id, COUNT(*) AS total FROM guestbook_messages
WHERE parent_id IN (${placeholders(count)}) GROUP BY parent_id`

const REPLY_SELECT = (count: number) =>
	`SELECT id, parent_id, body, actor_id, created_at FROM (
	SELECT id, parent_id, body, actor_id, created_at,
		ROW_NUMBER() OVER (PARTITION BY parent_id ORDER BY id DESC) AS position
	FROM guestbook_messages WHERE parent_id IN (${placeholders(count)})
) WHERE position <= ? ORDER BY id ASC`

const LIKE_COUNT_SELECT = (count: number) =>
	`SELECT message_id, COUNT(*) AS total FROM guestbook_likes
WHERE message_id IN (${placeholders(count)}) GROUP BY message_id`

const LIKED_SELECT = (count: number) =>
	`SELECT message_id FROM guestbook_likes WHERE actor_id = ? AND message_id IN (${placeholders(count)})`

export async function readThread(
	db: D1Database,
	actorId: string,
	page: GuestbookListQuery,
): Promise<GuestbookListBody> {
	const [rows, total] = await Promise.all([readThreadPage(db, page), readThreadTotal(db)])
	const hasMore = rows.length > page.limit
	const threads = hasMore ? rows.slice(0, page.limit) : rows
	const threadIds = threads.map((row) => row.id)
	if (threadIds.length === 0) return listBody([], null, total)

	const [replies, replyCounts] = await Promise.all([
		readReplies(db, threadIds),
		readReplyCounts(db, threadIds),
	])
	const messageIds = [...threadIds, ...replies.map((row) => row.id)]
	const [likeCounts, liked] = await Promise.all([
		readLikeCounts(db, messageIds),
		readLikedIds(db, actorId, messageIds),
	])

	const repliesByThread = new Map<number, GuestbookReply[]>()
	for (const row of replies) {
		const reply = replyBody(row, actorId, {
			likes: likeCounts.get(row.id) ?? 0,
			liked: liked.has(row.id),
		})
		const thread = repliesByThread.get(row.parent_id)
		if (thread === undefined) repliesByThread.set(row.parent_id, [reply])
		else thread.push(reply)
	}

	const messages = threads.map((row) =>
		messageBody(row, actorId, {
			likes: likeCounts.get(row.id) ?? 0,
			liked: liked.has(row.id),
			replyCount: replyCounts.get(row.id) ?? 0,
			replies: repliesByThread.get(row.id) ?? [],
		}),
	)
	// The cursor is the last id of the page, so the next read continues strictly below it.
	const nextBefore = hasMore ? threads[threads.length - 1].id : null
	return listBody(messages, nextBefore, total)
}

export async function createMessage(
	db: D1Database,
	actorId: string,
	body: string,
	parentId: number | null,
): Promise<GuestbookMessage | GuestbookReply> {
	if (parentId !== null && (await db.prepare(PARENT_SELECT).bind(parentId).first()) === null) {
		throw new GuestbookProblem('invalid_parent', 'parent message does not exist')
	}
	await enforcePostRateLimit(db, actorId)

	const inserted = await db.prepare(MESSAGE_INSERT).bind(parentId, body, actorId).first<GuestbookRow>()
	// Not every D1 runtime surfaces RETURNING rows, so a missing row falls back to a read
	// instead of reporting a message that was never stored.
	const row = inserted ?? (await db.prepare(MESSAGE_LATEST_SELECT).bind(actorId, parentId).first<GuestbookRow>())
	if (row === null) throw new Error('message insert returned no row')

	// A reply reports the reply shape; only a top-level message carries its thread.
	if (parentId !== null) return replyBody(row, actorId, { likes: 0, liked: false })
	return messageBody(row, actorId, { likes: 0, liked: false, replyCount: 0, replies: [] })
}

export async function toggleMessageLike(
	db: D1Database,
	actorId: string,
	id: number,
	liked: boolean,
): Promise<GuestbookLikeBody> {
	if ((await db.prepare(MESSAGE_SELECT).bind(id).first()) === null) {
		throw new GuestbookProblem('message_not_found', 'message does not exist', 404)
	}
	// Both directions are deduped by the (message_id, actor_id) primary key, so a repeated
	// like or unlike touches no rows and the aggregate count below never moves.
	if (liked) await db.prepare(LIKE_INSERT).bind(id, actorId).run()
	else await db.prepare(LIKE_DELETE).bind(id, actorId).run()

	const [likes, likedNow] = await Promise.all([readLikeCount(db, id), readLiked(db, id, actorId)])
	return likeBody(id, likes, likedNow)
}

export async function removeMessage(
	db: D1Database,
	actorId: string,
	id: number,
): Promise<GuestbookRemoveBody> {
	const row = await db.prepare(MESSAGE_SELECT).bind(id).first<{ id: number, actor_id: string }>()
	if (row === null) throw new GuestbookProblem('message_not_found', 'message does not exist', 404)
	if (row.actor_id !== actorId) {
		throw new GuestbookProblem('not_author', 'only the author can remove this message', 403)
	}
	const fresh = await db.prepare(FRESH_MESSAGE_SELECT).bind(id, actorId, RETRACT_WINDOW).first()
	if (fresh === null) {
		throw new GuestbookProblem(
			'not_author',
			`messages can only be removed within ${RETRACT_WINDOW_SECONDS} seconds of posting`,
			403,
		)
	}
	// There are no foreign keys, so a top-level message takes its likes, its replies, and the
	// likes on those replies with it. A reply has no children, which makes the first two
	// deletes no-ops for it.
	await db.batch([
		db.prepare(REPLY_LIKE_DELETE).bind(id),
		db.prepare(REPLY_DELETE).bind(id),
		db.prepare(MESSAGE_LIKE_DELETE).bind(id),
		db.prepare(MESSAGE_DELETE).bind(id),
	])
	return removeBody(id)
}

async function readThreadPage(db: D1Database, page: GuestbookListQuery): Promise<GuestbookRow[]> {
	// One row past the page size tells the caller whether another page follows.
	const limit = page.limit + 1
	const statement = page.before === null
		? db.prepare(THREAD_PAGE_SELECT).bind(limit)
		: db.prepare(THREAD_PAGE_BEFORE_SELECT).bind(page.before, limit)
	const { results } = await statement.all<GuestbookRow>()
	return results
}

async function readThreadTotal(db: D1Database): Promise<number> {
	const row = await db.prepare(THREAD_TOTAL_SELECT).first<CountRow>()
	return row?.total ?? 0
}

async function readReplies(db: D1Database, parentIds: number[]): Promise<GuestbookReplyRow[]> {
	const { results } = await db
		.prepare(REPLY_SELECT(parentIds.length))
		.bind(...parentIds, MAX_REPLIES_PER_THREAD)
		.all<GuestbookReplyRow>()
	return results
}

async function readReplyCounts(db: D1Database, parentIds: number[]): Promise<Map<number, number>> {
	const { results } = await db
		.prepare(REPLY_COUNT_SELECT(parentIds.length))
		.bind(...parentIds)
		.all<ParentCountRow>()
	return new Map(results.map((row) => [row.parent_id, row.total]))
}

async function readLikeCounts(db: D1Database, messageIds: number[]): Promise<Map<number, number>> {
	const { results } = await db
		.prepare(LIKE_COUNT_SELECT(messageIds.length))
		.bind(...messageIds)
		.all<LikeCountRow>()
	return new Map(results.map((row) => [row.message_id, row.total]))
}

async function readLikedIds(
	db: D1Database,
	actorId: string,
	messageIds: number[],
): Promise<Set<number>> {
	const { results } = await db
		.prepare(LIKED_SELECT(messageIds.length))
		.bind(actorId, ...messageIds)
		.all<{ message_id: number }>()
	return new Set(results.map((row) => row.message_id))
}

async function readLikeCount(db: D1Database, id: number): Promise<number> {
	const row = await db.prepare(MESSAGE_LIKE_COUNT_SELECT).bind(id).first<CountRow>()
	return row?.total ?? 0
}

async function readLiked(db: D1Database, id: number, actorId: string): Promise<boolean> {
	const row = await db.prepare(MESSAGE_LIKED_SELECT).bind(id, actorId).first()
	return row !== null
}

async function enforcePostRateLimit(db: D1Database, actorId: string): Promise<void> {
	const [last, minute, day] = await Promise.all([
		db.prepare(LAST_POST_SELECT).bind(actorId, MIN_SECONDS_BETWEEN_POSTS).first<{ wait: number }>(),
		countRecentPosts(db, actorId, MINUTE_WINDOW),
		countRecentPosts(db, actorId, DAY_WINDOW),
	])
	const wait = last?.wait ?? 0
	if (wait > 0) {
		throw new GuestbookProblem(
			'rate_limited',
			`wait ${MIN_SECONDS_BETWEEN_POSTS} seconds between posts`,
			429,
			Math.max(wait, 1),
		)
	}
	if (minute >= MAX_POSTS_PER_MINUTE) {
		throw new GuestbookProblem(
			'rate_limited',
			`at most ${MAX_POSTS_PER_MINUTE} posts per minute`,
			429,
			MINUTE_RETRY_AFTER,
		)
	}
	if (day >= MAX_POSTS_PER_DAY) {
		throw new GuestbookProblem(
			'rate_limited',
			`at most ${MAX_POSTS_PER_DAY} posts per day`,
			429,
			DAY_RETRY_AFTER,
		)
	}
}

async function countRecentPosts(db: D1Database, actorId: string, window: string): Promise<number> {
	const row = await db.prepare(RECENT_POST_COUNT_SELECT).bind(actorId, window).first<CountRow>()
	return row?.total ?? 0
}
