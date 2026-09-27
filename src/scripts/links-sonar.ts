export type LinksErrorCode =
	| 'invalid_url'
	| 'signal_lost'
	| 'rate_limited'
	| 'links_unavailable'
	| 'invalid_content_type'
	| 'invalid_body'
	| 'method_not_allowed'
	| 'unavailable';

/** Strings the sonar and the wall need at runtime; the rest ships server-rendered. */
export type LinksLabels = {
	connect: string;
	connecting: string;
	received: string;
	receivedNote: string;
	wallLoading: string;
	wallEmpty: string;
	wallFailed: string;
	wallWaiting: string;
	wallJoined: string;
	errorTitle: string;
	openSiteTemplate: string;
	errors: Record<LinksErrorCode, string>;
};

export type LinksConfig = { endpoint: string; labels: LinksLabels; joined: Set<string> };

export type LinksSubmission = {
	url: string;
	name: string;
	description: string;
	icon: string;
	domain: string;
	createdAt: string;
};

export type ParsedSubmit = { ok: true; submission: LinksSubmission } | { ok: false; code: LinksErrorCode };

export type ParsedWall = { submissions: LinksSubmission[]; total: number };

export type CardPlacement = { x: number; y: number; side: 'left' | 'right'; linkY: number };

export type PointerKind = 'fine' | 'coarse';

const FALLBACK_CARD_WIDTH = 248;
const FALLBACK_CARD_HEIGHT = 116;
const CARD_GAP = 14;
const ERROR_CODES: LinksErrorCode[] = [
	'invalid_url',
	'signal_lost',
	'rate_limited',
	'links_unavailable',
	'invalid_content_type',
	'invalid_body',
	'method_not_allowed',
	'unavailable',
];

/** English fallbacks for a page whose label payload failed to parse; the markup carries the real copy. */
export const FALLBACK_LABELS: LinksLabels = {
	connect: 'CONNECT',
	connecting: 'CONNECTING…',
	received: 'SIGNAL RECEIVED',
	receivedNote: 'It is on the wall below now.',
	wallLoading: 'Loading signals…',
	wallEmpty: 'No signals yet. Be the first.',
	wallFailed: 'The signal wall is unavailable right now.',
	wallWaiting: 'waiting',
	wallJoined: 'on the sonar',
	errorTitle: 'SIGNAL LOST',
	openSiteTemplate: 'Open __NAME__',
	errors: {
		invalid_url: 'That does not look like a website address. Check it and try again.',
		signal_lost: 'Unable to reach this site. Please check the URL and try again.',
		rate_limited: 'Too many signals at once. Try again in a moment.',
		links_unavailable: 'Signal submissions are unavailable right now.',
		invalid_content_type: 'The request format was rejected. Refresh the page and retry.',
		invalid_body: 'That submission did not go through. Try again shortly.',
		method_not_allowed: 'That submission did not go through. Try again shortly.',
		unavailable: 'Signal submissions are unavailable right now.',
	},
};

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

function isErrorCode(value: unknown): value is LinksErrorCode {
	return typeof value === 'string' && (ERROR_CODES as string[]).includes(value);
}

export function applyTemplate(template: string, token: string, value: string): string {
	return template.split(token).join(value);
}

export function readLinksConfig(root: HTMLElement): LinksConfig | null {
	const dataset = root.dataset;
	if (!dataset || dataset.linksSonar === undefined) return null;
	let labels = FALLBACK_LABELS;
	try {
		const parsed = JSON.parse(dataset.linksLabels ?? '{}') as Partial<LinksLabels>;
		labels = {
			...FALLBACK_LABELS,
			...parsed,
			errors: { ...FALLBACK_LABELS.errors, ...(parsed.errors ?? {}) },
		};
	} catch {
		labels = FALLBACK_LABELS;
	}
	let joined: Set<string> = new Set();
	try {
		const parsed = JSON.parse(dataset.linksJoined ?? '[]') as unknown;
		if (Array.isArray(parsed)) joined = new Set(parsed.filter((url): url is string => typeof url === 'string'));
	} catch {
		joined = new Set();
	}
	return { endpoint: dataset.linksEndpoint ?? '', labels, joined };
}

