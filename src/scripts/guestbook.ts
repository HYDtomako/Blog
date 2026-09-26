export type GuestbookErrorCode =
	| 'invalid_message'
	| 'message_too_long'
	| 'rate_limited'
	| 'not_author'
	| 'message_not_found'
	| 'guestbook_unavailable'
	| 'invalid_content_type';

export type GuestbookReply = {
	id: number;
	body: string;
	handle: string;
	mine: boolean;
	createdAt: string;
	likes: number;
	liked: boolean;
};

export type GuestbookMessage = GuestbookReply & {
	replyCount: number;
	replies: GuestbookReply[];
};

export type GuestbookThread = {
	messages: GuestbookMessage[];
	nextBefore: number | null;
	total: number;
};

export type GuestbookFailure = {
	code: string;
	message: string;
	retryAfter: number | null;
};

export type GuestbookResult<T> = { ok: true; data: T } | { ok: false; failure: GuestbookFailure };

/**
 * Strings the board needs at runtime, serialized by `GuestbookBoard.astro` into
 * `data-guestbook-labels`. Parameterized copy travels as `__TOKEN__` templates.
 */
export type GuestbookLabels = {
	empty: string;
	failed: string;
	send: string;
	sending: string;
	justNow: string;
	reply: string;
	cancelReply: string;
	likeAction: string;
	unlikeAction: string;
	mine: string;
	retract: string;
	retracted: string;
	tooLong: string;
	sendFailed: string;
	slowDown: string;
	counterTemplate: string;
	guestTemplate: string;
	replyingToTemplate: string;
	replyCountTemplate: string;
	showingLatestTemplate: string;
	slowDownInTemplate: string;
	errors: Partial<Record<GuestbookErrorCode, string>>;
};

export type GuestbookConfig = {
	endpoint: string;
	locale: string;
	labels: GuestbookLabels;
};

export type GuestbookRow = {
	message: GuestbookMessage;
	row: HTMLElement;
	replies: HTMLElement;
	hint: HTMLElement;
	replyRows: Map<number, HTMLElement>;
};

export type GuestbookRowContext = {
	locale: string;
	labels: GuestbookLabels;
	now: Date;
	onLike: (reply: GuestbookReply, button: HTMLButtonElement) => void;
	onReply: (target: { threadId: number; handle: string; mention: boolean }) => void;
	onRetract: (reply: GuestbookReply, row: HTMLElement) => void;
};

export const MAX_MESSAGE_LENGTH = 500;
export const PAGE_SIZE = 20;
export const RETRACT_WINDOW_MS = 10 * 60 * 1000;
export const MAX_TEXTAREA_ROWS = 8;
export const DEFAULT_EMOJI_COLUMNS = 8;

const RELATIVE_LIMIT_MS = 7 * 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const DEFAULT_LINE_HEIGHT = 24;
const SVG_NS = 'http://www.w3.org/2000/svg';
const HEART_PATH =
	'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z';

const FALLBACK_LABELS: GuestbookLabels = {
	empty: 'No messages yet. Be the first.',
	failed: 'The guestbook could not load.',
	send: 'Send',
	sending: 'Sending…',
	justNow: 'Just now',
	reply: 'Reply',
	cancelReply: 'Cancel reply',
	likeAction: 'Like',
	unlikeAction: 'Remove like',
	mine: 'You',
	retract: 'Retract',
	retracted: 'Message retracted.',
	tooLong: 'This message is over the limit.',
	sendFailed: 'The message was not sent.',
	slowDown: 'Slow down a little and try again in a moment.',
	counterTemplate: '__USED__ / __MAX__',
	guestTemplate: 'Guest __HANDLE__',
	replyingToTemplate: 'Replying to __HANDLE__',
	replyCountTemplate: '__COUNT__ replies',
	showingLatestTemplate: 'Showing the latest __COUNT__ replies',
	slowDownInTemplate: 'Slow down a little. Try again in __SECONDS__ seconds.',
	errors: {
		invalid_message: 'That message did not look right.',
		message_too_long: 'This message is over the limit.',
		rate_limited: 'Slow down a little and try again in a moment.',
		not_author: 'You can only retract your own messages.',
		message_not_found: 'That message is gone.',
		guestbook_unavailable: 'The guestbook is temporarily unavailable.',
		invalid_content_type: 'The request format was rejected.',
	},
};

const GENERIC_FAILURE: GuestbookFailure = { code: '', message: '', retryAfter: null };

export function applyTemplate(template: string, tokens: Record<string, string | number>) {
	return template.replace(/__([A-Z_]+)__/g, (match, name: string) =>
		name in tokens ? String(tokens[name]) : match,
	);
}

export function countCodePoints(value: string) {
	return [...value].length;
}

