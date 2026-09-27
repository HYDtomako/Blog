import assert from 'node:assert/strict'
import test from 'node:test'
import {
	LinksProblem,
	fetchSiteMetadata,
	parseSubmitRequest,
	submissionBody,
} from './links-service.ts'

const PAGE = `<!doctype html><html><head>
<title>Plain title</title>
<meta property="og:title" content="Rui&#39;s Blog">
<meta property="og:description" content="Code and indie making">
<link rel="icon" href="/icon.png">
</head><body>hello</body></html>`

function htmlResponse(body: string, init: { status?: number; url?: string; type?: string } = {}) {
	return {
		ok: (init.status ?? 200) >= 200 && (init.status ?? 200) < 300,
		status: init.status ?? 200,
		url: init.url ?? 'https://example.com/',
		headers: new Headers({ 'content-type': init.type ?? 'text/html; charset=utf-8' }),
		text: async () => body,
	} as unknown as Response
}

test('a submission carries a url and nothing else', () => {
	assert.deepEqual(parseSubmitRequest({ url: 'example.com' }), { url: 'https://example.com/' })
	assert.deepEqual(parseSubmitRequest({ url: 'https://example.com/post#anchor' }), {
		url: 'https://example.com/post',
	})

	for (const body of [null, 'url', [], {}, { url: 42 }, { url: 'http://localhost:8787/' }]) {
		assert.throws(
			() => parseSubmitRequest(body),
			(error: unknown) => error instanceof LinksProblem && error.status === 400,
			`expected ${JSON.stringify(body)} to be rejected`,
		)
	}
	assert.throws(
		() => parseSubmitRequest({ url: 'example.com', name: 'Example' }),
		(error: unknown) => error instanceof LinksProblem && error.code === 'invalid_body',
	)
})

test('a reachable site is read for its title, description, icon and final url', async () => {
	const seen: string[] = []
	const metadata = await fetchSiteMetadata('https://example.com/', (async (url: string) => {
		seen.push(url)
		return htmlResponse(PAGE, { url: 'https://example.com/home' })
	}) as unknown as typeof fetch)

	assert.deepEqual(seen, ['https://example.com/'])
	assert.deepEqual(metadata, {
		title: "Rui's Blog",
		description: 'Code and indie making',
		icon: 'https://example.com/icon.png',
	})
})

test('a reachable page without metadata or html still joins on its domain', async () => {
	const bare = await fetchSiteMetadata(
		'https://example.com/',
		(async () => htmlResponse('<html><body>nothing</body></html>')) as unknown as typeof fetch,
	)
	assert.equal(bare.title, undefined)
	assert.equal(bare.description, undefined)
	assert.equal(bare.icon, 'https://example.com/favicon.ico')

	const pdf = await fetchSiteMetadata(
		'https://example.com/file.pdf',
		(async () => htmlResponse('%PDF-1.7', { type: 'application/pdf' })) as unknown as typeof fetch,
	)
	assert.deepEqual(pdf, {})
})

test('an unreachable site is reported as a lost signal', async () => {
	for (const impl of [
		(async () => htmlResponse('gone', { status: 404 })) as unknown as typeof fetch,
		(async () => {
			throw new Error('offline')
		}) as unknown as typeof fetch,
	]) {
		await assert.rejects(
			() => fetchSiteMetadata('https://example.com/', impl),
			(error: unknown) => error instanceof LinksProblem
				&& error.code === 'signal_lost'
				&& error.status === 502,
		)
	}
})

test('an oversized or broken body yields no metadata rather than an error', async () => {
	const oversized = {
		ok: true,
		status: 200,
		url: 'https://example.com/',
		headers: new Headers({ 'content-type': 'text/html', 'content-length': String(10 * 1024 * 1024) }),
		text: async () => PAGE,
	} as unknown as Response
	assert.deepEqual(await fetchSiteMetadata('https://example.com/', (async () => oversized) as unknown as typeof fetch), {})

	const broken = {
		ok: true,
		status: 200,
		url: 'https://example.com/',
		headers: new Headers({ 'content-type': 'text/html' }),
		text: async () => {
			throw new Error('stream failed')
		},
	} as unknown as Response
	assert.deepEqual(await fetchSiteMetadata('https://example.com/', (async () => broken) as unknown as typeof fetch), {})
})

test('a submitted link is described for the wall without any ranking', () => {
	const body = submissionBody('https://example.com/', { title: 'Example' })
	assert.equal(body.name, 'Example')
	assert.equal(body.domain, 'example.com')
	assert.equal('depth' in body, false)
	assert.equal('createdAt' in body, false)

	const fallback = submissionBody('https://www.example.com/deep/page', {})
	assert.equal(fallback.name, 'example.com')
	assert.equal(fallback.description, undefined)
	assert.equal(fallback.icon, undefined)
})