/** A tap on a touch device opens the card first; the next tap follows the link. */
export function nextSignalAction(pointer: PointerKind, open: boolean): 'open' | 'follow' {
	if (pointer === 'fine') return 'follow';
	return open ? 'follow' : 'open';
}

/**
 * Keeps the card inside the stage and on the side of the dot that has room,
 * so a tooltip is never clipped and never runs off a narrow screen.
 * The offsets are relative to the dot, because that is what the card is positioned from.
 */
export function cardPlacement(options: {
	signalX: number;
	signalY: number;
	stageWidth: number;
	stageHeight: number;
	cardWidth?: number;
	cardHeight?: number;
	gap?: number;
}): CardPlacement {
	const gap = options.gap ?? CARD_GAP;
	const cardWidth = options.cardWidth && options.cardWidth > 0 ? options.cardWidth : FALLBACK_CARD_WIDTH;
	const cardHeight = options.cardHeight && options.cardHeight > 0 ? options.cardHeight : FALLBACK_CARD_HEIGHT;
	const dotX = options.signalX * options.stageWidth;
	const dotY = options.signalY * options.stageHeight;

	const rightX = dotX + gap;
	const leftX = dotX - gap - cardWidth;
	let side: 'left' | 'right' = options.signalX <= 0.5 ? 'right' : 'left';
	if (side === 'right' && rightX + cardWidth > options.stageWidth + 0.5) side = 'left';
	else if (side === 'left' && leftX < -0.5) side = 'right';

	const absoluteX = clamp(side === 'right' ? rightX : leftX, 0, Math.max(0, options.stageWidth - cardWidth));
	const absoluteY = clamp(dotY - cardHeight / 2, 0, Math.max(0, options.stageHeight - cardHeight));
	return {
		x: absoluteX - dotX,
		y: absoluteY - dotY,
		side,
		// Where the hairline leaves the card: the dot's own height, kept inside the card.
		linkY: clamp(dotY - absoluteY, 6, Math.max(6, cardHeight - 6)),
	};
}

/** One row of the wall, as the API describes it. */
export function parseSubmission(value: unknown): LinksSubmission | null {
	if (!value || typeof value !== 'object') return null;
	const data = value as Record<string, unknown>;
	if (typeof data.url !== 'string' || typeof data.name !== 'string' || typeof data.domain !== 'string') return null;
	return {
		url: data.url,
		name: data.name,
		description: typeof data.description === 'string' ? data.description : '',
		icon: typeof data.icon === 'string' ? data.icon : '',
		domain: data.domain,
		createdAt: typeof data.createdAt === 'string' ? data.createdAt : '',
	};
}

export function parseWall(value: unknown): ParsedWall | null {
	if (!value || typeof value !== 'object') return null;
	const data = value as Record<string, unknown>;
	const raw = Array.isArray(data.submissions) ? data.submissions : null;
	if (raw === null) return null;
	const submissions = raw.map(parseSubmission).filter((item): item is LinksSubmission => item !== null);
	return { submissions, total: typeof data.total === 'number' ? data.total : submissions.length };
}

/** Everything the submit route answers with, including its documented failures. */
export function parseSubmitResponse(value: unknown): ParsedSubmit {
	if (!value || typeof value !== 'object') return { ok: false, code: 'unavailable' };
	const record = value as Record<string, unknown>;
	const error = record.error as { code?: unknown } | null | undefined;
	if (error && typeof error === 'object') {
		return { ok: false, code: isErrorCode(error.code) ? error.code : 'unavailable' };
	}
	const submission = parseSubmission(record);
	return submission === null ? { ok: false, code: 'unavailable' } : { ok: true, submission };
}

/** `2026-09-27 04:10:11` from D1 → the date the wall shows. */
export function submissionDate(createdAt: string): string {
	return createdAt.slice(0, 10);
}