export function gridColumnCount(value: string, fallback: number = DEFAULT_EMOJI_COLUMNS) {
	const tracks = value
		.split(/\s+/)
		.filter((track) => /^[\d.]+(?:px|em|rem|ch|vh|vw|%)?$/.test(track));
	return tracks.length > 0 ? tracks.length : fallback;
}

export function nextTextareaHeight(scrollHeight: number, lineHeight: number, maxRows: number) {
	const rowHeight = lineHeight > 0 ? lineHeight : DEFAULT_LINE_HEIGHT;
	return Math.min(Math.max(scrollHeight, rowHeight), rowHeight * Math.max(maxRows, 1));
}

export function insertAtCaret(value: string, start: number, end: number, insert: string) {
	const safeStart = Math.min(Math.max(start, 0), value.length);
	const safeEnd = Math.min(Math.max(end, safeStart), value.length);
	return {
		value: `${value.slice(0, safeStart)}${insert}${value.slice(safeEnd)}`,
		caret: safeStart + insert.length,
	};
}

/** The API sends UTC `'YYYY-MM-DD HH:MM:SS'` with no zone marker. */
export function parseUtcTimestamp(value: string): Date | null {
	if (!value) return null;
	const normalized = value.trim().replace(' ', 'T');
	const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized) ? normalized : `${normalized}Z`;
	const date = new Date(zoned);
	return Number.isNaN(date.getTime()) ? null : date;
}

function relativeFormatter(locale: string) {
	try {
		return new Intl.RelativeTimeFormat(locale || 'en', { numeric: 'auto' });
	} catch {
		return new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
	}
}

function absoluteFormatter(locale: string) {
	try {
		return new Intl.DateTimeFormat(locale || 'en', { dateStyle: 'medium', timeStyle: 'short' });
	} catch {
		return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });
	}
}

function relativeUnit(diffMs: number): { unit: Intl.RelativeTimeFormatUnit; value: number } {
	const magnitude = Math.abs(diffMs);
	if (magnitude < MINUTE_MS) return { unit: 'second', value: Math.trunc(diffMs / 1000) };
	if (magnitude < HOUR_MS) return { unit: 'minute', value: Math.trunc(diffMs / MINUTE_MS) };
	if (magnitude < DAY_MS) return { unit: 'hour', value: Math.trunc(diffMs / HOUR_MS) };
	return { unit: 'day', value: Math.trunc(diffMs / DAY_MS) };
}

export function formatRelativeTime(
	createdAt: string,
	locale: string,
	now: Date = new Date(),
	justNow = '',
): { text: string; absolute: string; datetime: string; relative: boolean } {
	const date = parseUtcTimestamp(createdAt);
	if (!date) return { text: createdAt, absolute: createdAt, datetime: '', relative: false };
	const absolute = absoluteFormatter(locale).format(date);
	const datetime = date.toISOString();
	const diff = date.getTime() - now.getTime();
	if (Math.abs(diff) >= RELATIVE_LIMIT_MS) return { text: absolute, absolute, datetime, relative: false };
	if (justNow !== '' && Math.abs(diff) < MINUTE_MS) {
		return { text: justNow, absolute, datetime, relative: true };
	}
	const { unit, value } = relativeUnit(diff);
	return { text: relativeFormatter(locale).format(value, unit), absolute, datetime, relative: true };
}

const AVATAR_TINTS = [8, 16, 24, 34, 44, 58] as const;

export function avatarTint(id: number) {
	return AVATAR_TINTS[Math.abs(Math.trunc(id)) % AVATAR_TINTS.length];
}

export function avatarTintStyle(id: number) {
	return `color-mix(in srgb, var(--ink) ${avatarTint(id)}%, var(--surface))`;
}

export function avatarInitial(body: string) {
	return [...body.trim()][0] ?? '';
}

export function replyPrefix(handle: string) {
	return handle ? `@${handle} ` : '';
}

export function nextReplyBody(handle: string, body: string) {
	const prefix = replyPrefix(handle);
	const trimmed = body.replace(/^\s+/, '');
	if (!prefix || trimmed.startsWith(prefix)) return body;
	return `${prefix}${trimmed}`;
}

export function stripReplyPrefix(handle: string, body: string) {
	const prefix = replyPrefix(handle);
	const trimmed = body.replace(/^\s+/, '');
	return prefix && trimmed.startsWith(prefix) ? trimmed.slice(prefix.length) : body;
}

export function isRetractable(
	message: Pick<GuestbookReply, 'mine' | 'createdAt'>,
	now: Date = new Date(),
) {
	if (!message.mine) return false;
	const created = parseUtcTimestamp(message.createdAt);
	if (!created) return false;
	return now.getTime() - created.getTime() < RETRACT_WINDOW_MS;
}

