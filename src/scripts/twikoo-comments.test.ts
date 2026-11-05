import assert from 'node:assert/strict';
import test from 'node:test';
import { twikooInitOptions, twikooLang, initTwikooComments, TWIKOO_SCRIPT } from './twikoo-comments.ts';

test('twikoo language follows the site locale', () => {
	assert.equal(twikooLang('zh-CN'), 'zh-CN');
	assert.equal(twikooLang('zh'), 'zh-CN');
	assert.equal(twikooLang('en'), 'en');
});

test('init options are only envId, el, path, and lang', () => {
	assert.deepEqual(
		twikooInitOptions({
			envId: 'https://twikoo.example.com',
			el: '#twikoo-comments',
			path: '/2026/10/18/example/',
			lang: 'zh-CN',
		}),
		{
			envId: 'https://twikoo.example.com',
			el: '#twikoo-comments',
			path: '/2026/10/18/example/',
			lang: 'zh-CN',
		},
	);
	assert.equal(TWIKOO_SCRIPT.includes('twikoo@1.6.44'), true);
});

test('init calls twikoo with the mount id and hides the loading line', async () => {
	const calls: unknown[] = [];
	const status = { textContent: 'loading', hidden: false };
	const mount = { id: '' };
	const root = {
		dataset: {
			envId: 'http://127.0.0.1:8787',
			path: '/2026/10/18/example/',
			lang: 'en',
			unavailableLabel: 'down',
		},
		classList: { add() {} },
		ownerDocument: {},
		querySelector(selector: string) {
			if (selector === '[data-twikoo-mount]') return mount;
			if (selector === '[data-twikoo-status]') return status;
			return null;
		},
	};

	initTwikooComments(root as unknown as HTMLElement, async () => ({
		init(options) {
			calls.push(options);
		},
	}));
	await new Promise((resolve) => setTimeout(resolve, 0));

	assert.deepEqual(calls, [
		{
			envId: 'http://127.0.0.1:8787',
			el: '#twikoo-comments',
			path: '/2026/10/18/example/',
			lang: 'en',
		},
	]);
	assert.equal(mount.id, 'twikoo-comments');
	assert.equal(status.hidden, true);
	assert.equal(root.dataset.twikooInitialized, 'true');
});
