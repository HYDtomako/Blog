export type PageStatsEvent = 'view' | 'like' | 'unlike';

export type PageStatsSnapshot = {
	path: string;
	views: number;
	likes: number;
	liked: boolean;
};

export type PageStatsLabels = {
	like: string;
	unlike: string;
};

export type PageStatsConfig = {
	path: string;
	endpoint: string;
	labels: PageStatsLabels;
};

export type PageStatsElements = {
	root: HTMLElement;
	views: HTMLElement | null;
	likes: HTMLElement | null;
	like: HTMLButtonElement | null;
};

const FALLBACK_LABELS: PageStatsLabels = { like: 'Like', unlike: 'Remove like' };

export function readPageStatsConfig(root: HTMLElement): PageStatsConfig | null {
	const path = root.dataset?.statsPath ?? '';
	if (!path) return null;
	let labels = FALLBACK_LABELS;
	try {
		const parsed = JSON.parse(root.dataset?.statsLabels ?? '{}') as Partial<PageStatsLabels>;
		labels = { ...labels, ...parsed };
	} catch {
		labels = FALLBACK_LABELS;
	}
	return { path, endpoint: root.dataset?.statsEndpoint || '/api/stats/page', labels };
}

export function parsePageStatsSnapshot(value: unknown, fallbackPath: string): PageStatsSnapshot | null {
	if (!value || typeof value !== 'object') return null;
	const data = value as Record<string, unknown>;
	if (typeof data.views !== 'number' || typeof data.likes !== 'number') return null;
	return {
		path: typeof data.path === 'string' ? data.path : fallbackPath,
		views: data.views,
		likes: data.likes,
		liked: data.liked === true,
	};
}

export async function requestPageStats(
	config: PageStatsConfig,
	event: PageStatsEvent,
	fetchImpl: typeof fetch,
): Promise<PageStatsSnapshot | null> {
	try {
		const response = await fetchImpl(config.endpoint, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ path: config.path, event }),
			keepalive: true,
		});
		if (!response.ok) return null;
		return parsePageStatsSnapshot(await response.json(), config.path);
	} catch {
		return null;
	}
}

export function renderPageStats(
	elements: PageStatsElements,
	snapshot: PageStatsSnapshot,
	labels: PageStatsLabels,
) {
	elements.root.hidden = false;
	if (elements.views) elements.views.textContent = String(snapshot.views);
	if (elements.likes) elements.likes.textContent = String(snapshot.likes);
	if (!elements.like) return;
	const label = snapshot.liked ? labels.unlike : labels.like;
	elements.like.setAttribute('aria-pressed', String(snapshot.liked));
	elements.like.setAttribute('aria-label', label);
	elements.like.setAttribute('title', label);
}

export function shouldCountView(doc: Document) {
	const view = doc.defaultView;
	const host = view?.location?.hostname ?? '';
	if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false;
	const navigator = view?.navigator as (Navigator & { webdriver?: boolean }) | undefined;
	return navigator?.webdriver !== true;
}

export function initPageStats(doc: Document = document, fetchImpl: typeof fetch = fetch) {
	const root = doc.querySelector<HTMLElement>('[data-page-stats]');
	if (!root) return;
	const config = readPageStatsConfig(root);
	if (!config) return;
	const elements: PageStatsElements = {
		root,
		views: root.querySelector<HTMLElement>('[data-stats-views]'),
		likes: root.querySelector<HTMLElement>('[data-stats-likes]'),
		like: root.querySelector<HTMLButtonElement>('[data-stats-like]'),
	};
	let snapshot: PageStatsSnapshot | null = null;
	const apply = (next: PageStatsSnapshot) => {
		snapshot = next;
		renderPageStats(elements, next, config.labels);
	};
	if (shouldCountView(doc)) {
		void requestPageStats(config, 'view', fetchImpl).then((next) => {
			if (next) apply(next);
		});
	}
	const button = elements.like;
	if (!button) return;
	button.addEventListener('click', () => {
		if (button.getAttribute('aria-disabled') === 'true') return;
		button.setAttribute('aria-disabled', 'true');
		void requestPageStats(config, snapshot?.liked ? 'unlike' : 'like', fetchImpl).then((next) => {
			button.removeAttribute('aria-disabled');
			if (next) apply(next);
		});
	});
}
