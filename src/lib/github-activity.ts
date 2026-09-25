import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { siteConfig } from '../../site.config.mjs';

export interface GitHubActivityDay {
	date: string;
	level: number;
	count: number;
}

export interface GitHubActivity {
	owner: string;
	syncedAt: string;
	total: number;
	days: GitHubActivityDay[];
}

/** Contribution snapshot written by `npm run sync:github`; `null` when never synced. */
export async function getGitHubActivity(): Promise<GitHubActivity | null> {
	try {
		const raw = await readFile(path.join(siteConfig.contentRoot, 'github-activity.json'), 'utf8');
		const parsed = JSON.parse(raw) as GitHubActivity;
		if (!Array.isArray(parsed?.days) || parsed.days.length === 0) return null;
		return parsed;
	} catch {
		return null;
	}
}