export function messageHandleLabel(message: Pick<GuestbookReply, 'handle' | 'mine'>, labels: GuestbookLabels) {
	if (message.mine) return labels.mine;
	return applyTemplate(labels.guestTemplate, { HANDLE: message.handle });
}

export function resolveErrorMessage(code: string | undefined, labels: GuestbookLabels) {
	if (code && code in labels.errors) return labels.errors[code as GuestbookErrorCode] ?? labels.sendFailed;
	return labels.sendFailed;
}

export function readGuestbookConfig(root: HTMLElement): GuestbookConfig | null {
	const endpoint = root.dataset?.guestbookEndpoint ?? '';
	if (!endpoint) return null;
	let labels = FALLBACK_LABELS;
	try {
		const parsed = JSON.parse(root.dataset?.guestbookLabels ?? '{}') as Partial<GuestbookLabels>;
		labels = {
			...FALLBACK_LABELS,
			...parsed,
			errors: { ...FALLBACK_LABELS.errors, ...(parsed.errors ?? {}) },
		};
	} catch {
		labels = FALLBACK_LABELS;
	}
	return { endpoint, locale: root.dataset?.guestbookLocale || 'en', labels };
}

export function parseReply(value: unknown): GuestbookReply | null {
	if (!value || typeof value !== 'object') return null;
	const data = value as Record<string, unknown>;
	if (typeof data.id !== 'number' || typeof data.body !== 'string') return null;
	return {
		id: data.id,
		body: data.body,
		handle: typeof data.handle === 'string' ? data.handle : '',
		mine: data.mine === true,
		createdAt: typeof data.createdAt === 'string' ? data.createdAt : '',
		likes: typeof data.likes === 'number' ? data.likes : 0,
		liked: data.liked === true,
	};
}

export function parseMessage(value: unknown): GuestbookMessage | null {
	const reply = parseReply(value);
	if (!reply) return null;
	const data = value as Record<string, unknown>;
	const replies = Array.isArray(data.replies)
		? data.replies
				.map(parseReply)
				.filter((item): item is GuestbookReply => item !== null)
		: [];
	return {
		...reply,
		replyCount: typeof data.replyCount === 'number' ? data.replyCount : replies.length,
		replies,
	};
}

export function parseThread(value: unknown): GuestbookThread | null {
	if (!value || typeof value !== 'object') return null;
	const data = value as Record<string, unknown>;
	if (!Array.isArray(data.messages)) return null;
	const messages = data.messages
		.map(parseMessage)
		.filter((item): item is GuestbookMessage => item !== null);
	return {
		messages,
		nextBefore: typeof data.nextBefore === 'number' ? data.nextBefore : null,
		total: typeof data.total === 'number' ? data.total : messages.length,
	};
}

function readFailure(payload: unknown, response: Response): GuestbookFailure {
	const error = (payload as { error?: { code?: unknown; message?: unknown } } | null)?.error;
	const retryAfterRaw = response.headers?.get?.('retry-after') ?? '';
	const retryAfter = Number.parseInt(retryAfterRaw, 10);
	return {
		code: typeof error?.code === 'string' ? error.code : '',
		message: typeof error?.message === 'string' ? error.message : '',
		retryAfter: Number.isFinite(retryAfter) ? retryAfter : null,
	};
}

function jsonRequest(payload: unknown): RequestInit {
	return {
		method: 'POST',
		headers: { 'content-type': 'application/json', accept: 'application/json' },
		body: JSON.stringify(payload),
	};
}

async function requestJson(
	url: string,
	init: RequestInit | undefined,
	fetchImpl: typeof fetch,
): Promise<GuestbookResult<unknown>> {
	try {
		const response = await fetchImpl(url, init);
		let payload: unknown = null;
		try {
			payload = await response.json();
		} catch {
			payload = null;
		}
		if (!response.ok) return { ok: false, failure: readFailure(payload, response) };
		return { ok: true, data: payload };
	} catch {
		return { ok: false, failure: GENERIC_FAILURE };
	}
}

export async function loadMessages(
	config: GuestbookConfig,
	before: number | null,
	fetchImpl: typeof fetch,
): Promise<GuestbookResult<GuestbookThread>> {
	const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
	if (typeof before === 'number') query.set('before', String(before));
	const result = await requestJson(
		`${config.endpoint}?${query.toString()}`,
		{ headers: { accept: 'application/json' } },
		fetchImpl,
	);
	if (!result.ok) return result;
	const thread = parseThread(result.data);
	if (!thread) return { ok: false, failure: GENERIC_FAILURE };
	return { ok: true, data: thread };
}

