/**
 * Refuse a nightly sync commit unless the staged diff is only:
 *   - content/github-activity.json
 *   - content/links.json
 *   - `stars:` lines in content/projects/<locale>/*.yaml
 *
 * Stage those paths first (`git add -- content/github-activity.json content/links.json content/projects`).
 * Exit 0 when that staged diff is safe and non-empty, 2 when the tree is clean, 1 otherwise.
 *
 * Usage: node scripts/nightly-sync-guard.mjs
 */
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ALLOWED_FILES = new Set(['content/github-activity.json', 'content/links.json']);

export function isAllowedPath(file) {
	if (ALLOWED_FILES.has(file)) return true;
	return /^content\/projects\/[^/]+\/[^/]+\.ya?ml$/i.test(file);
}

/** Non-empty when a staged project diff touches anything other than `stars: <integer>`. */
export function unexpectedStarsHunks(diff) {
	const problems = [];
	let file = '';
	for (const line of diff.split('\n')) {
		if (line.startsWith('diff --git ')) {
			file = / b\/(.+)$/.exec(line)?.[1] ?? '';
			continue;
		}
		if (!line || line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@') || line.startsWith('index ') || line.startsWith('\\') || line.startsWith(' ')) {
			continue;
		}
		if (line.startsWith('+') || line.startsWith('-')) {
			const body = line.slice(1);
			if (!/^stars:\s*\d+\s*$/.test(body)) {
				problems.push(`${file || '(unknown file)'}: ${line}`);
			}
		}
	}
	return problems;
}

export function parsePorcelain(porcelain) {
	const entries = [];
	for (const line of porcelain.split('\n')) {
		if (!line) continue;
		entries.push({ status: line.slice(0, 2), path: line.slice(3) });
	}
	return entries;
}

/**
 * @param {{ names: string[], projectDiff: string, porcelain: string }} input
 * @returns {{ ok: boolean, changed: boolean, errors: string[] }}
 */
export function reviewSyncChanges({ names, projectDiff, porcelain }) {
	const errors = [];
	for (const entry of parsePorcelain(porcelain)) {
		if (entry.path.includes(' -> ')) {
			errors.push(`renames are not part of the nightly sync: ${entry.path}`);
			continue;
		}
		if (!isAllowedPath(entry.path)) {
			errors.push(`unexpected path: ${entry.path}`);
			continue;
		}
		if (entry.status !== 'M ' && entry.status !== 'A ') {
			errors.push(`unexpected git status ${JSON.stringify(entry.status)} for ${entry.path}`);
		}
	}
	for (const name of names) {
		if (!isAllowedPath(name)) errors.push(`staged path is not a sync output: ${name}`);
	}
	for (const hunk of unexpectedStarsHunks(projectDiff)) {
		errors.push(`project yaml changed more than stars: ${hunk}`);
	}
	return { ok: errors.length === 0, changed: names.length > 0, errors };
}

function git(args) {
	return execFileSync('git', args, { encoding: 'utf8' });
}

function invokedDirectly() {
	const entry = process.argv[1];
	if (!entry) return false;
	try {
		return import.meta.url === pathToFileURL(realpathSync(entry)).href;
	} catch {
		return false;
	}
}

if (invokedDirectly()) {
	const names = git(['diff', '--cached', '--name-only', '-z']).split('\0').filter(Boolean);
	const projectDiff = git(['diff', '--cached', '-U0', '--', 'content/projects']);
	const porcelain = git(['status', '--porcelain', '-uall']);
	const result = reviewSyncChanges({ names, projectDiff, porcelain });
	if (!result.ok) {
		for (const error of result.errors) console.error(`[nightly-sync] ${error}`);
		process.exitCode = 1;
	} else if (!result.changed) {
		console.log('[nightly-sync] no content changes');
		process.exitCode = 2;
	} else {
		console.log(`[nightly-sync] ${names.length} file(s) ready to commit`);
	}
}
