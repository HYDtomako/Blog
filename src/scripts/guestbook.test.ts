import assert from 'node:assert/strict';
import test from 'node:test';
import {
	applyTemplate,
	avatarInitial,
	avatarTint,
	avatarTintStyle,
	countCodePoints,
	createMessageRow,
	formatRelativeTime,
	gridColumnCount,
	initGuestbook,
	insertAtCaret,
	isRetractable,
	loadMessages,
	nextReplyBody,
	nextTextareaHeight,
	parseThread,
	postLike,
	postMessage,
	postRemove,
	readGuestbookConfig,
	resolveErrorMessage,
	stripReplyPrefix,
	type GuestbookLabels,
	type GuestbookMessage,
	type GuestbookRowContext,
} from './guestbook.ts';

type StubEvent = {
	target?: unknown;
	key?: string;
	detail?: number;
	metaKey?: boolean;
	ctrlKey?: boolean;
	prevented?: boolean;
	preventDefault?: () => void;
};

const hyphenate = (value: string) => value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);

function matchesSelector(node: StubNode, selector: string) {
	if (selector.startsWith('.')) return node.className.split(/\s+/).includes(selector.slice(1));
	if (selector.startsWith('[') && selector.endsWith(']')) {
		const body = selector.slice(1, -1);
		const equals = body.indexOf('=');
		if (equals < 0) return node.attributes.has(body);
		const value = body.slice(equals + 1).replace(/^["']|["']$/g, '');
		return node.attributes.get(body.slice(0, equals)) === value;
	}
	return node.tagName === selector;
}

class StubNode {
	tagName: string;
	className = '';
	hidden = false;
	value = '';
	style: Record<string, string> = {};
	children: StubNode[] = [];
	parent: StubNode | null = null;
	attributes = new Map<string, string>();
	listeners = new Map<string, Array<(event: StubEvent) => void>>();
	selectionStart = 0;
	selectionEnd = 0;
	focused = false;
	scrollHeight = 0;
	private text = '';

	constructor(tagName: string) {
		this.tagName = tagName;
	}

	get textContent() {
		return this.text;
	}

	set textContent(value: string) {
		this.text = value;
		this.children = [];
	}

	get dataset() {
		const attributes = this.attributes;
		return new Proxy({} as Record<string, string>, {
			get(_target, property) {
				return typeof property === 'string' ? attributes.get(`data-${hyphenate(property)}`) : undefined;
			},
			set(_target, property, value) {
				if (typeof property !== 'string') return false;
				attributes.set(`data-${hyphenate(property)}`, String(value));
				return true;
			},
		});
	}

	appendChild(node: StubNode) {
		node.parent = this;
		this.children.push(node);
		return node;
	}

	prepend(node: StubNode) {
		node.parent = this;
		this.children.unshift(node);
		return node;
	}

	setAttribute(name: string, value: string) {
		this.attributes.set(name, value);
	}

	getAttribute(name: string) {
		return this.attributes.get(name) ?? null;
	}

	removeAttribute(name: string) {
		this.attributes.delete(name);
	}

	addEventListener(type: string, handler: (event: StubEvent) => void) {
		const handlers = this.listeners.get(type) ?? [];
		handlers.push(handler);
		this.listeners.set(type, handlers);
	}

	remove() {
		if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
		this.parent = null;
	}

	focus() {
		this.focused = true;
	}

	contains(node: unknown): boolean {
		if (!node || typeof node !== 'object') return false;
		return this.children.some((child): boolean => child === node || child.contains(node));
	}

	querySelector(selector: string) {
		return this.querySelectorAll(selector)[0] ?? null;
	}

	querySelectorAll(selector: string) {
		const found: StubNode[] = [];
		const walk = (node: StubNode) => {
			for (const child of node.children) {
				if (matchesSelector(child, selector)) found.push(child);
				walk(child);
			}
		};
		walk(this);
		return found;
	}

	dispatch(type: string, event: StubEvent = {}) {
		const payload: StubEvent = {
			target: this,
			prevented: false,
			preventDefault() {
				payload.prevented = true;
			},
			...event,
		};
		for (const handler of this.listeners.get(type) ?? []) handler(payload);
		return payload;
	}
}

class StubDocument {
	root: StubNode;
	listeners = new Map<string, Array<(event: StubEvent) => void>>();

	constructor(root: StubNode) {
		this.root = root;
	}

	querySelector(selector: string) {
		return selector === '[data-guestbook]' ? this.root : this.root.querySelector(selector);
	}

	createElement(tagName: string) {
		return new StubNode(tagName);
	}

	createElementNS(_namespace: string, tagName: string) {
		return new StubNode(tagName);
	}

	addEventListener(type: string, handler: (event: StubEvent) => void) {
		const handlers = this.listeners.get(type) ?? [];
		handlers.push(handler);
		this.listeners.set(type, handlers);
	}

	dispatch(type: string, event: StubEvent = {}) {
		for (const handler of this.listeners.get(type) ?? []) handler(event);
	}
}

const TEST_LABELS: GuestbookLabels = {
	empty: 'empty copy',
	failed: 'failed copy',
	send: 'Send',
	sending: 'Sending',
	reply: 'Reply',
	cancelReply: 'Cancel',
	likeAction: 'Like',
	unlikeAction: 'Unlike',
	mine: 'Me',
	retract: 'Retract',
	retracted: 'Retracted',
	tooLong: 'Too long',
	sendFailed: 'Send failed',
	slowDown: 'Slow down',
	justNow: 'Just now',
	counterTemplate: '__USED__ / __MAX__',
	guestTemplate: 'Guest __HANDLE__',
	replyingToTemplate: 'Replying to __HANDLE__',
	replyCountTemplate: '__COUNT__ replies',
	showingLatestTemplate: 'latest __COUNT__',
	slowDownInTemplate: 'slow down for __SECONDS__',
	errors: {
		invalid_message: 'invalid message',
		message_too_long: 'too long',
		rate_limited: 'rate limited',
		not_author: 'not author',
		message_not_found: 'not found',
		guestbook_unavailable: 'guestbook unavailable',
		invalid_content_type: 'invalid content type',
	},
};

function stubNode(tagName: string, hook?: string) {
	const node = new StubNode(tagName);
	if (hook) node.setAttribute(hook, '');
	return node;
}

/** The DOM helpers return real `Element` types; tests read them back as stub nodes. */
function pick(root: unknown, selector: string) {
	const host = root as { querySelector(selector: string): unknown } | null | undefined;
	return (host?.querySelector(selector) ?? null) as StubNode | null;
}

function buildBoard() {
	const root = new StubNode('section');
	root.setAttribute('data-guestbook', '');
	root.setAttribute('data-guestbook-endpoint', '/api/guestbook');
	root.setAttribute('data-guestbook-locale', 'zh-CN');
	root.setAttribute('data-guestbook-labels', JSON.stringify(TEST_LABELS));

	const composer = new StubNode('form');
	composer.setAttribute('data-guestbook-composer', '');
	composer.hidden = true;
	const input = new StubNode('textarea');
	input.setAttribute('data-guestbook-input', '');
	const counter = stubNode('span', 'data-guestbook-counter');
	const limitNote = stubNode('span', 'data-guestbook-limit');
	const send = stubNode('button', 'data-guestbook-send');
	const replyPill = stubNode('div', 'data-guestbook-reply-pill');
	const replyTarget = stubNode('span', 'data-guestbook-reply-target');
	const cancelReply = stubNode('button', 'data-guestbook-cancel-reply');
	const rateNote = stubNode('p', 'data-guestbook-rate-note');
	const emojiToggle = stubNode('button', 'data-guestbook-emoji-toggle');
	const panel = stubNode('div', 'data-guestbook-emoji-panel');
	panel.hidden = true;
	const grid = stubNode('div', 'data-guestbook-emoji-grid');
	const glyphs = ['😀', '😄', '😁'].map((emoji) => {
		const glyph = stubNode('button', 'data-guestbook-emoji');
		glyph.textContent = emoji;
		grid.appendChild(glyph);
		return glyph;
	});
	panel.appendChild(grid);

	composer.appendChild(input);
	replyPill.appendChild(replyTarget);
	replyPill.appendChild(cancelReply);
	composer.appendChild(replyPill);
	composer.appendChild(counter);
	composer.appendChild(limitNote);
	composer.appendChild(send);
	composer.appendChild(emojiToggle);
	composer.appendChild(rateNote);
	root.appendChild(composer);
	root.appendChild(panel);

	const status = stubNode('p', 'data-guestbook-status');
	root.appendChild(status);
	const list = stubNode('div', 'data-guestbook-list');
	list.hidden = true;
	root.appendChild(list);
	const more = stubNode('button', 'data-guestbook-more');
	more.hidden = true;
	root.appendChild(more);

	const doc = new StubDocument(root);
	return {
		doc: doc as unknown as Document,
		stub: doc,
		root,
		composer,
		input,
		counter,
		limitNote,
		send,
		replyPill,
		replyTarget,
		cancelReply,
		rateNote,
		emojiToggle,
		panel,
		glyphs,
		status,
		list,
		more,
	};
}

type Call = { url: string; init?: RequestInit };

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: async () => body,
		headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
	} as unknown as Response;
}

function fakeFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
	const calls: Call[] = [];
	const impl = (async (url: string, init?: RequestInit) => {
		calls.push({ url: String(url), init });
		return handler(String(url), init);
	}) as unknown as typeof fetch;
	return { impl, calls };
}

function postedBody(call: Call) {
	return JSON.parse(String(call.init?.body)) as Record<string, unknown>;
}

function settling() {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

function utcStamp(date: Date) {
	return date.toISOString().slice(0, 19).replace('T', ' ');
}

function ago(seconds: number) {
	return utcStamp(new Date(Date.now() - seconds * 1000));
}

function message(overrides: Partial<GuestbookMessage> = {}): GuestbookMessage {
	return {
		id: 5,
		body: 'hello there',
		handle: 'a3f9',
		mine: false,
		createdAt: ago(125),
		likes: 2,
		liked: false,
		replyCount: 0,
		replies: [],
		...overrides,
	};
}

function rowContext(overrides: Partial<GuestbookRowContext> = {}): GuestbookRowContext {
	return {
		locale: 'en',
		labels: TEST_LABELS,
		now: new Date(),
		onLike: () => {},
		onReply: () => {},
		onRetract: () => {},
		...overrides,
	};
}

test('readGuestbookConfig reads the hooks and merges label overrides', () => {
	const board = buildBoard();
	const config = readGuestbookConfig(board.root as unknown as HTMLElement);
	assert.equal(config?.endpoint, '/api/guestbook');
	assert.equal(config?.locale, 'zh-CN');
	assert.equal(config?.labels.send, 'Send');
	assert.equal(config?.labels.errors.rate_limited, 'rate limited');

	const partial = new StubNode('section');
	partial.setAttribute('data-guestbook-endpoint', '/api/guestbook');
	partial.setAttribute('data-guestbook-labels', JSON.stringify({ empty: 'only this one' }));
	const merged = readGuestbookConfig(partial as unknown as HTMLElement);
	assert.equal(merged?.labels.empty, 'only this one');
	assert.equal(merged?.labels.guestTemplate, 'Guest __HANDLE__');
	assert.equal(merged?.locale, 'en');
	assert.equal(merged?.labels.errors.invalid_message, 'That message did not look right.');

	const broken = new StubNode('section');
	broken.setAttribute('data-guestbook-endpoint', '/api/guestbook');
	broken.setAttribute('data-guestbook-labels', '{ bad json');
	const fallback = readGuestbookConfig(broken as unknown as HTMLElement);
	assert.equal(fallback?.labels.empty, 'No messages yet. Be the first.');

	const empty = new StubNode('section');
	assert.equal(readGuestbookConfig(empty as unknown as HTMLElement), null);
});

test('parseThread keeps the contract shape and drops malformed entries', () => {
	const thread = parseThread({
		messages: [
			{
				id: 9,
				body: 'top',
				handle: 'a3f9',
				mine: true,
				createdAt: '2026-09-26 09:00:00',
				likes: 1,
				liked: true,
				replyCount: 3,
				replies: [
					{ id: 10, body: 'inner', handle: 'b1c2', mine: false, createdAt: '2026-09-26 09:01:00', likes: 0, liked: false },
					{ nope: true },
				],
			},
			{ id: 'not a number', body: 'dropped' },
		],
		nextBefore: 8,
		total: 12,
	});
	assert.ok(thread);
	assert.equal(thread.messages.length, 1);
	assert.equal(thread.messages[0].replyCount, 3);
	assert.equal(thread.messages[0].replies.length, 1);
	assert.equal(thread.messages[0].replies[0].handle, 'b1c2');
	assert.equal(thread.nextBefore, 8);
	assert.equal(thread.total, 12);

	const noMessages = parseThread({ messages: [], nextBefore: null, total: 0 });
	assert.ok(noMessages);
	assert.equal(noMessages.messages.length, 0);
	assert.equal(noMessages.nextBefore, null);
	assert.equal(parseThread('nope'), null);
});

test('countCodePoints counts characters rather than UTF-16 units', () => {
	assert.equal(countCodePoints('abc'), 3);
	assert.equal(countCodePoints('😀😀'), 2);
	assert.equal(countCodePoints('a😀'), 2);
	assert.equal('a😀'.length, 3);
});

test('insertAtCaret splices at the caret and clamps out-of-range offsets', () => {
	assert.deepEqual(insertAtCaret('hi', 1, 1, '😀'), { value: 'h😀i', caret: 3 });
	assert.deepEqual(insertAtCaret('hello', 0, 5, 'bye'), { value: 'bye', caret: 3 });
	assert.deepEqual(insertAtCaret('hello', 99, 99, '!'), { value: 'hello!', caret: 6 });
	assert.deepEqual(insertAtCaret('hello', 3, 1, '-'), { value: 'hel-lo', caret: 4 });
});

test('formatRelativeTime prefers the fresh label inside the first minute', () => {
	const now = new Date('2026-09-26T09:00:30Z');
	assert.equal(formatRelativeTime('2026-09-26 09:00:00', 'en', now, 'Just now').text, 'Just now');
	assert.equal(formatRelativeTime('2026-09-26 08:58:00', 'en', now, 'Just now').text, '2 minutes ago');
	assert.equal(formatRelativeTime('2026-09-26 09:00:00', 'en', now).text, '30 seconds ago');
});

test('formatRelativeTime reads the timestamp as UTC and keeps the absolute date', () => {
	const now = new Date('2026-09-26T09:03:00Z');
	const relative = formatRelativeTime('2026-09-26 09:00:00', 'en', now);
	assert.equal(relative.datetime, '2026-09-26T09:00:00.000Z');
	assert.equal(relative.relative, true);
	assert.equal(relative.text, '3 minutes ago');

	const shiftedNow = new Date('2026-09-26T02:03:00-07:00');
	assert.equal(formatRelativeTime('2026-09-26 09:00:00', 'en', shiftedNow).text, '3 minutes ago');

	const old = formatRelativeTime('2026-01-05 08:00:00', 'en', now);
	assert.equal(old.relative, false);
	assert.equal(old.datetime, '2026-01-05T08:00:00.000Z');
	assert.match(old.text, /2026/);

	const broken = formatRelativeTime('', 'en', now);
	assert.equal(broken.datetime, '');
	assert.equal(broken.text, '');
});

test('nextReplyBody prefixes the handle once and stripReplyPrefix undoes it', () => {
	assert.equal(nextReplyBody('b1c2', 'hi'), '@b1c2 hi');
	assert.equal(nextReplyBody('b1c2', '@b1c2 hi'), '@b1c2 hi');
	assert.equal(nextReplyBody('b1c2', '   hi'), '@b1c2 hi');
	assert.equal(nextReplyBody('', 'hi'), 'hi');
	assert.equal(stripReplyPrefix('b1c2', '@b1c2 hi'), 'hi');
	assert.equal(stripReplyPrefix('b1c2', 'hi'), 'hi');
});

test('isRetractable allows only fresh messages the visitor owns', () => {
	const now = new Date('2026-09-26T12:00:00Z');
	assert.equal(isRetractable({ mine: true, createdAt: '2026-09-26 11:55:00' }, now), true);
	assert.equal(isRetractable({ mine: true, createdAt: '2026-09-26 11:49:59' }, now), false);
	assert.equal(isRetractable({ mine: false, createdAt: '2026-09-26 11:59:00' }, now), false);
	assert.equal(isRetractable({ mine: true, createdAt: '' }, now), false);
});

test('avatar helpers derive monochrome tints from the message id', () => {
	assert.equal(avatarTint(0), 8);
	assert.equal(avatarTint(6), 8);
	assert.equal(avatarTint(7), 16);
	assert.equal(avatarTint(-1), 16);
	assert.equal(avatarTint(5), 58);
	assert.equal(avatarTintStyle(7), 'color-mix(in srgb, var(--ink) 16%, var(--surface))');
	assert.equal(avatarInitial('  hello'), 'h');
	assert.equal(avatarInitial('😀 hi'), '😀');
	assert.equal(avatarInitial(''), '');
});

test('gridColumnCount and nextTextareaHeight clamp their results', () => {
	assert.equal(gridColumnCount('30px 30px 30px'), 3);
	assert.equal(gridColumnCount('none'), 8);
	assert.equal(gridColumnCount('repeat(auto-fill, minmax(30px, 1fr))'), 8);
	assert.equal(gridColumnCount('', 4), 4);
	assert.equal(nextTextareaHeight(600, 24, 8), 192);
	assert.equal(nextTextareaHeight(10, 24, 8), 24);
	assert.equal(nextTextareaHeight(72, 24, 8), 72);
	assert.equal(nextTextareaHeight(72, 0, 8), 72);
});

test('applyTemplate and resolveErrorMessage fall back to the generic copy', () => {
	assert.equal(applyTemplate('a __X__ b', { X: 3 }), 'a 3 b');
	assert.equal(applyTemplate('a __X__ b', {}), 'a __X__ b');
	assert.equal(resolveErrorMessage('not_author', TEST_LABELS), 'not author');
	assert.equal(resolveErrorMessage('unknown_code', TEST_LABELS), 'Send failed');
	assert.equal(resolveErrorMessage(undefined, TEST_LABELS), 'Send failed');
});

test('request helpers speak the frozen contract', async () => {
	const config = { endpoint: '/api/guestbook', locale: 'en', labels: TEST_LABELS };
	const { impl, calls } = fakeFetch((url) => {
		if (url.endsWith('/like')) return jsonResponse({ id: 3, likes: 4, liked: true });
		if (url.endsWith('/remove')) return jsonResponse({ id: 3, removed: true });
		if (url.includes('before=')) return jsonResponse({ messages: [], nextBefore: null, total: 0 });
		return jsonResponse(
			{ id: 11, body: 'new', handle: 'a3f9', mine: true, createdAt: '2026-09-26 09:00:00', likes: 0, liked: false, replyCount: 0, replies: [] },
			201,
		);
	});

	const thread = await loadMessages(config, 42, impl);
	assert.equal(calls[0].url, '/api/guestbook?limit=20&before=42');
	assert.equal(thread.ok, true);
	assert.equal(thread.ok && thread.data.total, 0);

	const posted = await postMessage(config, { body: 'hi', parentId: 5 }, impl);
	assert.equal(calls[1].url, '/api/guestbook');
	assert.equal(calls[1].init?.method, 'POST');
	assert.equal(calls[1].init?.headers && (calls[1].init.headers as Record<string, string>)['content-type'], 'application/json');
	assert.deepEqual(postedBody(calls[1]), { body: 'hi', parentId: 5 });
	assert.equal(posted.ok, true);
	assert.equal(posted.ok && posted.data.id, 11);

	await postMessage(config, { body: 'hi', parentId: null }, impl);
	assert.deepEqual(postedBody(calls[2]), { body: 'hi' });

	const liked = await postLike(config, { id: 3, liked: true }, impl);
	assert.equal(calls[3].url, '/api/guestbook/like');
	assert.deepEqual(postedBody(calls[3]), { id: 3, liked: true });
	assert.equal(liked.ok, true);
	assert.deepEqual(liked.ok && liked.data, { id: 3, likes: 4, liked: true });

	const removed = await postRemove(config, 3, impl);
	assert.equal(calls[4].url, '/api/guestbook/remove');
	assert.equal(removed.ok, true);
	assert.equal(removed.ok && removed.data.removed, true);
});

test('request failures carry the error code and retry-after', async () => {
	const config = { endpoint: '/api/guestbook', locale: 'en', labels: TEST_LABELS };
	const { impl } = fakeFetch(() =>
		jsonResponse({ error: { code: 'rate_limited', message: 'slow down' } }, 429, { 'retry-after': '30' }),
	);
	const refused = await loadMessages(config, null, impl);
	assert.equal(refused.ok, false);
	if (refused.ok) throw new Error('expected a refused request');
	assert.equal(refused.failure.code, 'rate_limited');
	assert.equal(refused.failure.retryAfter, 30);

	const offline = (async () => {
		throw new Error('offline');
	}) as unknown as typeof fetch;
	const failed = await postMessage(config, { body: 'hi' }, offline);
	assert.equal(failed.ok, false);
	if (failed.ok) throw new Error('expected a failed request');
	assert.equal(failed.failure.code, '');
	assert.equal(failed.failure.retryAfter, null);

	const malformed = (async () => jsonResponse({ nope: true })) as unknown as typeof fetch;
	assert.equal((await loadMessages(config, null, malformed)).ok, false);
	assert.equal((await postLike(config, { id: 1, liked: true }, malformed)).ok, false);
	assert.equal((await postRemove(config, 1, malformed)).ok, false);
});

test('createMessageRow builds plain-text rows with the shipped hooks', () => {
	const board = buildBoard();
	const createdAt = ago(125);
	const reply = message({ id: 6, body: 'inner', handle: 'b1c2', likes: 0 });
	const rendered = createMessageRow(
		board.doc,
		message({ body: '<b>hi</b>', createdAt, replyCount: 5, replies: [reply] }),
		rowContext(),
	);

	assert.equal(rendered.row.getAttribute('data-guestbook-message'), '5');
	assert.equal(rendered.row.querySelector('.gb-avatar')?.textContent, '<');
	const text = rendered.row.querySelector('.gb-text');
	assert.equal(text?.textContent, '<b>hi</b>');
	assert.equal(text?.children.length, 0);
	assert.equal(rendered.row.querySelector('.gb-handle')?.textContent, 'Guest a3f9');
	const time = rendered.row.querySelector('time');
	assert.equal(time?.getAttribute('datetime'), `${createdAt.replace(' ', 'T')}.000Z`);
	assert.equal(time?.textContent, '2 minutes ago');

	assert.equal(rendered.hint.hidden, false);
	assert.equal(rendered.hint.textContent, 'latest 1');
	assert.equal(rendered.replies.children.length, 1);
	assert.equal(rendered.replies.getAttribute('aria-label'), '5 replies');
	assert.equal(rendered.replyRows.get(6)?.getAttribute('data-guestbook-reply'), '6');

	const like = rendered.row.querySelector('[data-guestbook-like]');
	assert.equal(like?.getAttribute('aria-pressed'), 'false');
	assert.equal(like?.getAttribute('aria-label'), 'Like');
	assert.equal(like?.getAttribute('data-guestbook-like'), '5');
	assert.equal(like?.querySelector('[data-guestbook-like-count]')?.textContent, '2');
	assert.equal(like?.children.length, 2);
	assert.equal(rendered.row.querySelector('[data-guestbook-retract]'), null);
	assert.equal(rendered.row.querySelector('[data-guestbook-reply-action]')?.getAttribute('data-guestbook-id'), '5');

	const fresh = createMessageRow(
		board.doc,
		message({ mine: true, createdAt: ago(30), replyCount: 0 }),
		rowContext(),
	);
	assert.equal(fresh.row.querySelector('.gb-handle')?.textContent, 'Me');
	assert.notEqual(fresh.row.querySelector('[data-guestbook-retract]'), null);
	assert.equal(fresh.hint.hidden, true);
	assert.equal(fresh.replies.getAttribute('aria-label'), null);
});

test('createMessageRow wires the row callbacks to the actions', () => {
	const board = buildBoard();
	const liked: number[] = [];
	const replied: Array<{ threadId: number; handle: string; mention: boolean }> = [];
	const retracted: number[] = [];
	const rendered = createMessageRow(
		board.doc,
		message({ mine: true, replies: [message({ id: 6, handle: 'b1c2' })] }),
		rowContext({
			onLike: (reply) => liked.push(reply.id),
			onReply: (target) => replied.push(target),
			onRetract: (reply) => retracted.push(reply.id),
		}),
	);

	pick(rendered.row, '[data-guestbook-like]')?.dispatch('click');
	pick(rendered.row, '[data-guestbook-retract]')?.dispatch('click');
	pick(rendered.row, '[data-guestbook-reply-action]')?.dispatch('click');
	const inner = pick(rendered.row, '.gb-reply-item');
	pick(inner, '[data-guestbook-reply-action]')?.dispatch('click');
	pick(inner, '[data-guestbook-like]')?.dispatch('click');

	assert.deepEqual(liked, [5, 6]);
	assert.deepEqual(retracted, [5]);
	assert.deepEqual(replied, [
		{ threadId: 5, handle: 'a3f9', mention: false },
		{ threadId: 5, handle: 'b1c2', mention: true },
	]);
});

test('initGuestbook reveals the board after the first page', async () => {
	const board = buildBoard();
	const { impl, calls } = fakeFetch(() => jsonResponse({ messages: [message()], nextBefore: 4, total: 30 }));
	initGuestbook(board.doc, impl);
	await settling();

	assert.equal(calls[0].url, '/api/guestbook?limit=20');
	assert.equal(board.composer.hidden, false);
	assert.equal(board.list.hidden, false);
	assert.equal(board.list.children.length, 1);
	assert.equal(board.status.hidden, true);
	assert.equal(board.more.hidden, false);
	assert.equal(board.counter.textContent, '0 / 500');
	assert.equal(board.send.getAttribute('aria-disabled'), 'true');

	board.send.dispatch('click');
	await settling();
	assert.equal(calls.length, 1);
});

test('initGuestbook shows the empty copy and appends the next page', async () => {
	const empty = buildBoard();
	const emptyFetch = fakeFetch(() => jsonResponse({ messages: [], nextBefore: null, total: 0 }));
	initGuestbook(empty.doc, emptyFetch.impl);
	await settling();
	assert.equal(empty.status.hidden, false);
	assert.equal(empty.status.textContent, 'empty copy');
	assert.equal(empty.list.hidden, false);
	assert.equal(empty.more.hidden, true);

	const board = buildBoard();
	const first = message({ id: 12 });
	const second = message({ id: 3, body: 'older' });
	const { impl, calls } = fakeFetch((url) =>
		url.includes('before=')
			? jsonResponse({ messages: [second], nextBefore: null, total: 2 })
			: jsonResponse({ messages: [first], nextBefore: 12, total: 2 }),
	);
	initGuestbook(board.doc, impl);
	await settling();

	assert.equal(board.more.hidden, false);
	board.more.dispatch('click');
	assert.equal(board.more.getAttribute('aria-disabled'), 'true');
	await settling();

	assert.equal(calls[1].url, '/api/guestbook?limit=20&before=12');
	assert.equal(board.list.children.length, 2);
	assert.equal(board.list.children[1].getAttribute('data-guestbook-message'), '3');
	assert.equal(board.more.hidden, true);
	assert.equal(board.status.hidden, true);
});

test('initGuestbook degrades to the status line when the board cannot load', async () => {
	const board = buildBoard();
	const offline = (async () => {
		throw new Error('offline');
	}) as unknown as typeof fetch;
	initGuestbook(board.doc, offline);
	await settling();

	assert.equal(board.status.hidden, false);
	assert.equal(board.status.textContent, 'failed copy');
	assert.equal(board.composer.hidden, true);
	assert.equal(board.list.hidden, true);
	assert.equal(board.more.hidden, true);

	const other = buildBoard();
	const unavailable = fakeFetch(() =>
		jsonResponse({ error: { code: 'guestbook_unavailable', message: 'down' } }, 503),
	);
	initGuestbook(other.doc, unavailable.impl);
	await settling();
	assert.equal(other.status.textContent, 'guestbook unavailable');
	assert.equal(other.composer.hidden, true);
});

test('initGuestbook sends a new message and resets the composer', async () => {
	const board = buildBoard();
	let postBody: Record<string, unknown> | null = null;
	const { impl } = fakeFetch((url, init) => {
		if (init?.method === 'POST') {
			postBody = postedBody({ url, init });
			return jsonResponse(
				{ id: 21, body: 'fresh post', handle: 'a3f9', mine: true, createdAt: ago(0), likes: 0, liked: false, replyCount: 0, replies: [] },
				201,
			);
		}
		return jsonResponse({ messages: [message()], nextBefore: null, total: 1 });
	});
	initGuestbook(board.doc, impl);
	await settling();

	board.input.value = 'fresh post';
	board.input.dispatch('input');
	assert.equal(board.counter.textContent, '10 / 500');
	assert.equal(board.send.getAttribute('aria-disabled'), 'false');

	board.send.dispatch('click');
	await settling();

	assert.deepEqual(postBody, { body: 'fresh post' });
	assert.equal(board.input.value, '');
	assert.equal(board.counter.textContent, '0 / 500');
	assert.equal(board.send.getAttribute('aria-disabled'), 'true');
	assert.equal(board.list.children.length, 2);
	assert.equal(board.list.children[0].getAttribute('data-guestbook-message'), '21');
	assert.equal(board.status.hidden, true);
});

test('initGuestbook posts replies against the thread id with a mention', async () => {
	const board = buildBoard();
	const posts: Array<Record<string, unknown>> = [];
	const { impl } = fakeFetch((url, init) => {
		if (init?.method === 'POST') {
			posts.push(postedBody({ url, init }));
			return jsonResponse(
				{ id: 77, body: '@b1c2 thanks', handle: 'a3f9', mine: true, createdAt: ago(0), likes: 0, liked: false, replyCount: 0, replies: [] },
				201,
			);
		}
		return jsonResponse({
			messages: [message({ id: 5, replyCount: 1, replies: [message({ id: 6, body: 'inner', handle: 'b1c2' })] })],
			nextBefore: null,
			total: 1,
		});
	});
	initGuestbook(board.doc, impl);
	await settling();

	const row = board.list.children[0];
	const inner = row.querySelector('.gb-reply-item');
	inner?.querySelector('[data-guestbook-reply-action]')?.dispatch('click');
	assert.equal(board.replyPill.hidden, false);
	assert.equal(board.replyTarget.textContent, 'Replying to b1c2');
	assert.equal(board.input.value, '@b1c2 ');
	assert.equal(board.input.focused, true);
	assert.equal(board.input.selectionStart, board.input.value.length);

	board.input.value = '@b1c2 thanks';
	board.input.dispatch('input');
	board.send.dispatch('click');
	await settling();

	assert.deepEqual(posts[0], { body: '@b1c2 thanks', parentId: 5 });
	assert.equal(board.replyPill.hidden, true);
	assert.equal(board.replyTarget.textContent, '');
	assert.equal(row.querySelectorAll('.gb-reply-item').length, 2);

	row.querySelector('[data-guestbook-reply-action]')?.dispatch('click');
	assert.equal(board.replyTarget.textContent, 'Replying to a3f9');
	assert.equal(board.input.value, '');
	board.cancelReply.dispatch('click');
	assert.equal(board.replyPill.hidden, true);
	assert.equal(board.replyTarget.textContent, '');
});

test('initGuestbook keeps the composer usable after a refusal', async () => {
	const board = buildBoard();
	const { impl, calls } = fakeFetch((_url, init) => {
		if (init?.method === 'POST') {
			return jsonResponse({ error: { code: 'rate_limited', message: 'slow' } }, 429, { 'retry-after': '30' });
		}
		return jsonResponse({ messages: [message()], nextBefore: null, total: 1 });
	});
	initGuestbook(board.doc, impl);
	await settling();

	board.input.value = 'over the line';
	board.input.dispatch('input');
	board.send.dispatch('click');
	await settling();

	assert.equal(board.rateNote.hidden, false);
	assert.equal(board.rateNote.textContent, 'slow down for 30');
	assert.equal(board.input.value, 'over the line');
	assert.equal(board.send.getAttribute('aria-disabled'), 'false');
	const postsAfterRefusal = calls.length;

	board.input.value = 'x'.repeat(502);
	board.input.dispatch('input');
	assert.equal(board.limitNote.hidden, false);
	assert.equal(board.counter.getAttribute('data-over'), 'true');
	assert.equal(board.counter.textContent, '502 / 500');
	assert.equal(board.send.getAttribute('aria-disabled'), 'true');

	const shortcut = board.input.dispatch('keydown', { key: 'Enter', metaKey: true });
	assert.equal(shortcut.prevented, true);
	await settling();
	assert.equal(calls.length, postsAfterRefusal);
});

test('initGuestbook flips likes optimistically and rolls back', async () => {
	const board = buildBoard();
	const { impl, calls } = fakeFetch((_url, init) => {
		if (init?.method === 'POST') return jsonResponse({ error: { code: 'not_author', message: 'nope' } }, 403);
		return jsonResponse({ messages: [message({ likes: 2, liked: false })], nextBefore: null, total: 1 });
	});
	initGuestbook(board.doc, impl);
	await settling();

	const like = board.list.children[0].querySelector('[data-guestbook-like]');
	assert.notEqual(like, null);
	if (!like) throw new Error('missing like button');
	like.dispatch('click');
	assert.equal(like.getAttribute('aria-pressed'), 'true');
	assert.equal(like.getAttribute('aria-label'), 'Unlike');
	assert.equal(like.getAttribute('aria-disabled'), 'true');
	assert.equal(like.querySelector('[data-guestbook-like-count]')?.textContent, '3');

	await settling();
	assert.equal(calls[1].url, '/api/guestbook/like');
	assert.deepEqual(postedBody(calls[1]), { id: 5, liked: true });
	assert.equal(like.getAttribute('aria-pressed'), 'false');
	assert.equal(like.getAttribute('aria-label'), 'Like');
	assert.equal(like.getAttribute('aria-disabled'), null);
	assert.equal(like.querySelector('[data-guestbook-like-count]')?.textContent, '2');
	assert.equal(board.status.textContent, 'not author');
});

test('initGuestbook retracts an own message and drops the row', async () => {
	const board = buildBoard();
	const { impl, calls } = fakeFetch((_url, init) => {
		if (init?.method === 'POST') return jsonResponse({ id: 5, removed: true });
		return jsonResponse({
			messages: [message({ mine: true, likes: 0, replyCount: 1, replies: [message({ id: 6 })] })],
			nextBefore: null,
			total: 1,
		});
	});
	initGuestbook(board.doc, impl);
	await settling();

	const row = board.list.children[0];
	row.querySelector('[data-guestbook-retract]')?.dispatch('click');
	await settling();

	assert.equal(calls[1].url, '/api/guestbook/remove');
	assert.deepEqual(postedBody(calls[1]), { id: 5 });
	assert.equal(board.list.children.length, 0);
	assert.equal(row.parent, null);
	assert.equal(board.status.textContent, 'Retracted');
});

test('initGuestbook drives the emoji picker from the keyboard and the pointer', async () => {
	const board = buildBoard();
	const { impl } = fakeFetch(() => jsonResponse({ messages: [message()], nextBefore: null, total: 1 }));
	initGuestbook(board.doc, impl);
	await settling();

	assert.equal(board.emojiToggle.getAttribute('aria-expanded'), 'false');
	board.emojiToggle.dispatch('click');
	assert.equal(board.panel.hidden, false);
	assert.equal(board.emojiToggle.getAttribute('aria-expanded'), 'true');

	board.input.value = 'hi';
	board.input.selectionStart = 1;
	board.input.selectionEnd = 1;
	board.glyphs[0].dispatch('click', { detail: 1 });
	assert.equal(board.input.value, 'h😀i');
	assert.equal(board.input.selectionStart, 3);
	assert.equal(board.counter.textContent, '3 / 500');
	assert.equal(board.input.focused, true);

	board.panel.dispatch('keydown', { key: 'ArrowRight', target: board.glyphs[0] });
	assert.equal(board.glyphs[1].focused, true);
	board.glyphs[1].dispatch('click', { detail: 0 });
	assert.equal(board.input.value, 'h😀😄i');
	assert.equal(board.glyphs[1].focused, true);

	board.panel.dispatch('keydown', { key: 'Escape' });
	assert.equal(board.panel.hidden, true);
	assert.equal(board.emojiToggle.getAttribute('aria-expanded'), 'false');
	assert.equal(board.emojiToggle.focused, true);

	board.emojiToggle.dispatch('click');
	assert.equal(board.panel.hidden, false);
	board.stub.dispatch('click', { target: board.list });
	assert.equal(board.panel.hidden, true);

	board.emojiToggle.dispatch('click');
	board.stub.dispatch('click', { target: board.glyphs[0] });
	assert.equal(board.panel.hidden, false);
});
