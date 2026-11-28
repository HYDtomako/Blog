import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { en } from '../i18n/en.ts';
import { zhCN } from '../i18n/zh-CN.ts';
import {
	LIST_PAGE_SIZE,
	collectionPageHref,
	collectionPagePath,
	listSummary,
	overflowPageRoutes,
	pageCount,
	paginationControls,
	slicePage,
	sortByPubDateDesc,
} from './list-pages.ts';

test('default list page size is 7', () => {
	assert.equal(LIST_PAGE_SIZE, 7);
});

test('seven or fewer items stay on page 1 with no next control', () => {
	for (const total of [0, 1, 5, 7]) {
		const items = Array.from({ length: total }, (_, index) => index);
		assert.equal(pageCount(total), total === 0 ? 0 : 1);
		assert.deepEqual(slicePage(items, 1), items);
		assert.deepEqual(overflowPageRoutes(items), []);
		const controls = paginationControls(1, pageCount(total));
		assert.equal(controls.visible, false);
		assert.equal(controls.showNext, false);
		assert.equal(controls.showPrevious, false);
		assert.deepEqual(controls.pages, []);
	}
});

test('the eighth item opens page 2 and the last page has no next control', () => {
	const items = Array.from({ length: 8 }, (_, index) => `post-${index}`);
	assert.equal(pageCount(items.length), 2);
	assert.deepEqual(slicePage(items, 1), items.slice(0, 7));
	assert.deepEqual(slicePage(items, 2), ['post-7']);
	assert.deepEqual(slicePage(items, 3), []);

	const routes = overflowPageRoutes(items);
	assert.equal(routes.length, 1);
	assert.equal(routes[0].page, '2');
	assert.equal(routes[0].pageNumber, 2);
	assert.equal(routes[0].pageCount, 2);
	assert.equal(routes[0].total, 8);
	assert.deepEqual(routes[0].items, ['post-7']);

	const first = paginationControls(1, 2);
	assert.equal(first.visible, true);
	assert.equal(first.showPrevious, false);
	assert.equal(first.showNext, true);
	assert.deepEqual(first.pages, [1, 2]);

	const second = paginationControls(2, 2);
	assert.equal(second.showPrevious, true);
	assert.equal(second.showNext, false);
});

test('a temporary page size of 2 paginates a five-item list onto page 2', () => {
	const pageSize = 2;
	const items = [
		{ id: 'old', pubDate: new Date('2024-01-01T00:00:00Z') },
		{ id: 'mid', pubDate: new Date('2025-06-01T00:00:00Z') },
		{ id: 'new', pubDate: new Date('2026-03-01T00:00:00Z') },
		{ id: 'newer', pubDate: new Date('2026-08-01T00:00:00Z') },
		{ id: 'newest', pubDate: new Date('2026-11-01T00:00:00Z') },
	];
	const sorted = sortByPubDateDesc(items);
	assert.deepEqual(
		sorted.map((item) => item.id),
		['newest', 'newer', 'new', 'mid', 'old'],
	);

	assert.equal(pageCount(sorted.length, pageSize), 3);
	assert.deepEqual(
		slicePage(sorted, 1, pageSize).map((item) => item.id),
		['newest', 'newer'],
	);
	assert.deepEqual(
		slicePage(sorted, 2, pageSize).map((item) => item.id),
		['new', 'mid'],
	);
	assert.deepEqual(
		slicePage(sorted, 3, pageSize).map((item) => item.id),
		['old'],
	);

	const routes = overflowPageRoutes(sorted, pageSize);
	assert.deepEqual(
		routes.map((route) => route.page),
		['2', '3'],
	);
	assert.deepEqual(
		routes[0].items.map((item) => item.id),
		['new', 'mid'],
	);
	assert.equal(paginationControls(1, pageCount(sorted.length, pageSize)).showNext, true);
	assert.equal(paginationControls(2, pageCount(sorted.length, pageSize)).showNext, true);
	assert.equal(paginationControls(3, pageCount(sorted.length, pageSize)).showNext, false);
	assert.equal(paginationControls(3, pageCount(sorted.length, pageSize)).showPrevious, true);
});

