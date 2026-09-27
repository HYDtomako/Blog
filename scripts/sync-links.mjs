/**
 * Enrich `content/links.json` with the head tags of every linked site:
 *   - `name` from og:title → <title> → domain
 *   - `description` from og:description → meta description
 *   - `icon` from the icon rel chain → /favicon.ico
 *
 * Usage: npm run sync:links
 * Wired into `prebuild`, but never fails the build: authored fields always win,
 * an unreachable site keeps its previous values and only prints a warning.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { siteConfig } from '../site.config.mjs';
import { mergeLinkMetadata, parseHtmlMetadata } from '../shared/link-metadata.ts';

const FILE_NAME = 'links.json';
const USER_AGENT = 'refined-x-links-sync';
const CONCURRENCY = 4;
const MAX_HTML_BYTES = 512 * 1024;

const linksFile = path.join(siteConfig.contentRoot, FILE_NAME);

/** Authored file order is preserved; the caller only ever sees entries carrying a url. */
export function readEntries(value) {
	if (!Array.isArray(value)) return [];
	return value.filter((item) => typeof item === 'object' && item !== null && typeof item.url === 'string');
}

async function fetchMetadata(url) {
	const response = await fetch(url, {
		headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
		signal: AbortSignal.timeout(8000),
	});
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	const type = response.headers.get('content-type') ?? '';
	if (!type.includes('html')) throw new Error(`content-type ${type || 'unknown'} is not html`);
	const html = (await response.text()).slice(0, MAX_HTML_BYTES);
	return parseHtmlMetadata(html, response.url || url);
}

async function syncEntry(entry) {
	try {
		const metadata = await fetchMetadata(entry.url);
		return mergeLinkMetadata(entry, metadata);
	} catch (error) {
		console.warn(`[sync:links] ${entry.url} skipped, keeping previous data — ${error.message}`);
		return entry;
	}
}

async function run() {
	const previous = await readFile(linksFile, 'utf8').catch(() => null);
	if (previous === null) {
		console.warn(`[sync:links] skipped: ${linksFile} does not exist`);
		return;
	}
	const entries = readEntries(JSON.parse(previous));
	if (entries.length === 0) {
		console.log('[sync:links] no links to sync');
		return;
	}

	const results = [];
	for (let start = 0; start < entries.length; start += CONCURRENCY) {
		const batch = entries.slice(start, start + CONCURRENCY);
		results.push(...(await Promise.all(batch.map((entry) => syncEntry(entry)))));
	}

	const next = `${JSON.stringify(results, null, '\t')}\n`;
	if (next === previous) {
		console.log(`[sync:links] unchanged (${entries.length} link${entries.length === 1 ? '' : 's'})`);
		return;
	}
	await writeFile(linksFile, next, 'utf8');
	console.log(`[sync:links] metadata updated for ${entries.length} link${entries.length === 1 ? '' : 's'}`);
}

await run();