export function fillSubmissionRow(
	row: HTMLElement,
	submission: LinksSubmission,
	joined: boolean,
	labels: LinksLabels,
): void {
	row.querySelectorAll<HTMLElement>('[data-links-field]').forEach((field) => {
		const key = field.dataset.linksField ?? '';
		if (key === 'name') field.textContent = submission.name;
		if (key === 'domain') field.textContent = submission.domain;
		if (key === 'date') field.textContent = submissionDate(submission.createdAt);
		if (key === 'state') field.textContent = joined ? labels.wallJoined : labels.wallWaiting;
		if (key === 'initial') field.textContent = submission.name.slice(0, 1).toUpperCase();
		if (key === 'icon') {
			const image = field as HTMLImageElement;
			if (submission.icon === '') {
				image.hidden = true;
			} else {
				image.src = submission.icon;
				image.hidden = false;
			}
		}
	});
	row.dataset.joined = joined ? 'true' : 'false';
	const link = row.querySelector<HTMLElement>('.ls-row-link') ?? row;
	link.setAttribute('href', submission.url);
	link.setAttribute('aria-label', applyTemplate(labels.openSiteTemplate, '__NAME__', submission.name));
}

type LinksDocument = Pick<Document, 'querySelector' | 'addEventListener'>;

export function initLinksSonar(
	doc: LinksDocument = document,
	win: Window = window,
	fetchImpl: typeof fetch = fetch,
): void {
	const root = doc.querySelector<HTMLElement>('[data-links-sonar]');
	const stage = root?.querySelector<HTMLElement>('[data-links-stage]');
	if (!root || !stage) return;

	const config = readLinksConfig(root);
	const labels = config?.labels ?? FALLBACK_LABELS;
	const endpoint = config?.endpoint ?? '';
	const joined = config?.joined ?? new Set<string>();
	const finePointer = win.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches ?? true;
	const pointerKind: PointerKind = finePointer ? 'fine' : 'coarse';
	let open: HTMLElement | null = null;

	const close = () => {
		if (!open) return;
		open.removeAttribute('data-open');
		open = null;
		delete stage.dataset.active;
	};

	const openCard = (signal: HTMLElement) => {
		const card = signal.querySelector<HTMLElement>('.ls-card');
		if (card === null) return;
		const placement = cardPlacement({
			signalX: Number(signal.dataset.x ?? 0.5),
			signalY: Number(signal.dataset.y ?? 0.5),
			stageWidth: stage.clientWidth || 0,
			stageHeight: stage.clientHeight || 0,
			cardWidth: card.offsetWidth || 0,
			cardHeight: card.offsetHeight || 0,
		});
		signal.style.setProperty('--ls-card-x', `${Math.round(placement.x)}px`);
		signal.style.setProperty('--ls-card-y', `${Math.round(placement.y)}px`);
		signal.style.setProperty('--ls-link-y', `${Math.round(placement.linkY)}px`);
		signal.dataset.cardSide = placement.side;
		if (open && open !== signal) open.removeAttribute('data-open');
		signal.dataset.open = 'true';
		stage.dataset.active = 'true';
		open = signal;
	};

	for (const signal of Array.from(stage.querySelectorAll<HTMLElement>('[data-links-signal]'))) {
		if (finePointer) {
			signal.addEventListener('pointerenter', () => openCard(signal));
			signal.addEventListener('pointerleave', close);
		}
		signal.addEventListener('focusin', () => openCard(signal));
		signal.addEventListener('focusout', close);
		signal.addEventListener('click', (event) => {
			if (nextSignalAction(pointerKind, signal.dataset.open === 'true') === 'open') {
				event.preventDefault();
				openCard(signal);
			}
		});
	}

	doc.addEventListener('keydown', (event) => {
		if ((event as KeyboardEvent).key === 'Escape') close();
	});
	doc.addEventListener('pointerdown', (event) => {
		const target = event.target as Node | null;
		if (open && target && !open.contains(target) && !stage.contains(target)) close();
	});

	const form = root.querySelector<HTMLFormElement>('[data-links-form]');
	const input = root.querySelector<HTMLInputElement>('[data-links-input]');
	const submitButton = root.querySelector<HTMLButtonElement>('[data-links-submit]');
	const status = root.querySelector<HTMLElement>('[data-links-status]');
	const cta = root.querySelector<HTMLElement>('[data-links-cta]');
	const wallRoot = root.querySelector<HTMLElement>('[data-links-wall]');
	const wallList = root.querySelector<HTMLElement>('[data-links-wall-list]');
	const wallStatus = root.querySelector<HTMLElement>('[data-links-wall-status]');
	const wallEmpty = root.querySelector<HTMLElement>('[data-links-wall-empty]');
	const wallTemplate = root.querySelector<HTMLTemplateElement>('[data-links-wall-template]');
	if (endpoint === '' || !wallList || !wallStatus || !wallTemplate) return;

	const setStatus = (state: 'idle' | 'pending' | 'ok' | 'error', text: string) => {
		if (!status) return;
		status.dataset.state = state;
		status.textContent = text;
	};

	const setWallStatus = (text: string) => {
		wallStatus.textContent = text;
	};

	const errorText = (code: LinksErrorCode) => {
		const message = labels.errors[code] ?? labels.errors.unavailable;
		return code === 'signal_lost' ? `${labels.errorTitle} — ${message}` : message;
	};

	const createRow = (submission: LinksSubmission): HTMLElement | null => {
		const source = wallTemplate.content?.firstElementChild;
		if (!source) return null;
		const row = source.cloneNode(true) as HTMLElement;
		fillSubmissionRow(row, submission, joined.has(submission.url), labels);
		return row;
	};

	const renderWall = (submissions: LinksSubmission[]) => {
		wallList.textContent = '';
		for (const submission of submissions) {
			const row = createRow(submission);
			if (row) wallList.append(row);
		}
		const empty = submissions.length === 0;
		wallEmpty?.toggleAttribute('hidden', !empty);
		wallList.hidden = empty;
		setWallStatus('');
	};

	const requestWall = async () => {
		setWallStatus(labels.wallLoading);
		let response: Response;
		try {
			response = await fetchImpl(endpoint, { headers: { accept: 'application/json' } });
		} catch {
			setWallStatus(labels.wallFailed);
			wallList.hidden = true;
			return;
		}
		// No route behind this build (a purely static deployment): take the invitation away
		// instead of leaving a broken box on the page.
		if (response.status === 404 || response.status === 405) {
			setWallStatus('');
			cta?.setAttribute('hidden', '');
			wallRoot?.setAttribute('hidden', '');
			// Only the developer sees this; visitors just get the clean page.
			console.info(
				'[links] /api/links is missing from this deployment, so the composer and the wall stay hidden. Run `npm run dev:worker` to exercise them locally, or deploy the site Worker.',
			);
			return;
		}
		const payload = await response.json().catch(() => null);
		const wall = response.ok ? parseWall(payload) : null;
		if (wall === null) {
			setWallStatus(labels.wallFailed);
			wallList.hidden = true;
			return;
		}
		renderWall(wall.submissions);
	};

	const addWallRow = (submission: LinksSubmission) => {
		const row = createRow(submission);
		if (!row) return;
		wallEmpty?.setAttribute('hidden', '');
		wallList.hidden = false;
		wallList.prepend(row);
		setWallStatus('');
	};

	if (form && input && submitButton) {
		form.addEventListener('submit', (event) => {
			event.preventDefault();
			const raw = input.value.trim();
			const submitTo = async () => {
				setStatus('pending', labels.connecting);
				submitButton.disabled = true;
				try {
					const response = await fetchImpl(endpoint, {
						method: 'POST',
						headers: { 'content-type': 'application/json', accept: 'application/json' },
						body: JSON.stringify({ url: raw }),
					});
					const payload = await response.json().catch(() => null);
					const parsed = parseSubmitResponse(payload);
					if (!parsed.ok) {
						input.setAttribute('aria-invalid', 'true');
						setStatus('error', errorText(parsed.code));
						return;
					}
					input.removeAttribute('aria-invalid');
					input.value = '';
					addWallRow(parsed.submission);
					setStatus('ok', `${labels.received} — ${labels.receivedNote}`);
				} catch {
					setStatus('error', errorText('unavailable'));
				} finally {
					submitButton.disabled = false;
				}
			};
			void submitTo();
		});
	}

	void requestWall();
}
