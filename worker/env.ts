// Structural stand-ins for the Cloudflare runtime types: this repo does not install
// @cloudflare/workers-types, so the binding shapes the worker relies on live here.
export type D1Result = {
	success: boolean
	meta?: { changes?: number }
	results?: unknown[]
}

export type D1PreparedStatement = {
	bind(...values: unknown[]): D1PreparedStatement
	first<T = Record<string, unknown>>(): Promise<T | null>
	run(): Promise<D1Result>
	all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
}

export type D1Database = {
	prepare(query: string): D1PreparedStatement
	batch(statements: D1PreparedStatement[]): Promise<D1Result[]>
	exec(query: string): Promise<unknown>
}

export type Fetcher = {
	fetch(request: Request): Promise<Response>
}

export type RateLimiter = {
	limit(options: { key: string }): Promise<{ success: boolean }>
}

export interface Env {
	STATS_DB: D1Database
	STATS_ACTOR_SECRET?: string
	STATS_RATE_LIMITER?: RateLimiter
	ASSETS: Fetcher
}
