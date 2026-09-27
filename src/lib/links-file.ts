import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { siteConfig } from '../../site.config.mjs';
import { readLinkEntries } from './links';
import type { LinkEntry } from '../../shared/link-metadata.ts';

/** `content/links.json` as authored: a missing file or a broken row degrades, it never throws. */
export async function readLinks(): Promise<LinkEntry[]> {
	try {
		const raw = await readFile(path.join(siteConfig.contentRoot, 'links.json'), 'utf8');
		return readLinkEntries(JSON.parse(raw));
	} catch {
		return [];
	}
}
