export type SiteStatsSnapshot = {
	views: number;
	likes: number;
	pages: number;
};

export function parseSiteStatsSnapshot(value: unknown): SiteStatsSnapshot | null {
	if (!value || typeof value !== 'object') return null;
	const data = value as Record<string, unknown>;
	if (typeof data.views !== 'number') return null;
	return {
		views: data.views,
		likes: typeof data.likes === 'number' ? data.likes : 0,
		pages: typeof data.pages === 'number' ? data.pages : 0,
	};
}

export function formatStatNumber(value: number, locale: string) {
	try {
		return new Intl.NumberFormat(locale || 'en').format(value);
	} catch {
		return String(value);
	}
}

export async function requestSiteStats(
	endpoint: string,
	fetchImpl: typeof fetch,
): Promise<SiteStatsSnapshot | null> {
	try {
		const response = await fetchImpl(endpoint, { headers: { accept: 'application/json' } });
		if (!response.ok) return null;
		return parseSiteStatsSnapshot(await response.json());
	} catch {
		return null;
	}
}

export function initSiteStats(doc: Document = document, fetchImpl: typeof fetch = fetch) {
	const root = doc.querySelector<HTMLElement>('[data-site-stats]');
	if (!root) return;
	const endpoint = root.dataset?.statsEndpoint || '/api/stats/total';
	const locale = root.dataset?.statsLocale || 'en';
	const target = root.querySelector<HTMLElement>('[data-stats-total]');
	const note = root.querySelector<HTMLElement>('[data-stats-note]');
	void requestSiteStats(endpoint, fetchImpl).then((snapshot) => {
		if (!snapshot) {
			if (note) note.hidden = false;
			return;
		}
		if (target) target.textContent = formatStatNumber(snapshot.views, locale);
		if (note) note.hidden = true;
	});
}
