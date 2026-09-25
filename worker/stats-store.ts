import type { D1Database } from './env.ts'
import {
	pageStatsBody,
	totalStatsBody,
	type PageEventInput,
	type PageStatsView,
	type TotalStatsView,
} from './stats-service.ts'

type PageStatsRow = { views: number, likes: number }
type TotalStatsRow = { views: number | null, likes: number | null, pages: number | null }

const VIEW_UPSERT = `INSERT INTO page_stats (path, views) VALUES (?1, 1)
ON CONFLICT(path) DO UPDATE SET views = views + 1, updated_at = datetime('now')
RETURNING views, likes`

const STATS_SELECT = 'SELECT views, likes FROM page_stats WHERE path = ?1'
const STATS_ENSURE = 'INSERT INTO page_stats (path) VALUES (?1) ON CONFLICT(path) DO NOTHING'
const LIKES_INCREMENT = `UPDATE page_stats SET likes = likes + 1, updated_at = datetime('now') WHERE path = ?1`
const LIKES_DECREMENT = `UPDATE page_stats SET likes = MAX(likes - 1, 0), updated_at = datetime('now') WHERE path = ?1`
const LIKED_SELECT = 'SELECT 1 AS liked FROM page_likes WHERE path = ?1 AND actor_id = ?2'
const LIKE_INSERT = 'INSERT INTO page_likes (path, actor_id) VALUES (?1, ?2) ON CONFLICT DO NOTHING'
const LIKE_DELETE = 'DELETE FROM page_likes WHERE path = ?1 AND actor_id = ?2'
const TOTAL_SELECT = `SELECT COALESCE(SUM(views), 0) AS views, COALESCE(SUM(likes), 0) AS likes, COUNT(*) AS pages
FROM page_stats`
const PING_SELECT = 'SELECT 1 AS ok'

export async function applyPageEvent(
	db: D1Database,
	path: string,
	input: PageEventInput,
): Promise<PageStatsView> {
	if (input.event === 'view') return recordView(db, path, input.actorId)
	await toggleLike(db, path, input.actorId, input.event)
	return pageStatsBody(path, await readPageStats(db, path), input.event === 'like')
}

export async function readTotalStats(db: D1Database): Promise<TotalStatsView> {
	const row = await db.prepare(TOTAL_SELECT).first<TotalStatsRow>()
	return totalStatsBody(row)
}

export async function checkDatabase(db: D1Database): Promise<boolean> {
	const row = await db.prepare(PING_SELECT).first<{ ok: number }>()
	return row?.ok === 1
}

async function recordView(
	db: D1Database,
	path: string,
	actorId: string | null,
): Promise<PageStatsView> {
	const upserted = await db.prepare(VIEW_UPSERT).bind(path).first<PageStatsRow>()
	// Not every D1 runtime surfaces RETURNING rows, so a missing row falls back to a read
	// instead of reporting a counter that never moved.
	const stats = upserted ?? (await readPageStats(db, path))
	const liked = actorId !== null && (await readLiked(db, path, actorId))
	return pageStatsBody(path, stats, liked)
}

async function toggleLike(
	db: D1Database,
	path: string,
	actorId: string,
	event: 'like' | 'unlike',
): Promise<void> {
	if (event === 'like') {
		const inserted = await db.prepare(LIKE_INSERT).bind(path, actorId).run()
		if (inserted.meta?.changes !== 1) return
		await db.batch([db.prepare(STATS_ENSURE).bind(path), db.prepare(LIKES_INCREMENT).bind(path)])
		return
	}
	const deleted = await db.prepare(LIKE_DELETE).bind(path, actorId).run()
	if (deleted.meta?.changes !== 1) return
	await db.prepare(LIKES_DECREMENT).bind(path).run()
}

async function readPageStats(db: D1Database, path: string): Promise<PageStatsRow | null> {
	return await db.prepare(STATS_SELECT).bind(path).first<PageStatsRow>()
}

async function readLiked(db: D1Database, path: string, actorId: string): Promise<boolean> {
	const row = await db.prepare(LIKED_SELECT).bind(path, actorId).first<{ liked: number }>()
	return row !== null
}