export async function postMessage(
	config: GuestbookConfig,
	input: { body: string; parentId?: number | null },
	fetchImpl: typeof fetch,
): Promise<GuestbookResult<GuestbookMessage>> {
	const payload: Record<string, unknown> = { body: input.body };
	if (typeof input.parentId === 'number') payload.parentId = input.parentId;
	const result = await requestJson(config.endpoint, jsonRequest(payload), fetchImpl);
	if (!result.ok) return result;
	const message = parseMessage(result.data);
	if (!message) return { ok: false, failure: GENERIC_FAILURE };
	return { ok: true, data: message };
}

export async function postLike(
	config: GuestbookConfig,
	input: { id: number; liked: boolean },
	fetchImpl: typeof fetch,
): Promise<GuestbookResult<{ id: number; likes: number; liked: boolean }>> {
	const result = await requestJson(`${config.endpoint}/like`, jsonRequest(input), fetchImpl);
	if (!result.ok) return result;
	const data = result.data as Record<string, unknown> | null;
	if (!data || typeof data.likes !== 'number') return { ok: false, failure: GENERIC_FAILURE };
	return {
		ok: true,
		data: {
			id: typeof data.id === 'number' ? data.id : input.id,
			likes: data.likes,
			liked: typeof data.liked === 'boolean' ? data.liked : input.liked,
		},
	};
}

export async function postRemove(
	config: GuestbookConfig,
	id: number,
	fetchImpl: typeof fetch,
): Promise<GuestbookResult<{ id: number; removed: boolean }>> {
	const result = await requestJson(`${config.endpoint}/remove`, jsonRequest({ id }), fetchImpl);
	if (!result.ok) return result;
	const data = result.data as Record<string, unknown> | null;
	if (!data || data.removed !== true) return { ok: false, failure: GENERIC_FAILURE };
	return { ok: true, data: { id: typeof data.id === 'number' ? data.id : id, removed: true } };
}

export function applyLikeState(
	reply: GuestbookReply,
	button: HTMLButtonElement,
	state: { likes: number; liked: boolean },
	labels: GuestbookLabels,
) {
	reply.likes = state.likes;
	reply.liked = state.liked;
	const label = state.liked ? labels.unlikeAction : labels.likeAction;
	button.setAttribute('aria-pressed', String(state.liked));
	button.setAttribute('aria-label', label);
	button.setAttribute('title', label);
	const count = button.querySelector<HTMLElement>('[data-guestbook-like-count]');
	if (count) count.textContent = String(state.likes);
}

function createNode<K extends keyof HTMLElementTagNameMap>(
	doc: Document,
	tag: K,
	className?: string,
	text?: string,
): HTMLElementTagNameMap[K] {
	const node = doc.createElement(tag);
	if (className) node.className = className;
	if (text !== undefined) node.textContent = text;
	return node;
}

function createActionButton(doc: Document, className: string) {
	const node = createNode(doc, 'button', className);
	node.setAttribute('type', 'button');
	return node;
}

function createHeartIcon(doc: Document, size = 14) {
	const svg = doc.createElementNS(SVG_NS, 'svg');
	svg.setAttribute('width', String(size));
	svg.setAttribute('height', String(size));
	svg.setAttribute('viewBox', '0 0 24 24');
	svg.setAttribute('fill', 'none');
	svg.setAttribute('stroke', 'currentColor');
	svg.setAttribute('stroke-width', '1.6');
	svg.setAttribute('stroke-linecap', 'round');
	svg.setAttribute('stroke-linejoin', 'round');
	svg.setAttribute('aria-hidden', 'true');
	const path = doc.createElementNS(SVG_NS, 'path');
	path.setAttribute('d', HEART_PATH);
	svg.appendChild(path);
	return svg;
}

function createAvatar(doc: Document, reply: GuestbookReply) {
	const avatar = createNode(doc, 'div', 'gb-avatar', avatarInitial(reply.body));
	avatar.setAttribute('aria-hidden', 'true');
	avatar.style.background = avatarTintStyle(reply.id);
	return avatar;
}

function createMeta(doc: Document, reply: GuestbookReply, context: GuestbookRowContext) {
	const meta = createNode(doc, 'div', 'gb-meta');
	meta.appendChild(createNode(doc, 'span', 'gb-handle', messageHandleLabel(reply, context.labels)));
	const time = formatRelativeTime(reply.createdAt, context.locale, context.now, context.labels.justNow);
	const timeNode = createNode(doc, 'time', 'mono gb-time', time.text);
	if (time.datetime) timeNode.setAttribute('datetime', time.datetime);
	if (time.absolute) timeNode.setAttribute('title', time.absolute);
	meta.appendChild(timeNode);
	return meta;
}

