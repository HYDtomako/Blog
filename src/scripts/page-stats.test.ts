import assert from 'node:assert/strict';
import test from 'node:test';
import {
	initPageStats,
	parsePageStatsSnapshot,
	readPageStatsConfig,
	renderPageStats,
	requestPageStats,
	shouldCountView,
} from './page-stats.ts';

type Stub = {
	hidden: boolean;
	textContent: string;
	dataset: Record<string, string>;
	setAttribute(name: string, value: string): void;
	removeAttribute(name: string): void;
	getAttribute(name: string): string | null;
	querySelector(selector: string): Stub | null;
	addEventListener(type: string, handler: () => void): void;
	click(): void;
};

function stub(init: Partial<Stub> = {}, children: Record<string, Stub> = {}): Stub {
	const attrs = new Map<string, string>();
	const listeners = new Map<string, () => void>();
	const kids = new Map<string, Stub>(Object.entries(children));
	return {
		hidden: true,
		textContent: '',
		dataset: {},
		setAttribute(name, value) {
			attrs.set(name, value);
		},
		removeAttribute(name) {
			attrs.delete(name);
		},
		getAttribute(name) {
			return attrs.get(name) ?? null;
		},
		querySelector(selector) {
			return kids.get(selector) ?? null;
		},
		addEventListener(type, handler) {
			listeners.set(type, handler);
		},
		click() {
			listeners.get('click')?.();
		},
		...init,
	};
}

function docStub(root: Stub | null, hostname = 'example.com', webdriver = false) {
	return {
		querySelector: (selector: string) => (selector === '[data-page-stats]' ? root : null),
		defaultView: { location: { hostname }, navigator: { webdriver } },
	} as unknown as Document;
}

function fetchStub(
	payloads: unknown[],
	calls: Array<{ url: string; body: Record<string, unknown> | null }>,
	ok = true,
) {
	return (async (url: string, init?: RequestInit) => {
		calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
		return { ok, json: async () => payloads.shift() } as Response;
	}) as unknown as typeof fetch;
}

function settling() {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

test('readPageStatsConfig reads path, endpoint and labels from data attributes', () => {
	const root = stub({
		dataset: {
			statsPath: '/notes/from-csdn/',
			statsEndpoint: 'http://127.0.0.1:8787/api/stats/page',
			statsLabels: JSON.stringify({ like: '点赞', unlike: '取消点赞' }),
		},
	});
	const config = readPageStatsConfig(root as unknown as HTMLElement);
	assert.equal(config?.path, '/notes/from-csdn/');
	assert.equal(config?.endpoint, 'http://127.0.0.1:8787/api/stats/page');
	assert.equal(config?.labels.like, '点赞');
	assert.equal(config?.labels.unlike, '取消点赞');

	const withoutPath = readPageStatsConfig(stub() as unknown as HTMLElement);
	assert.equal(withoutPath, null);

	const brokenLabels = readPageStatsConfig(
		stub({ dataset: { statsPath: '/x/', statsLabels: 'not json' } }) as unknown as HTMLElement,
	);
	assert.equal(brokenLabels?.labels.like, 'Like');
	assert.equal(brokenLabels?.endpoint, '/api/stats/page');
});

test('parsePageStatsSnapshot rejects payloads without numeric counts', () => {
	assert.deepEqual(parsePageStatsSnapshot({ path: '/a/', views: 3, likes: 1, liked: true }, '/b/'), {
		path: '/a/',
		views: 3,
		likes: 1,
		liked: true,
	});
	assert.equal(parsePageStatsSnapshot({ views: '3', likes: 1 }, '/b/'), null);
	assert.equal(parsePageStatsSnapshot(null, '/b/'), null);
	assert.deepEqual(parsePageStatsSnapshot({ views: 1, likes: 0 }, '/b/'), {
		path: '/b/',
		views: 1,
		likes: 0,
		liked: false,
	});
});

test('requestPageStats posts the event and degrades to null on failure', async () => {
	const calls: Array<{ url: string; body: Record<string, unknown> | null }> = [];
	const config = { path: '/a/', endpoint: '/api/stats/page', labels: { like: 'Like', unlike: 'Unlike' } };
	const snapshot = await requestPageStats(
		config,
		'view',
		fetchStub([{ path: '/a', views: 2, likes: 1, liked: false }], calls),
	);
	assert.deepEqual(snapshot, { path: '/a', views: 2, likes: 1, liked: false });
	assert.deepEqual(calls[0]?.body, { path: '/a/', event: 'view' });

	calls.length = 0;
	assert.equal(await requestPageStats(config, 'view', fetchStub([{}], calls, false)), null);
	assert.equal(
		await requestPageStats(config, 'view', (async () => {
			throw new Error('offline');
		}) as unknown as typeof fetch),
		null,
	);
});

test('renderPageStats fills counts and like state', () => {
	const root = stub();
	const views = stub();
	const likes = stub();
	const button = stub();
	renderPageStats(
		{
			root: root as unknown as HTMLElement,
			views: views as unknown as HTMLElement,
			likes: likes as unknown as HTMLElement,
			like: button as unknown as HTMLButtonElement,
		},
		{ path: '/a/', views: 12, likes: 3, liked: true },
		{ like: 'Like this', unlike: 'Remove like' },
	);
	assert.equal(root.hidden, false);
	assert.equal(views.textContent, '12');
	assert.equal(likes.textContent, '3');
	assert.equal(button.getAttribute('aria-pressed'), 'true');
	assert.equal(button.getAttribute('aria-label'), 'Remove like');
	assert.equal(button.getAttribute('title'), 'Remove like');
});

test('initPageStats counts a view, then toggles the like button', async () => {
	const views = stub();
	const likes = stub();
	const button = stub();
	const root = stub(
		{ dataset: { statsPath: '/a/', statsLabels: JSON.stringify({ like: 'Like', unlike: 'Unlike' }) } },
		{
			'[data-stats-views]': views,
			'[data-stats-likes]': likes,
			'[data-stats-like]': button,
		},
	);
	const calls: Array<{ url: string; body: Record<string, unknown> | null }> = [];
	initPageStats(
		docStub(root),
		fetchStub(
			[
				{ path: '/a', views: 5, likes: 2, liked: false },
				{ path: '/a', views: 5, likes: 3, liked: true },
			],
			calls,
		),
	);
	await settling();
	assert.deepEqual(calls[0]?.body, { path: '/a/', event: 'view' });
	assert.equal(root.hidden, false);
	assert.equal(views.textContent, '5');
	assert.equal(button.getAttribute('aria-pressed'), 'false');

	button.click();
	await settling();
	assert.deepEqual(calls[1]?.body, { path: '/a/', event: 'like' });
	assert.equal(likes.textContent, '3');
	assert.equal(button.getAttribute('aria-pressed'), 'true');
	assert.equal(button.getAttribute('aria-disabled'), null);
});

test('initPageStats skips counting on localhost and for automated browsers', async () => {
	const calls: Array<{ url: string; body: Record<string, unknown> | null }> = [];
	const root = stub({ dataset: { statsPath: '/a/' } }, { '[data-stats-like]': stub() });
	initPageStats(docStub(root, 'localhost'), fetchStub([{ views: 1, likes: 0 }], calls));
	await settling();
	assert.equal(calls.length, 0);
	assert.equal(root.hidden, true);

	assert.equal(shouldCountView(docStub(null, 'example.com', true)), false);
	assert.equal(shouldCountView(docStub(null)), true);
});
