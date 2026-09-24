/**
 * Sync GitHub data into the content root:
 *   - `github-activity.json` — the contribution calendar behind the projects-page graph
 *   - `stars` on every `projects/<locale>/*.yaml` entry that matches a repository
 *
 * Usage: npm run sync:github
 * Wired into `prebuild`, but never fails the build: on a network error it keeps the
 * previous snapshot and prints a warning.
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { siteConfig } from '../site.config.mjs';

const CONTRIBUTIONS_URL = (owner) => `https://github.com/users/${owner}/contributions`;
const REPOS_URL = (owner) => `https://api.github.com/users/${owner}/repos?per_page=100&sort=pushed`;
const USER_AGENT = 'refined-x-github-sync';

const activityFile = path.join(siteConfig.contentRoot, 'github-activity.json');

function resolveOwner() {
	const raw = siteConfig.social?.github;
	if (!raw) return null;
	try {
		const segments = new URL(raw).pathname.split('/').filter(Boolean);
		return segments[0] ?? null;
	} catch {
		return null;
	}
}

async function fetchText(url, accept) {
	const response = await fetch(url, {
		headers: { 'user-agent': USER_AGENT, accept },
		signal: AbortSignal.timeout(20_000),
	});
	if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`);
	return response.text();
}

function attribute(tag, name) {
	return new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1];
}

/** Parse GitHub's contribution calendar fragment into `{ date, level, count }` days. */
export function parseContributions(html) {
	const counts = new Map();
	for (const [, target, label] of html.matchAll(/<tool-tip[^>]*for="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g)) {
		const match = /^(\d+)\s+contribution/.exec(label.trim());
		counts.set(target, match ? Number(match[1]) : 0);
	}

	const days = [];
	for (const [tag] of html.matchAll(/<td[^>]*class="ContributionCalendar-day"[^>]*>/g)) {
		const date = attribute(tag, 'data-date');
		const level = attribute(tag, 'data-level');
		if (!date || level === undefined) continue;
		const id = attribute(tag, 'id') ?? '';
		days.push({ date, level: Number(level), count: counts.get(id) ?? 0 });
	}
	days.sort((a, b) => a.date.localeCompare(b.date));
	return days;
}

async function writeIfChanged(file, contents) {
	const previous = await readFile(file, 'utf8').catch(() => null);
	if (previous === contents) return false;
	await writeFile(file, contents, 'utf8');
	return true;
}

async function syncActivity(owner) {
	const html = await fetchText(CONTRIBUTIONS_URL(owner), 'text/html');
	const days = parseContributions(html);
	if (days.length === 0) throw new Error('contribution calendar parsed to zero days');

	const payload = {
		owner,
		syncedAt: new Date().toISOString().slice(0, 10),
		total: days.reduce((sum, day) => sum + day.count, 0),
		days,
	};
	const next = `${JSON.stringify(payload, null, '\t')}\n`;
	const changed = await writeIfChanged(activityFile, next);
	return changed ? `activity updated (${payload.total} contributions)` : 'activity unchanged';
}

/** Only the `stars` line is rewritten; every other field stays as authored. */
function withStars(source, stars) {
	if (/^stars:.*$/m.test(source)) {
		return source.replace(/^stars:.*$/m, `stars: ${stars}`);
	}
	if (/^status:.*$/m.test(source)) {
		return source.replace(/^status:.*$/m, (line) => `${line}\nstars: ${stars}`);
	}
	return `${source.replace(/\s*$/, '')}\nstars: ${stars}\n`;
}

async function syncStars(owner) {
	const repos = JSON.parse(await fetchText(REPOS_URL(owner), 'application/vnd.github+json'));
	if (!Array.isArray(repos)) throw new Error('repository list was not an array');
	const starsByUrl = new Map(repos.map((repo) => [String(repo.html_url).toLowerCase(), repo.stargazers_count]));

	let updated = 0;
	for (const locale of siteConfig.locales.list) {
		const dir = path.join(siteConfig.contentRoot, 'projects', locale);
		const files = await readdir(dir).catch(() => []);
		for (const file of files) {
			if (!/\.ya?ml$/i.test(file)) continue;
			const target = path.join(dir, file);
			const source = await readFile(target, 'utf8');
			const repository = /^repository:\s*(\S+)\s*$/m.exec(source)?.[1];
			if (!repository) continue;
			const stars = starsByUrl.get(repository.toLowerCase());
			if (stars === undefined || stars === null) continue;
			const next = withStars(source, stars);
			if (next !== source) {
				await writeFile(target, next, 'utf8');
				updated += 1;
			}
		}
	}
	return updated === 0 ? 'stars unchanged' : `stars updated in ${updated} file(s)`;
}

const owner = resolveOwner();
if (!owner) {
	console.warn('[sync:github] skipped: siteConfig.social.github is not set');
} else {
	for (const task of [syncActivity, syncStars]) {
		try {
			console.log(`[sync:github] ${await task(owner)}`);
		} catch (error) {
			console.warn(`[sync:github] ${task.name} failed, keeping previous data — ${error.message}`);
		}
	}
}