function createLikeButton(doc: Document, reply: GuestbookReply, labels: GuestbookLabels) {
	const button = createActionButton(doc, 'like-btn');
	button.setAttribute('data-guestbook-like', String(reply.id));
	const label = reply.liked ? labels.unlikeAction : labels.likeAction;
	button.setAttribute('aria-pressed', String(reply.liked));
	button.setAttribute('aria-label', label);
	button.setAttribute('title', label);
	button.appendChild(createHeartIcon(doc));
	const count = createNode(doc, 'b', undefined, String(reply.likes));
	count.setAttribute('data-guestbook-like-count', '');
	button.appendChild(count);
	return button;
}

function createActions(
	doc: Document,
	reply: GuestbookReply,
	threadId: number,
	mention: boolean,
	context: GuestbookRowContext,
	row: HTMLElement,
) {
	const actions = createNode(doc, 'div', 'gb-actions');
	const like = createLikeButton(doc, reply, context.labels);
	like.addEventListener('click', () => context.onLike(reply, like));
	actions.appendChild(like);

	const replyButton = createActionButton(doc, 'gb-action');
	replyButton.setAttribute('data-guestbook-reply-action', String(threadId));
	replyButton.setAttribute('data-guestbook-id', String(reply.id));
	replyButton.textContent = context.labels.reply;
	replyButton.addEventListener('click', () =>
		context.onReply({ threadId, handle: reply.handle, mention }),
	);
	actions.appendChild(replyButton);

	if (isRetractable(reply, context.now)) {
		const retract = createActionButton(doc, 'gb-action');
		retract.setAttribute('data-guestbook-retract', String(reply.id));
		retract.textContent = context.labels.retract;
		retract.addEventListener('click', () => context.onRetract(reply, row));
		actions.appendChild(retract);
	}
	return actions;
}

export function createReplyRow(
	doc: Document,
	reply: GuestbookReply,
	threadId: number,
	context: GuestbookRowContext,
) {
	const row = createNode(doc, 'article', 'gb-reply-item');
	row.setAttribute('data-guestbook-reply', String(reply.id));
	row.appendChild(createAvatar(doc, reply));
	const body = createNode(doc, 'div', 'gb-body');
	body.appendChild(createMeta(doc, reply, context));
	body.appendChild(createNode(doc, 'p', 'gb-text', reply.body));
	body.appendChild(createActions(doc, reply, threadId, true, context, row));
	row.appendChild(body);
	return row;
}

export function createMessageRow(
	doc: Document,
	message: GuestbookMessage,
	context: GuestbookRowContext,
): GuestbookRow {
	const row = createNode(doc, 'article', 'gb-item');
	row.setAttribute('data-guestbook-message', String(message.id));
	row.appendChild(createAvatar(doc, message));

	const body = createNode(doc, 'div', 'gb-body');
	body.appendChild(createMeta(doc, message, context));
	body.appendChild(createNode(doc, 'p', 'gb-text', message.body));
	body.appendChild(createActions(doc, message, message.id, false, context, row));

	const hint = createNode(doc, 'p', 'mono gb-reply-hint');
	hint.hidden = message.replyCount <= message.replies.length;
	if (!hint.hidden) {
		hint.textContent = applyTemplate(context.labels.showingLatestTemplate, {
			COUNT: message.replies.length,
		});
	}
	body.appendChild(hint);

	const replies = createNode(doc, 'div', 'gb-replies');
	replies.setAttribute('data-guestbook-replies', String(message.id));
	if (message.replies.length > 0) {
		replies.setAttribute(
			'aria-label',
			applyTemplate(context.labels.replyCountTemplate, { COUNT: message.replyCount }),
		);
	}
	const replyRows = new Map<number, HTMLElement>();
	for (const reply of message.replies) {
		const replyRow = createReplyRow(doc, reply, message.id, context);
		replyRows.set(reply.id, replyRow);
		replies.appendChild(replyRow);
	}
	body.appendChild(replies);
	row.appendChild(body);
	return { message, row, replies, hint, replyRows };
}

function stopEvent(event: Event) {
	if (typeof event.preventDefault === 'function') event.preventDefault();
}

