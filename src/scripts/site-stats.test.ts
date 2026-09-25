import assert from 'node:assert/strict';
import test from 'node:test';
import {
	formatStatNumber,
	initSiteStats,
	parseSiteStatsSnapshot,
	requestSiteStats,
} from './site-stats.ts';

type Stub = {
	hidden: boolean;
	textContent: string;
	dataset: Record<string, string>;
	querySelector(selector: string): Stub | null;
};

function stub(init: Partial<Stub> = {}, children: Record<string, Stub> = {}): Stub {
	const kids = new Map<string, Stub>(Object.entries(children));
	return {
		hidden: true,
		textContent: '',
		dataset: {},
		querySelector(selector) {
			return kids.get(selector) ?? null;
		},
		...init,
	};
}

function docStub(root: Stub | null) {
	return {
		querySelector: (selector: string) => (selector === '[data-site-stats]' ? root : null),
	} as unknown as Document;
}

function settling() {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

test('parseSiteStatsSnapshot keeps totals and rejects non-numeric payloads', () => {
	assert.deepEqual(parseSiteStatsSnapshot({ views: 1200, likes: 12, pages: 7 }), {
		views: 1200,
		likes: 12,
		pages: 7,
	});
	assert.deepEqual(parseSiteStatsSnapshot({ views: 4 }), { views: 4, likes: 0, pages: 0 });
	assert.equal(parseSiteStatsSnapshot({ views: '4' }), null);
	assert.equal(parseSiteStatsSnapshot(undefined), null);
});

test('formatStatNumber groups digits per locale and survives bad input', () => {
	assert.equal(formatStatNumber(1234, 'en'), '1,234');
	assert.equal(formatStatNumber(1234, 'zh-CN'), '1,234');
	assert.equal(formatStatNumber(7, 'not a locale'), '7');
});

test('requestSiteStats reads the total endpoint and degrades to null', async () => {
	const seen: string[] = [];
	const okFetch = (async (url: string) => {
		seen.push(String(url));
		return { ok: true, json: async () => ({ views: 9, likes: 1, pages: 2 }) } as Response;
	}) as unknown as typeof fetch;
	assert.deepEqual(await requestSiteStats('/api/stats/total', okFetch), { views: 9, likes: 1, pages: 2 });
	assert.deepEqual(seen, ['/api/stats/total']);

	const failingFetch = (async () => {
		throw new Error('offline');
	}) as unknown as typeof fetch;
	assert.equal(await requestSiteStats('/api/stats/total', failingFetch), null);
});

test('initSiteStats fills the total and reveals the fallback note on failure', async () => {
	const total = stub();
	const note = stub({ hidden: true });
	const root = stub(
		{ dataset: { statsEndpoint: '/api/stats/total', statsLocale: 'zh-CN' } },
		{ '[data-stats-total]': total, '[data-stats-note]': note },
	);
	const okFetch = (async () =>
		({ ok: true, json: async () => ({ views: 2500, likes: 3, pages: 8 }) }) as Response) as unknown as typeof fetch;
	initSiteStats(docStub(root), okFetch);
	await settling();
	assert.equal(total.textContent, '2,500');
	assert.equal(note.hidden, true);

	const offline = (async () => {
		throw new Error('offline');
	}) as unknown as typeof fetch;
	initSiteStats(docStub(root), offline);
	await settling();
	assert.equal(note.hidden, false);
});
