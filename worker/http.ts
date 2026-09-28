import type { RateLimiter } from './env.ts'

/** The status/code pair every route error carries; parser problems match this shape too. */
export class HttpProblem extends Error {
	readonly code: string
	readonly status: number

	constructor(code: string, message: string, status = 400) {
		super(message)
		this.code = code
		this.status = status
	}
}

const JSON_HEADERS = { 'cache-control': 'no-store' }

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
	return Response.json(body, { status, headers: { ...JSON_HEADERS, ...headers } })
}

export function failure(
	status: number,
	code: string,
	message: string,
	headers: Record<string, string> = {},
): Response {
	return json({ error: { code, message } }, status, headers)
}

export function clientIp(request: Request): string {
	return request.headers.get('cf-connecting-ip') ?? '0.0.0.0'
}

export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
	const declared = Number.parseInt(request.headers.get('content-length') ?? '', 10)
	if (declared > maxBytes) {
		throw new HttpProblem('invalid_body', `body must be at most ${maxBytes} bytes`, 413)
	}
	const text = await request.text()
	if (new TextEncoder().encode(text).byteLength > maxBytes) {
		throw new HttpProblem('invalid_body', `body must be at most ${maxBytes} bytes`, 413)
	}
	try {
		return JSON.parse(text) as unknown
	} catch {
		throw new HttpProblem('invalid_body', 'body must be valid JSON')
	}
}

/** An unbound limiter or a request without an actor is never rate limited. */
export async function isRateLimited(
	limiter: RateLimiter | undefined,
	actorId: string | null,
): Promise<boolean> {
	if (actorId === null || limiter === undefined) return false
	const { success } = await limiter.limit({ key: actorId })
	return !success
}

function isProblem(value: unknown): value is { code: string, message: string, status: number } {
	if (!(value instanceof Error)) return false
	const problem = value as Partial<HttpProblem>
	return typeof problem.code === 'string' && typeof problem.status === 'number'
}

/** Turns a caught parser problem into its error response, rethrowing anything unexpected. */
export function toErrorResponse(error: unknown): Response {
	if (isProblem(error)) return failure(error.status, error.code, error.message)
	throw error
}
