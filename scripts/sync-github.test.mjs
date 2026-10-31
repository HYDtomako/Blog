import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { requestHeaders } from './sync-github.mjs';

const CONTRIBUTIONS = 'https://github.com/users/HYDtomako/contributions';
const REPOS = 'https://api.github.com/users/HYDtomako/repos?per_page=100&sort=pushed';

test('requestHeaders sends a bearer token only to api.github.com', () => {
	const env = { GITHUB_TOKEN: 'token-example', GH_TOKEN: '' };
	const api = requestHeaders(REPOS, 'application/vnd.github+json', env);
	const html = requestHeaders(CONTRIBUTIONS, 'text/html', env);
	assert.equal(api.authorization, 'Bearer token-example');
	assert.equal(api.accept, 'application/vnd.github+json');
	assert.equal(html.authorization, undefined);
	assert.equal(html['user-agent'], api['user-agent']);
});

test('requestHeaders prefers GITHUB_TOKEN and omits an empty token', () => {
	assert.equal(requestHeaders(REPOS, 'application/vnd.github+json', { GH_TOKEN: 'token-fallback' }).authorization, 'Bearer token-fallback');
	assert.equal(requestHeaders(REPOS, 'application/vnd.github+json', {}).authorization, undefined);
});

test('SYNC_GITHUB_SKIP exits 0 without touching the network', () => {
	const result = spawnSync(process.execPath, ['scripts/sync-github.mjs'], {
		env: { ...process.env, SYNC_GITHUB_SKIP: '1' },
		encoding: 'utf8',
	});
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /SYNC_GITHUB_SKIP=1/);
});

test('SYNC_LINKS_SKIP exits 0 without fetching sites', () => {
	const result = spawnSync(process.execPath, ['scripts/sync-links.mjs'], {
		env: { ...process.env, SYNC_LINKS_SKIP: '1' },
		encoding: 'utf8',
	});
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /SYNC_LINKS_SKIP=1/);
});