export function initGuestbook(doc: Document = document, fetchImpl: typeof fetch = fetch) {
	const root = doc.querySelector<HTMLElement>('[data-guestbook]');
	if (!root) return;
	const config = readGuestbookConfig(root);
	if (!config) return;
	/** Re-typed so nested callbacks keep the resolved config. */
	const settings: GuestbookConfig = config;
	const labels = settings.labels;

	const composer = root.querySelector<HTMLElement>('[data-guestbook-composer]');
	const input = root.querySelector<HTMLTextAreaElement>('[data-guestbook-input]');
	const list = root.querySelector<HTMLElement>('[data-guestbook-list]');
	const send = root.querySelector<HTMLButtonElement>('[data-guestbook-send]');
	if (!input || !list || !send) return;

	const counter = root.querySelector<HTMLElement>('[data-guestbook-counter]');
	const limitNote = root.querySelector<HTMLElement>('[data-guestbook-limit]');
	const status = root.querySelector<HTMLElement>('[data-guestbook-status]');
	const more = root.querySelector<HTMLButtonElement>('[data-guestbook-more]');
	const rateNote = root.querySelector<HTMLElement>('[data-guestbook-rate-note]');
	const replyPill = root.querySelector<HTMLElement>('[data-guestbook-reply-pill]');
	const replyTarget = root.querySelector<HTMLElement>('[data-guestbook-reply-target]');
	const cancelReply = root.querySelector<HTMLButtonElement>('[data-guestbook-cancel-reply]');
	const emojiToggle = root.querySelector<HTMLButtonElement>('[data-guestbook-emoji-toggle]');
	const emojiPanel = root.querySelector<HTMLElement>('[data-guestbook-emoji-panel]');
	const glyphs = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-guestbook-emoji]'));

	const rows = new Map<number, GuestbookRow>();
	const replyOwners = new Map<number, { reply: GuestbookReply; threadId: number }>();
	let nextBefore: number | null = null;
	let loadingMore = false;
	let sending = false;
	let currentReply: { threadId: number; handle: string; mention: boolean } | null = null;

	const setStatus = (text: string) => {
		if (!status) return;
		status.textContent = text;
		status.hidden = false;
	};

	const clearStatus = () => {
		if (!status) return;
		status.textContent = '';
		status.hidden = true;
	};

	const showRateNote = (text: string) => {
		if (!rateNote) return;
		rateNote.textContent = text;
		rateNote.hidden = false;
	};

	const hideRateNote = () => {
		if (!rateNote) return;
		rateNote.hidden = true;
	};

	const handleFailure = (failure: GuestbookFailure) => {
		if (failure.code === 'rate_limited') {
			showRateNote(
				failure.retryAfter !== null
					? applyTemplate(labels.slowDownInTemplate, { SECONDS: failure.retryAfter })
					: labels.slowDown,
			);
			return;
		}
		setStatus(resolveErrorMessage(failure.code, labels));
	};

	const readLineHeight = () => {
		const style = doc.defaultView?.getComputedStyle?.(input);
		const parsed = Number.parseFloat(style?.lineHeight ?? '');
		return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LINE_HEIGHT;
	};

	const autogrow = () => {
		const fieldSizing =
			typeof CSS !== 'undefined' &&
			typeof CSS.supports === 'function' &&
			CSS.supports('field-sizing', 'content');
		if (fieldSizing) return;
		const scrollHeight = Number(input.scrollHeight) || 0;
		if (!scrollHeight) return;
		const lineHeight = readLineHeight();
		input.style.height = 'auto';
		input.style.height = `${nextTextareaHeight(scrollHeight, lineHeight, MAX_TEXTAREA_ROWS)}px`;
	};

	const canSend = () => {
		const used = countCodePoints(input.value);
		return !sending && used > 0 && used <= MAX_MESSAGE_LENGTH && input.value.trim().length > 0;
	};

	const refreshComposer = () => {
		const used = countCodePoints(input.value);
		const over = used > MAX_MESSAGE_LENGTH;
		if (counter) {
			counter.textContent = applyTemplate(labels.counterTemplate, {
				USED: used,
				MAX: MAX_MESSAGE_LENGTH,
			});
			counter.dataset.over = String(over);
		}
		if (limitNote) limitNote.hidden = !over;
		send.setAttribute('aria-disabled', String(!canSend()));
		autogrow();
	};

	const refreshMore = () => {
		if (!more) return;
		more.hidden = nextBefore === null;
		more.setAttribute('aria-disabled', String(loadingMore));
	};

	const updateThread = (rendered: GuestbookRow) => {
		const { message } = rendered;
		if (message.replies.length > 0) {
			rendered.replies.setAttribute('aria-label', applyTemplate(labels.replyCountTemplate, { COUNT: message.replyCount }));
		}
		const hidden = message.replyCount <= message.replies.length;
		rendered.hint.hidden = hidden;
		rendered.hint.textContent = hidden
			? ''
			: applyTemplate(labels.showingLatestTemplate, { COUNT: message.replies.length });
	};

	const enterReply = (target: { threadId: number; handle: string; mention: boolean }) => {
		currentReply = target;
		if (target.mention) input.value = nextReplyBody(target.handle, input.value);
		if (replyTarget) {
			replyTarget.textContent = applyTemplate(labels.replyingToTemplate, { HANDLE: target.handle });
		}
		if (replyPill) replyPill.hidden = false;
		refreshComposer();
		input.focus();
		const end = input.value.length;
		input.selectionStart = end;
		input.selectionEnd = end;
	};

	const clearReply = () => {
		if (currentReply) input.value = stripReplyPrefix(currentReply.handle, input.value);
		currentReply = null;
		if (replyTarget) replyTarget.textContent = '';
		if (replyPill) replyPill.hidden = true;
		refreshComposer();
	};

	const resetComposer = () => {
		input.value = '';
		currentReply = null;
		if (replyTarget) replyTarget.textContent = '';
		if (replyPill) replyPill.hidden = true;
		refreshComposer();
	};

	const rowContext = (): GuestbookRowContext => ({
		locale: settings.locale,
		labels,
		now: new Date(),
		onLike: toggleLike,
		onReply: enterReply,
		onRetract: retractReply,
	});

	const trackRow = (rendered: GuestbookRow) => {
		rows.set(rendered.message.id, rendered);
		for (const id of rendered.replyRows.keys()) {
			const reply = rendered.message.replies.find((item) => item.id === id);
			if (reply) replyOwners.set(id, { reply, threadId: rendered.message.id });
		}
		return rendered;
	};

	const renderThread = (thread: GuestbookThread, reset: boolean) => {
		if (reset) {
			rows.clear();
			replyOwners.clear();
			list.textContent = '';
		}
		for (const message of thread.messages) {
			const rendered = trackRow(createMessageRow(doc, message, rowContext()));
			list.appendChild(rendered.row);
		}
	};

	const loadFirstPage = async () => {
		const result = await loadMessages(settings, null, fetchImpl);
		if (!result.ok) {
			if (result.failure.code) handleFailure(result.failure);
			else setStatus(labels.failed);
			return;
		}
		nextBefore = result.data.nextBefore;
		renderThread(result.data, true);
		if (composer) composer.hidden = false;
		list.hidden = false;
		if (result.data.messages.length === 0) setStatus(labels.empty);
		else clearStatus();
		refreshMore();
	};

	const loadMore = () => {
		if (loadingMore || nextBefore === null) return;
		loadingMore = true;
		refreshMore();
		void loadMessages(settings, nextBefore, fetchImpl).then((result) => {
			loadingMore = false;
			if (!result.ok) {
				refreshMore();
				handleFailure(result.failure);
				return;
			}
			nextBefore = result.data.nextBefore;
			renderThread(result.data, false);
			refreshMore();
		});
	};

	const appendPosted = (message: GuestbookMessage, parentId: number | null) => {
		if (parentId === null) {
			list.prepend(trackRow(createMessageRow(doc, message, rowContext())).row);
			return;
		}
		const parent = rows.get(parentId);
		if (!parent) {
			void loadFirstPage();
			return;
		}
		const replyRow = createReplyRow(doc, message, parentId, rowContext());
		parent.replies.appendChild(replyRow);
		parent.message.replies.push(message);
		parent.message.replyCount += 1;
		parent.replyRows.set(message.id, replyRow);
		replyOwners.set(message.id, { reply: message, threadId: parentId });
		updateThread(parent);
	};

	const submit = () => {
		if (send.getAttribute('aria-disabled') === 'true' || !canSend()) return;
		const body = input.value;
		const parentId = currentReply?.threadId ?? null;
		sending = true;
		send.textContent = labels.sending;
		refreshComposer();
		void postMessage(settings, { body, parentId }, fetchImpl).then((result) => {
			sending = false;
			send.textContent = labels.send;
			if (!result.ok) {
				refreshComposer();
				handleFailure(result.failure);
				return;
			}
			resetComposer();
			hideRateNote();
			clearStatus();
			appendPosted(result.data, parentId);
		});
	};

	const toggleLike = (reply: GuestbookReply, button: HTMLButtonElement) => {
		if (button.getAttribute('aria-disabled') === 'true') return;
		const previous = { likes: reply.likes, liked: reply.liked };
		const optimistic = {
			likes: Math.max(0, previous.likes + (previous.liked ? -1 : 1)),
			liked: !previous.liked,
		};
		applyLikeState(reply, button, optimistic, labels);
		button.setAttribute('aria-disabled', 'true');
		void postLike(settings, { id: reply.id, liked: optimistic.liked }, fetchImpl).then((result) => {
			button.removeAttribute('aria-disabled');
			if (!result.ok) {
				applyLikeState(reply, button, previous, labels);
				handleFailure(result.failure);
				return;
			}
			applyLikeState(reply, button, { likes: result.data.likes, liked: result.data.liked }, labels);
		});
	};

	const retractReply = (reply: GuestbookReply, row: HTMLElement) => {
		if (row.getAttribute('data-guestbook-busy') === 'true') return;
		row.setAttribute('data-guestbook-busy', 'true');
		void postRemove(settings, reply.id, fetchImpl).then((result) => {
			if (!result.ok) {
				row.removeAttribute('data-guestbook-busy');
				handleFailure(result.failure);
				return;
			}
			row.remove();
			setStatus(labels.retracted);
			const owner = replyOwners.get(reply.id);
			if (owner) {
				replyOwners.delete(reply.id);
				const parent = rows.get(owner.threadId);
				if (parent) {
					parent.message.replies = parent.message.replies.filter((item) => item.id !== reply.id);
					parent.message.replyCount = Math.max(0, parent.message.replyCount - 1);
					parent.replyRows.delete(reply.id);
					updateThread(parent);
				}
			}
			const rendered = rows.get(reply.id);
			if (rendered) {
				rows.delete(reply.id);
				for (const id of rendered.replyRows.keys()) replyOwners.delete(id);
			}
		});
	};

	const emojiColumns = () => {
		const grid = emojiPanel?.querySelector<HTMLElement>('[data-guestbook-emoji-grid]') ?? emojiPanel;
		if (!grid || typeof doc.defaultView?.getComputedStyle !== 'function') return DEFAULT_EMOJI_COLUMNS;
		return gridColumnCount(doc.defaultView.getComputedStyle(grid).gridTemplateColumns ?? '');
	};

	const moveGlyphFocus = (current: EventTarget | null, key: string) => {
		if (!current) return;
		const index = glyphs.indexOf(current as HTMLButtonElement);
		if (index < 0) return;
		const step = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0;
		const rowStep = key === 'ArrowDown' ? emojiColumns() : key === 'ArrowUp' ? -emojiColumns() : 0;
		const delta = step || rowStep;
		if (!delta) return;
		const next = glyphs[Math.min(Math.max(index + delta, 0), glyphs.length - 1)];
		next?.focus();
	};

	const panelOpen = () => emojiPanel?.hidden === false;

	const setPanel = (open: boolean, focusToggle = false) => {
		if (emojiPanel) emojiPanel.hidden = !open;
		emojiToggle?.setAttribute('aria-expanded', String(open));
		if (!open && focusToggle) emojiToggle?.focus();
	};

	const insertEmoji = (emoji: string) => {
		if (!emoji) return;
		const start = typeof input.selectionStart === 'number' ? input.selectionStart : input.value.length;
		const end = typeof input.selectionEnd === 'number' ? input.selectionEnd : start;
		const next = insertAtCaret(input.value, start, end, emoji);
		input.value = next.value;
		input.selectionStart = next.caret;
		input.selectionEnd = next.caret;
		refreshComposer();
	};

	const within = (node: HTMLElement | null, target: EventTarget | null) => {
		if (!node || !target) return false;
		if (node === target) return true;
		return typeof node.contains === 'function' && node.contains(target as Node);
	};

	input.addEventListener('input', refreshComposer);
	input.addEventListener('keydown', (event) => {
		const key = (event as KeyboardEvent).key;
		if (key !== 'Enter' || !((event as KeyboardEvent).metaKey || (event as KeyboardEvent).ctrlKey)) return;
		stopEvent(event);
		submit();
	});
	composer?.addEventListener('submit', (event) => {
		stopEvent(event);
		submit();
	});
	send.addEventListener('click', () => submit());
	cancelReply?.addEventListener('click', clearReply);
	more?.addEventListener('click', () => loadMore());
	root.addEventListener('keydown', (event) => {
		if ((event as KeyboardEvent).key !== 'Escape' || !panelOpen()) return;
		stopEvent(event);
		setPanel(false, true);
	});

	if (emojiToggle && emojiPanel) {
		emojiToggle.setAttribute('aria-expanded', 'false');
		emojiToggle.addEventListener('click', () => setPanel(!panelOpen()));
		emojiPanel.addEventListener('keydown', (event) => {
			const key = (event as KeyboardEvent).key;
			if (key === 'Escape') {
				stopEvent(event);
				setPanel(false, true);
				return;
			}
			if (!key.startsWith('Arrow')) return;
			stopEvent(event);
			moveGlyphFocus((event as KeyboardEvent).target, key);
		});
		for (const glyph of glyphs) {
			glyph.addEventListener('click', (event) => {
				const fromKeyboard = (event as MouseEvent).detail === 0;
				insertEmoji(glyph.textContent ?? '');
				if (fromKeyboard) glyph.focus();
				else input.focus();
			});
		}
		if (typeof doc.addEventListener === 'function') {
			doc.addEventListener('click', (event) => {
				if (!panelOpen()) return;
				const target = event.target ?? null;
				if (within(emojiPanel, target) || within(emojiToggle, target)) return;
				setPanel(false);
			});
		}
	}

	refreshComposer();
	refreshMore();
	void loadFirstPage();
}
