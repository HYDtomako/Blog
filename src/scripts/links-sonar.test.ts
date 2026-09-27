import assert from 'node:assert/strict';
import test from 'node:test';
import {
	applyTemplate,
	cardPlacement,
	initLinksSonar,
	nextSignalAction,
	parseSubmission,
	parseSubmitResponse,
	parseWall,
	readLinksConfig,
	submissionDate,
	type LinksLabels,
} from './links-sonar.ts';

type StubEvent = {
	target?: unknown;
	key?: string;
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
	src = '';
	disabled = false;
	clientWidth = 0;
	clientHeight = 0;
	offsetWidth = 0;
	offsetHeight = 0;
	children: StubNode[] = [];
	parent: StubNode | null = null;
	attributes = new Map<string, string>();
	listeners = new Map<string, Array<(event: StubEvent) => void>>();
	properties = new Map<string, string>();
	style = {
		setProperty: (name: string, value: string) => {
			this.properties.set(name, value);
		},
		getPropertyValue: (name: string) => this.properties.get(name) ?? '',
	};
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
			deleteProperty(_target, property) {
				if (typeof property !== 'string') return false;
				attributes.delete(`data-${hyphenate(property)}`);
				return true;
			},
		});
	}

	get content() {
		return { firstElementChild: this.children[0] ?? null };
	}

	appendChild(node: StubNode) {
		node.parent = this;
		this.children.push(node);
		return node;
	}

	append(...nodes: StubNode[]) {
		for (const node of nodes) this.appendChild(node);
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

	toggleAttribute(name: string, force?: boolean) {
		const next = force ?? !this.attributes.has(name);
		if (next) this.attributes.set(name, '');
		else this.attributes.delete(name);
	}

	addEventListener(type: string, handler: (event: StubEvent) => void) {
		const handlers = this.listeners.get(type) ?? [];
		handlers.push(handler);
		this.listeners.set(type, handlers);
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

	cloneNode(deep = false): StubNode {
		const copy = new StubNode(this.tagName);
		copy.className = this.className;
		copy.hidden = this.hidden;
		copy.offsetWidth = this.offsetWidth;
		copy.offsetHeight = this.offsetHeight;
		for (const [name, value] of this.attributes) copy.attributes.set(name, value);
		if (deep) for (const child of this.children) copy.appendChild(child.cloneNode(true));
		return copy;
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
		if (selector === '[data-links-sonar]') return this.root;
		return this.root.querySelector(selector);
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

const TEST_LABELS: LinksLabels = {
	connect: 'Connect',
	connecting: 'Connecting',
	received: 'SIGNAL RECEIVED',
	receivedNote: 'on the wall now',
	wallLoading: 'loading wall',
	wallEmpty: 'no signals yet',
	wallFailed: 'wall failed',
	wallWaiting: 'waiting',
	wallJoined: 'on the sonar',
	errorTitle: 'SIGNAL LOST',
	openSiteTemplate: 'Open __NAME__',
	errors: {
		invalid_url: 'invalid url',
		signal_lost: 'unreachable site',
		rate_limited: 'rate limited',
		links_unavailable: 'links unavailable',
		invalid_content_type: 'invalid content type',
		invalid_body: 'invalid body',
		method_not_allowed: 'method not allowed',
		unavailable: 'temporarily unavailable',
	},
};

/** A row skeleton, exactly as `LinksSonar.astro` ships it. */
function buildRowTemplate() {
	const template = new StubNode('template');
	template.setAttribute('data-links-wall-template', '');
	const row = new StubNode('li');
	row.className = 'ls-row';
	const link = new StubNode('a');
	link.className = 'ls-row-link';
	for (const key of ['initial', 'icon', 'name', 'domain', 'state', 'date']) {
		const field = new StubNode(key === 'icon' ? 'img' : 'span');
		field.setAttribute('data-links-field', key);
		link.appendChild(field);
	}
	row.appendChild(link);
	template.appendChild(row);
	return template;
}

function buildSonar(options: { fine?: boolean; endpoint?: string; joined?: string[] } = {}) {
	const root = new StubNode('section');
	root.setAttribute('data-links-sonar', '');
	root.setAttribute('data-links-endpoint', options.endpoint ?? '/api/links');
	root.setAttribute('data-links-joined', JSON.stringify(options.joined ?? []));
	root.setAttribute('data-links-labels', JSON.stringify(TEST_LABELS));

	const stage = new StubNode('div');
	stage.setAttribute('data-links-stage', '');
	stage.clientWidth = 600;
	stage.clientHeight = 600;
	root.appendChild(stage);

	const signal = new StubNode('a');
	signal.className = 'ls-signal';
	signal.setAttribute('data-links-signal', '');
	signal.setAttribute('data-x', '0.2');
	signal.setAttribute('data-y', '0.3');
	const card = new StubNode('span');
	card.className = 'ls-card';
	card.offsetWidth = 240;
	card.offsetHeight = 110;
	signal.appendChild(card);
	stage.appendChild(signal);

	const form = new StubNode('form');
	form.setAttribute('data-links-form', '');
	const input = new StubNode('input');
	input.setAttribute('data-links-input', '');
	const submit = new StubNode('button');
	submit.setAttribute('data-links-submit', '');
	const status = new StubNode('p');
	status.setAttribute('data-links-status', '');
	form.appendChild(input);
	form.appendChild(submit);
	root.appendChild(form);
	root.appendChild(status);

	const wall = new StubNode('section');
	wall.setAttribute('data-links-wall', '');
	const wallStatus = new StubNode('p');
	wallStatus.setAttribute('data-links-wall-status', '');
	const wallList = new StubNode('ul');
	wallList.setAttribute('data-links-wall-list', '');
	wallList.hidden = true;
	const wallEmpty = new StubNode('p');
	wallEmpty.setAttribute('data-links-wall-empty', '');
	wallEmpty.hidden = true;
	wall.append(wallStatus, wallList, wallEmpty);
	root.appendChild(wall);
	root.appendChild(buildRowTemplate());

	const cta = new StubNode('div');
	cta.setAttribute('data-links-cta', '');
	root.appendChild(cta);

	const doc = new StubDocument(root);
	const win = {
		matchMedia: () => ({ matches: options.fine !== false }),
	} as unknown as Window;
	return { doc, stub: doc, win, root, stage, signal, form, input, submit, status, cta, wallRoot: wall, wallList, wallStatus, wallEmpty };
}

function jsonResponse(body: unknown, status = 200) {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: async () => body,
	} as unknown as Response;
}

function fakeFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
	const calls: Array<{ url: string; init?: RequestInit }> = [];
	const impl = (async (url: string, init?: RequestInit) => {
		calls.push({ url: String(url), init });
		return handler(String(url), init);
	}) as unknown as typeof fetch;
	return { impl, calls };
}

const settling = () => new Promise((resolve) => setTimeout(resolve, 0));

const submission = (name: string, url: string, createdAt = '2026-09-27 04:10:11') => ({
	url,
	name,
	domain: url.replace('https://', '').replace(/\/$/, ''),
	description: `${name} description`,
	icon: '',
	createdAt,
});

test('wall and submit payloads are read defensively', () => {
	assert.deepEqual(parseSubmission(submission('Example', 'https://example.com/')), {
		url: 'https://example.com/',
		name: 'Example',
		domain: 'example.com',
		description: 'Example description',
		icon: '',
		createdAt: '2026-09-27 04:10:11',
	});
	assert.equal(parseSubmission({ name: 'no url' }), null);
	assert.equal(parseSubmission(null), null);

	const wall = parseWall({
		submissions: [submission('Example', 'https://example.com/'), { junk: true }, 'nope'],
		total: 9,
	});
	assert.equal(wall?.submissions.length, 1);
	assert.equal(wall?.total, 9);
	assert.equal(parseWall({}), null);
	assert.equal(parseWall(null), null);
	assert.equal(submissionDate('2026-09-27 04:10:11'), '2026-09-27');

	assert.deepEqual(parseSubmitResponse(submission('Example', 'https://example.com/')), {
		ok: true,
		submission: parseSubmission(submission('Example', 'https://example.com/')),
	});
	assert.deepEqual(parseSubmitResponse({ error: { code: 'signal_lost' } }), { ok: false, code: 'signal_lost' });
	assert.deepEqual(parseSubmitResponse({ error: { code: 'made_up' } }), { ok: false, code: 'unavailable' });
	assert.deepEqual(parseSubmitResponse(null), { ok: false, code: 'unavailable' });
});

test('the card stays inside the stage and flips away from the nearest edge', () => {
	// Offsets are relative to the dot: +14px opens to its right, -55px centres it vertically.
	assert.deepEqual(
		cardPlacement({ signalX: 0.2, signalY: 0.3, stageWidth: 600, stageHeight: 600, cardWidth: 240, cardHeight: 110 }),
		{ x: 14, y: -55, side: 'right', linkY: 55 },
	);
	assert.deepEqual(
		cardPlacement({ signalX: 0.85, signalY: 0.5, stageWidth: 600, stageHeight: 600, cardWidth: 240, cardHeight: 110 }),
		{ x: -254, y: -55, side: 'left', linkY: 55 },
	);

	// A dot close to the right edge would overflow, so the card flips left and clamps.
	const flipped = cardPlacement({
		signalX: 0.55,
		signalY: 0.1,
		stageWidth: 600,
		stageHeight: 600,
		cardWidth: 240,
		cardHeight: 110,
	});
	assert.equal(flipped.side, 'left');
	const flippedAbsoluteX = 0.55 * 600 + flipped.x;
	assert.ok(flippedAbsoluteX >= 0 && flippedAbsoluteX + 240 <= 600);

	// In a stage too narrow for either side, the card is clamped rather than clipped.
	const narrow = cardPlacement({
		signalX: 0.5,
		signalY: 0.5,
		stageWidth: 260,
		stageHeight: 400,
		cardWidth: 240,
		cardHeight: 110,
	});
	const narrowX = 0.5 * 260 + narrow.x;
	const narrowY = 0.5 * 400 + narrow.y;
	assert.ok(narrowX >= 0 && narrowX + 240 <= 260);
	assert.ok(narrowY >= 0 && narrowY + 110 <= 400);

	// Bottom edge: the card is pulled up inside the stage, and the hairline follows the dot down.
	const bottom = cardPlacement({
		signalX: 0.2,
		signalY: 0.95,
		stageWidth: 600,
		stageHeight: 600,
		cardWidth: 240,
		cardHeight: 110,
	});
	assert.equal(0.95 * 600 + bottom.y, 490);
	assert.equal(bottom.linkY, 80);
});

test('a coarse pointer opens the card first and follows on the second tap', () => {
	assert.equal(nextSignalAction('fine', false), 'follow');
	assert.equal(nextSignalAction('fine', true), 'follow');
	assert.equal(nextSignalAction('coarse', false), 'open');
	assert.equal(nextSignalAction('coarse', true), 'follow');
	assert.equal(applyTemplate('Open __NAME__', '__NAME__', 'Astro'), 'Open Astro');
});

test('labels, joined urls and fallbacks survive a broken payload', () => {
	const { root } = buildSonar({ joined: ['https://astro.build/'] });
	const config = readLinksConfig(root as unknown as HTMLElement);
	assert.equal(config?.endpoint, '/api/links');
	assert.equal(config?.labels.received, TEST_LABELS.received);
	assert.equal(config?.joined.has('https://astro.build/'), true);

	root.setAttribute('data-links-labels', '{not json');
	root.setAttribute('data-links-joined', '{not json');
	const broken = readLinksConfig(root as unknown as HTMLElement);
	assert.equal(broken?.labels.errors.signal_lost, 'Unable to reach this site. Please check the URL and try again.');
	assert.equal(broken?.joined.size, 0);

	const plain = new StubNode('section');
	assert.equal(readLinksConfig(plain as unknown as HTMLElement), null);
});

test('hovering a signal on a fine pointer opens its card in place', () => {
	const stub = buildSonar();
	initLinksSonar(stub.doc as unknown as Document, stub.win);

	stub.signal.dispatch('pointerenter');
	assert.equal(stub.signal.getAttribute('data-open'), 'true');
	assert.equal(stub.signal.getAttribute('data-card-side'), 'right');
	assert.equal(stub.stage.getAttribute('data-active'), 'true');
	assert.equal(stub.signal.style.getPropertyValue('--ls-card-x'), '14px');
	assert.equal(stub.signal.style.getPropertyValue('--ls-card-y'), '-55px');
	assert.equal(stub.signal.style.getPropertyValue('--ls-link-y'), '55px');

	stub.signal.dispatch('pointerleave');
	assert.equal(stub.signal.getAttribute('data-open'), null);
	assert.equal(stub.stage.getAttribute('data-active'), null);

	stub.signal.dispatch('focusin');
	assert.equal(stub.signal.getAttribute('data-open'), 'true');
	stub.stub.dispatch('keydown', { key: 'Escape' });
	assert.equal(stub.signal.getAttribute('data-open'), null);
});

test('a touch tap opens the card before it follows the link', () => {
	const stub = buildSonar({ fine: false });
	initLinksSonar(stub.doc as unknown as Document, stub.win);

	const first = stub.signal.dispatch('click');
	assert.equal(first.prevented, true);
	assert.equal(stub.signal.getAttribute('data-open'), 'true');

	const second = stub.signal.dispatch('click');
	assert.equal(second.prevented, false);
});

test('the wall lists what other people sent in and marks the ones already on the sonar', async () => {
	const stub = buildSonar({ joined: ['https://astro.build/'] });
	const { impl, calls } = fakeFetch(() =>
		jsonResponse({
			submissions: [submission('Newest', 'https://newest.example.com/'), submission('Astro', 'https://astro.build/')],
			total: 2,
		}),
	);
	initLinksSonar(stub.doc as unknown as Document, stub.win, impl);
	assert.equal(stub.wallStatus.textContent, TEST_LABELS.wallLoading);
	await settling();

	assert.equal(calls.length, 1);
	assert.equal(calls[0].url, '/api/links');
	assert.equal(calls[0].init?.method, undefined);
	assert.deepEqual(calls[0].init?.headers, { accept: 'application/json' });
	assert.equal(stub.wallStatus.textContent, '');

	const rows = stub.wallList.querySelectorAll('.ls-row');
	assert.equal(rows.length, 2);
	assert.equal(stub.wallList.hidden, false);
	assert.equal(stub.wallEmpty.getAttribute('hidden'), '');
	const field = (row: StubNode, name: string) => row.querySelector(`[data-links-field="${name}"]`);
	assert.equal(field(rows[0], 'name')?.textContent, 'Newest');
	assert.equal(field(rows[0], 'date')?.textContent, '2026-09-27');
	assert.equal(field(rows[0], 'state')?.textContent, TEST_LABELS.wallWaiting);
	assert.equal(rows[0].querySelector('.ls-row-link')?.getAttribute('href'), 'https://newest.example.com/');
	assert.equal(rows[0].getAttribute('data-joined'), 'false');

	assert.equal(field(rows[1], 'state')?.textContent, TEST_LABELS.wallJoined);
	assert.equal(rows[1].getAttribute('data-joined'), 'true');
});

test('an empty wall says so, a broken wall says it failed', async () => {
	const empty = buildSonar();
	initLinksSonar(
		empty.doc as unknown as Document,
		empty.win,
		fakeFetch(() => jsonResponse({ submissions: [], total: 0 })).impl,
	);
	await settling();
	assert.equal(empty.wallList.hidden, true);
	assert.equal(empty.wallEmpty.getAttribute('hidden'), null);
	assert.equal(empty.wallStatus.textContent, '');

	const broken = buildSonar();
	initLinksSonar(
		broken.doc as unknown as Document,
		broken.win,
		fakeFetch(() => jsonResponse({ error: { code: 'links_unavailable' } }, 503)).impl,
	);
	await settling();
	assert.equal(broken.wallStatus.textContent, TEST_LABELS.wallFailed);
	assert.equal(broken.wallList.hidden, true);

	const offline = buildSonar();
	initLinksSonar(
		offline.doc as unknown as Document,
		offline.win,
		(async () => {
			throw new Error('offline');
		}) as unknown as typeof fetch,
	);
	await settling();
	assert.equal(offline.wallStatus.textContent, TEST_LABELS.wallFailed);
});

test('a build with no api hides the invitation instead of complaining', async () => {
	const stub = buildSonar();
	const { impl } = fakeFetch(() => jsonResponse({}, 404));
	initLinksSonar(stub.doc as unknown as Document, stub.win, impl);
	await settling();

	assert.equal(stub.cta.getAttribute('hidden'), '');
	assert.equal(stub.wallRoot.getAttribute('hidden'), '');
	assert.equal(stub.wallStatus.textContent, '');
});

test('a submitted url is posted and shows up at the top of the wall', async () => {
	const stub = buildSonar({ joined: ['https://astro.build/'] });
	const { impl, calls } = fakeFetch((_url, init) =>
		init?.method === 'POST'
			? jsonResponse(submission('Fresh', 'https://astro.build/'))
			: jsonResponse({ submissions: [], total: 0 }),
	);
	initLinksSonar(stub.doc as unknown as Document, stub.win, impl);
	await settling();

	stub.input.value = 'astro.build';
	stub.form.dispatch('submit');
	assert.equal(stub.status.textContent, TEST_LABELS.connecting);
	await settling();

	const post = calls.find((call) => call.init?.method === 'POST');
	assert.equal(post?.url, '/api/links');
	assert.deepEqual(JSON.parse(String(post?.init?.body)), { url: 'astro.build' });

	const rows = stub.wallList.querySelectorAll('.ls-row');
	assert.equal(rows.length, 1);
	assert.equal(stub.wallList.hidden, false);
	assert.equal(rows[0].querySelector('[data-links-field="name"]')?.textContent, 'Fresh');
	assert.equal(rows[0].getAttribute('data-joined'), 'true');
	assert.equal(stub.input.value, '');
	assert.equal(stub.status.textContent, `${TEST_LABELS.received} — ${TEST_LABELS.receivedNote}`);
	assert.equal(stub.status.getAttribute('data-state'), 'ok');
});

test('an unreachable site reports SIGNAL LOST and keeps the wall untouched', async () => {
	const stub = buildSonar();
	const { impl } = fakeFetch((_url, init) =>
		init?.method === 'POST'
			? jsonResponse({ error: { code: 'signal_lost' } }, 502)
			: jsonResponse({ submissions: [], total: 0 }),
	);
	initLinksSonar(stub.doc as unknown as Document, stub.win, impl);
	await settling();

	stub.input.value = 'https://gone.example.com/';
	stub.form.dispatch('submit');
	await settling();

	assert.equal(stub.status.textContent, 'SIGNAL LOST — unreachable site');
	assert.equal(stub.status.getAttribute('data-state'), 'error');
	assert.equal(stub.input.getAttribute('aria-invalid'), 'true');
	assert.equal(stub.wallList.querySelectorAll('.ls-row').length, 0);
	assert.equal(stub.submit.disabled, false);
});

test('the sonar still opens cards when submissions are switched off', () => {
	const stub = buildSonar({ endpoint: '' });
	initLinksSonar(stub.doc as unknown as Document, stub.win);
	stub.signal.dispatch('pointerenter');
	assert.equal(stub.signal.getAttribute('data-open'), 'true');

	stub.input.value = 'https://example.com/';
	stub.form.dispatch('submit');
	assert.equal(stub.status.textContent, '');
});
