import assert from 'node:assert/strict';
import test from 'node:test';
import { articleCommentPath, resolveCommentsConfig } from './comments.mjs';

test('empty comments config stays disabled', () => {
	assert.deepEqual(resolveCommentsConfig(), { envId: '', enabled: false });
	assert.deepEqual(resolveCommentsConfig({ envId: '   ' }), { envId: '', enabled: false });
});

test('an https envId is normalized and enables comments', () => {
	assert.deepEqual(resolveCommentsConfig({ envId: ' https://twikoo.example.com/ ' }), {
		envId: 'https://twikoo.example.com',
		enabled: true,
	});
});

test('local wrangler dev URLs stay enabled', () => {
	assert.equal(resolveCommentsConfig({ envId: 'http://127.0.0.1:8787/' }).enabled, true);
	assert.equal(resolveCommentsConfig({ envId: 'http://localhost:8787' }).envId, 'http://localhost:8787');
});

test('a non-local http URL is rejected', () => {
	assert.throws(
		() => resolveCommentsConfig({ envId: 'http://comments.example.com' }),
		/https:\/\//,
	);
});

test('a value that is not a URL is rejected', () => {
	assert.throws(() => resolveCommentsConfig({ envId: 'hydblog-twikoo' }), /完整 URL/);
});

test('article comment paths keep one trailing slash', () => {
	assert.equal(articleCommentPath('2026/10/18/long-term-personal-agent'), '/2026/10/18/long-term-personal-agent/');
	assert.equal(articleCommentPath('/en/2026/08/23/example/'), '/en/2026/08/23/example/');
});
