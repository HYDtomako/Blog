import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { isAllowedPath, reviewSyncChanges, unexpectedStarsHunks } from './nightly-sync-guard.mjs';

const guard = fileURLToPath(new URL('./nightly-sync-guard.mjs', import.meta.url));

test('isAllowedPath accepts sync outputs only', () => {
	assert.equal(isAllowedPath('content/github-activity.json'), true);
	assert.equal(isAllowedPath('content/links.json'), true);
	assert.equal(isAllowedPath('content/projects/zh-CN/blog.yaml'), true);
	assert.equal(isAllowedPath('content/projects/en/blog.yml'), true);
	assert.equal(isAllowedPath('content/projects/blog.yaml'), false);
	assert.equal(isAllowedPath('README.md'), false);
	assert.equal(isAllowedPath('content/projects/zh-CN/notes/blog.yaml'), false);
});

test('unexpectedStarsHunks allows a stars integer and nothing else', () => {
	const diff = [
		'diff --git a/content/projects/zh-CN/blog.yaml b/content/projects/zh-CN/blog.yaml',
		'index 111..222 100644',
		'--- a/content/projects/zh-CN/blog.yaml',
		'+++ b/content/projects/zh-CN/blog.yaml',
		'@@ -5 +5 @@',
		'-stars: 0',
		'+stars: 3',
	].join('\n');
	assert.deepEqual(unexpectedStarsHunks(diff), []);
	assert.deepEqual(unexpectedStarsHunks(`${diff}\n-title: Blog`), [
		'content/projects/zh-CN/blog.yaml: -title: Blog',
	]);
});

test('reviewSyncChanges rejects unstaged and out-of-scope files', () => {
	const clean = reviewSyncChanges({ names: [], projectDiff: '', porcelain: '' });
	assert.deepEqual(clean, { ok: true, changed: false, errors: [] });

	const unstaged = reviewSyncChanges({
		names: [],
		projectDiff: '',
		porcelain: ' M content/github-activity.json\n',
	});
	assert.equal(unstaged.ok, false);

	const readme = reviewSyncChanges({
		names: ['README.md'],
		projectDiff: '',
		porcelain: 'M  README.md\n',
	});
	assert.equal(readme.ok, false);
	assert.ok(readme.errors.some((error) => error.includes('README.md')));
});

function git(cwd, args) {
	const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
	assert.equal(result.status, 0, result.stderr || result.stdout);
}

function initRepo() {
	const dir = mkdtempSync(path.join(tmpdir(), 'nightly-sync-guard-'));
	git(dir, ['init', '-b', 'main']);
	git(dir, ['config', 'user.email', 'nightly-sync@example.com']);
	git(dir, ['config', 'user.name', 'nightly-sync']);
	const project = path.join(dir, 'content/projects/zh-CN/blog.yaml');
	mkdirSync(path.dirname(project), { recursive: true });
	writeFileSync(project, 'title: Blog\nstars: 0\n');
	writeFileSync(path.join(dir, 'content/github-activity.json'), '{}\n');
	writeFileSync(path.join(dir, 'content/links.json'), '[]\n');
	git(dir, ['add', '.']);
	git(dir, ['commit', '-m', 'init']);
	return dir;
}

function runGuard(cwd) {
	return spawnSync(process.execPath, [guard], { cwd, encoding: 'utf8' });
}

test('guard CLI accepts a staged stars and activity update', () => {
	const dir = initRepo();
	try {
		writeFileSync(path.join(dir, 'content/projects/zh-CN/blog.yaml'), 'title: Blog\nstars: 4\n');
		writeFileSync(path.join(dir, 'content/github-activity.json'), '{"syncedAt":"2026-10-31"}\n');
		git(dir, ['add', '--', 'content/github-activity.json', 'content/links.json', 'content/projects']);
		const result = runGuard(dir);
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /2 file\(s\) ready to commit/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('guard CLI rejects a staged title edit and reports a clean tree', () => {
	const dir = initRepo();
	try {
		const clean = runGuard(dir);
		assert.equal(clean.status, 2, clean.stderr);
		assert.match(clean.stdout, /no content changes/);

		writeFileSync(path.join(dir, 'content/projects/zh-CN/blog.yaml'), 'title: Renamed\nstars: 0\n');
		git(dir, ['add', '--', 'content/projects']);
		const result = runGuard(dir);
		assert.equal(result.status, 1);
		assert.match(result.stderr, /more than stars/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