test('fifteen items at the default size fill page 2 and leave a short page 3', () => {
	const items = Array.from({ length: 15 }, (_, index) => index);
	assert.equal(pageCount(items.length), 3);
	assert.equal(slicePage(items, 2).length, 7);
	assert.deepEqual(slicePage(items, 2), items.slice(7, 14));
	assert.deepEqual(slicePage(items, 3), [14]);
	assert.deepEqual(
		overflowPageRoutes(items).map((route) => route.page),
		['2', '3'],
	);
});

test('pagination URLs keep page 1 on the index and number later pages', () => {
	assert.equal(collectionPagePath('writing', 1), '/writing/');
	assert.equal(collectionPagePath('writing', 2), '/writing/page/2/');
	assert.equal(collectionPagePath('notes', 1), '/notes/');
	assert.equal(collectionPagePath('notes', 3), '/notes/page/3/');
	assert.equal(collectionPageHref('writing', 1, 'zh-CN'), '/writing/');
	assert.equal(collectionPageHref('writing', 2, 'zh-CN'), '/writing/page/2/');
	assert.equal(collectionPageHref('writing', 2, 'en'), '/en/writing/page/2/');
	assert.equal(collectionPageHref('notes', 1, 'en'), '/en/notes/');
	assert.equal(collectionPageHref('notes', 2, 'en'), '/en/notes/page/2/');
	assert.equal(collectionPageHref('notes', 2, 'zh-CN'), '/notes/page/2/');
});

test('out-of-range pages and bad page sizes do not invent a next control', () => {
	assert.deepEqual(slicePage(['a'], 0), []);
	assert.deepEqual(slicePage(['a'], -1), []);
	assert.equal(paginationControls(2, 1).visible, false);
	assert.equal(paginationControls(1, 0).showNext, false);
	assert.throws(() => pageCount(8, 0), /positive integer/);
	assert.throws(() => slicePage(['a'], 1, 1.5), /positive integer/);
});

test('list summaries use description, then llmSummary, and never invent text', () => {
	assert.equal(listSummary({ description: '  short   summary  ', llmSummary: 'long' }), 'short summary');
	assert.equal(listSummary({ description: '   ', llmSummary: ' fallback \n summary ' }), 'fallback summary');
	assert.equal(listSummary({ description: '', llmSummary: '' }), '');
	assert.equal(listSummary({}), '');
});

test('writing and notes pagination copy exists in Chinese and English', () => {
	assert.equal(zhCN.common.prevPage, '← 上一页');
	assert.equal(zhCN.common.nextPage, '下一页 →');
	assert.equal(zhCN.common.paginationAria, '文章分页');
	assert.equal(zhCN.writing.pageCrumb(2), '第 2 页');
	assert.equal(zhCN.writing.pageProgress(2, 3), '第 2 / 3 页');
	assert.equal(zhCN.notes.paginationAria, '随笔分页');
	assert.equal(zhCN.notes.pageCrumb(2), '第 2 页');
	assert.equal(zhCN.notes.pageProgress(2, 3), '第 2 / 3 页');

	assert.equal(en.common.prevPage, '← Previous');
	assert.equal(en.common.nextPage, 'Next →');
	assert.equal(en.common.paginationAria, 'Article pagination');
	assert.equal(en.writing.pageCrumb(2), 'Page 2');
	assert.equal(en.writing.pageProgress(2, 3), 'Page 2 / 3');
	assert.equal(en.notes.paginationAria, 'Notes pagination');
	assert.equal(en.notes.pageCrumb(2), 'Page 2');
	assert.equal(en.notes.pageProgress(2, 3), 'Page 2 / 3');
});

test('the list template clamps summaries and only renders pagination controls that exist', () => {
	const cards = readFileSync(new URL('../components/ArticleCards.astro', import.meta.url), 'utf8');
	const pagination = readFileSync(new URL('../components/WritingPagination.astro', import.meta.url), 'utf8');
	assert.match(cards, /listSummary\(/);
	assert.match(cards, /-webkit-line-clamp:\s*3/);
	assert.match(pagination, /paginationControls\(/);
	assert.match(pagination, /controls\.showNext/);
	assert.match(pagination, /controls\.showPrevious/);
	assert.match(pagination, /controls\.visible/);
	assert.doesNotMatch(pagination, /disabled/);
});
