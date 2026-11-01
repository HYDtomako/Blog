import { createBlaze, type BlazeInstance, type BlazeOptions } from '../components/canvasui/BlazeVanilla.ts';
import { createFlameWrap, type FlameWrapInstance, type FlameWrapOptions } from '../components/canvasui/FlameWrapVanilla.ts';
import { createRipple, type RippleInstance, type RippleOptions } from '../components/canvasui/RippleVanilla.ts';
import { sitePath, stripBase } from '../lib/paths.ts';

/** Site sonar accents. Light `#005fcc`, dark `#7fb4d8`. */
export const LINKS_FX_ACCENT = {
	light: '#005fcc',
	dark: '#7fb4d8',
} as const;

export type LinksFxTheme = keyof typeof LINKS_FX_ACCENT;
export type Rgb01 = [number, number, number];

export type LinksFxPalette = {
	spark: Rgb01;
	smoke: Rgb01;
	flame: Rgb01;
};

const DEMO_BLAZE = { sparks: 0.5, smoke: 0.5, glow: 1.5 };
const DEMO_FLAME = { intensity: 0.5, height: 170, sparks: 1.5, smoke: 1.5, ember: 2, rim: 2.5 };

/**
 * Bottom heat band, as a fraction of the viewport. The blaze canvas is only
 * this tall, and the shader fills that band (`height: 1`) instead of the demo's
 * near-fullscreen fire.
 */
export const BLAZE_BAND = 0.32;

export function hexToRgb01(hex: string): Rgb01 {
	const value = hex.replace('#', '');
	return [
		Number.parseInt(value.slice(0, 2), 16) / 255,
		Number.parseInt(value.slice(2, 4), 16) / 255,
		Number.parseInt(value.slice(4, 6), 16) / 255,
	];
}
export function hashString(input: string): number {
	let hash = 2166136261;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

/** HSL → RGB in 0–1. Hue is degrees. */
export function hslToRgb01(hue: number, saturation: number, lightness: number): Rgb01 {
	const h = ((hue % 360) + 360) % 360 / 360;
	const s = Math.min(Math.max(saturation, 0), 1);
	const l = Math.min(Math.max(lightness, 0), 1);
	if (s < 1e-6) return [l, l, l];
	const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	const p = 2 * l - q;
	const channel = (t: number) => {
		let u = t;
		if (u < 0) u += 1;
		if (u > 1) u -= 1;
		if (u < 1 / 6) return p + (q - p) * 6 * u;
		if (u < 1 / 2) return q;
		if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
		return p;
	};
	return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)];
}

/**
 * Non-default locale URL segments. Mirrors `PREFIXED_LOCALES` in `src/lib/locale.ts`
 * (`en` today). Kept here so the client flame script does not import `site.config`.
 */
export const FLAME_LOCALE_PREFIXES = ['en'] as const;

/**
 * Locale-invariant flame identity.
 * Absolute friend URLs stay the canonical string already stored on the card
 * (submission `URL.href`), so their tint does not move.
 * Site paths drop the deploy base and any locale prefix, then use the canonical
 * trailing-slash path: HOST `/about/` and `/en/about/` share one key.
 */
export function flameIdentityKey(raw: string, base?: string): string {
	const trimmed = raw.trim();
	if (!trimmed || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
	const [pathOnly, suffix = ''] = trimmed.split(/(?=[#?])/);
	const withSlash = pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
	let path = stripBase(withSlash, base);
	if (!path.startsWith('/')) path = `/${path}`;
	for (const locale of FLAME_LOCALE_PREFIXES) {
		const prefix = `/${locale}`;
		if (path === prefix || path === `${prefix}/`) {
			path = '/';
			break;
		}
		if (path.startsWith(`${prefix}/`)) {
			path = path.slice(prefix.length);
			break;
		}
	}
	return sitePath(`${path}${suffix}`);
}

/**
 * Stable “random” flame tint for one friend-link entry.
 * Same key → same color across reloads; different keys fan across the hue wheel.
 * Path keys are normalized first so locale variants of one page share a tint.
 */
export function flameColorForKey(key: string, theme: LinksFxTheme = 'light'): Rgb01 {
	const hash = hashString(flameIdentityKey(key).toLowerCase());
	const hue = hash % 360;
	const saturation = 0.58 + ((hash >>> 9) % 22) / 100;
	const lightness = theme === 'dark' ? 0.64 : 0.5;
	return hslToRgb01(hue, saturation, lightness);
}

/** Prefer the signal URL; fall back to the visit link or card label. */
export function flameKeyFromCard(card: HTMLElement): string {
	const signal = card.closest?.('[data-links-signal]');
	const fromSignal = signal?.getAttribute?.('data-url')?.trim();
	if (fromSignal) return flameIdentityKey(fromSignal);
	const visit = card.querySelector?.<HTMLAnchorElement>('.ls-card-visit, a[href]');
	const href = visit?.getAttribute?.('href')?.trim() || visit?.href?.trim();
	if (href) return flameIdentityKey(href);
	return card.getAttribute?.('aria-label')?.trim() || 'links-card';
}


export function linksFxPalette(theme: LinksFxTheme): LinksFxPalette {
	const accent = hexToRgb01(LINKS_FX_ACCENT[theme]);
	return { spark: accent, smoke: accent, flame: accent };
}

export function linksFxTheme(datasetTheme: string | null | undefined, prefersDark: boolean): LinksFxTheme {
	if (datasetTheme === 'dark' || datasetTheme === 'light') return datasetTheme;
	return prefersDark ? 'dark' : 'light';
}

/** Effects stay off without WebGL2 and when the visitor asks for less motion. */
export function linksCanvasEnabled(reducedMotion: boolean, webgl2: boolean): boolean {
	return webgl2 && !reducedMotion;
}

export function flameCardShouldMount(cardOpen: boolean, intersecting: boolean, effectsEnabled: boolean): boolean {
	return effectsEnabled && cardOpen && intersecting;
}

export type ViewportRect = { top: number; left: number; bottom: number; right: number; width: number; height: number };

export function elementIntersectsViewport(rect: ViewportRect, viewport: { width: number; height: number }, margin = 64): boolean {
	if (rect.width <= 0 || rect.height <= 0) return false;
	return rect.bottom >= -margin && rect.right >= -margin && rect.top <= viewport.height + margin && rect.left <= viewport.width + margin;
}

/** Outset of the flame canvas, matching the Canvas UI wrapper so licks are not clipped. */
export function flameWrapCanvasOutset(height: number, spread: number): { reach: number; glow: number } {
	const reach = Math.round(Math.max(height, 24) * 1.5) + 40;
	const glow = Math.round(Math.max(spread, 8) * 3) + 16;
	return { reach, glow };
}

export function rippleOptions(): RippleOptions {
	return {
		amplitude: 0.95,
		speed: 0.7,
		wavelength: 72,
		rings: 3,
		decay: 0.85,
		refraction: 120,
		dispersion: 0.45,
		shine: 0.85,
		trigger: 'click',
		interval: 0,
		capture: false,
	};
}

export function blazeOptions(palette: LinksFxPalette): BlazeOptions {
	return {
		height: 1,
		distortion: 0.48,
		distortionScale: 0.55,
		speed: 0.9,
		sparks: 0.48,
		sparkDensity: 1.45,
		sparkSize: 1.05,
		layers: 4,
		smoke: 0.46,
		glow: 1.42,
		sparkColor: palette.spark,
		smokeColor: palette.smoke,
		capture: false,
	};
}

export function flameOptions(palette: LinksFxPalette, color: Rgb01 = palette.flame): FlameWrapOptions {
	return {
		color,
		intensity: 0.34,
		height: 36,
		spread: 8,
		radius: 10,
		speed: 0.18,
		scale: 0.62,
		turbulence: 0.32,
		turbulenceScale: 0.45,
		turbulenceReach: 12,
		sparks: 0.45,
		sparkSize: 0.28,
		sparkDensity: 0.55,
		sparkSpeed: 0.7,
		rim: 0.8,
		melt: 1.4,
		distortion: 2.5,
		smoke: 0.32,
		ember: 0.5,
		scorch: 0,
		capture: false,
	};
}

export function blazeIsRestrained(options: BlazeOptions): boolean {
	return (options.sparks ?? 1) < DEMO_BLAZE.sparks && (options.smoke ?? 1) < DEMO_BLAZE.smoke && (options.glow ?? 2) < DEMO_BLAZE.glow;
}

export function flameIsRestrained(options: FlameWrapOptions): boolean {
	return (
		(options.intensity ?? 1) < DEMO_FLAME.intensity &&
		(options.height ?? 999) < DEMO_FLAME.height &&
		(options.sparks ?? 9) < DEMO_FLAME.sparks &&
		(options.smoke ?? 9) < DEMO_FLAME.smoke &&
		(options.ember ?? 9) < DEMO_FLAME.ember &&
		(options.rim ?? 9) < DEMO_FLAME.rim
	);
}

type FxHandle = {
	setPalette: (palette: LinksFxPalette) => void;
	destroy: () => void;
};

type CardRecord = {
	intersecting: boolean;
	reported: boolean;
	handle: FxHandle | null;
};

function supportsWebGL2(doc: Document): boolean {
	try {
		const canvas = doc.createElement('canvas');
		const gl = canvas.getContext('webgl2');
		if (!gl || gl.isContextLost()) return false;
		gl.getExtension('WEBGL_lose_context')?.loseContext();
		return true;
	} catch {
		return false;
	}
}

function readTheme(doc: Document, win: Window): LinksFxTheme {
	let prefersDark = false;
	try {
		prefersDark = win.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
	} catch {
		prefersDark = false;
	}
	return linksFxTheme(doc.documentElement?.dataset?.theme, prefersDark);
}

function paintOutput(canvas: HTMLCanvasElement): void {
	canvas.className = 'ls-fx-output';
	canvas.setAttribute('aria-hidden', 'true');
	canvas.dataset.linksFx = 'output';
}

function hiddenSource(doc: Document): HTMLCanvasElement {
	const source = doc.createElement('canvas');
	source.className = 'ls-fx-source';
	source.dataset.linksFx = 'source';
	source.setAttribute('aria-hidden', 'true');
	source.hidden = true;
	return source;
}

/**
 * Page-wide click ripples, a restrained blue-cyan blaze along the viewport bottom,
 * and one FlameWrap per open card that is actually on screen.
 * Both `/links` and `/en/links` render `LinksSonar`, which calls this once.
 */
function mountLinksCanvasFx(doc: Document, win: Window): () => void {
	const root = doc.querySelector<HTMLElement>('[data-links-sonar]');
	if (!root || root.dataset.linksCanvasFx === 'on' || root.dataset.linksCanvasFx === 'off') return () => {};

	let reducedMotion = false;
	let motionQuery: MediaQueryList | null = null;
	try {
		motionQuery = win.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
		reducedMotion = motionQuery?.matches === true;
	} catch {
		reducedMotion = false;
	}

	if (!linksCanvasEnabled(reducedMotion, supportsWebGL2(doc))) {
		root.dataset.linksCanvasFx = 'off';
		const onMotion = () => {
			const reduce = motionQuery?.matches === true;
			if (!reduce && supportsWebGL2(doc)) {
				delete root.dataset.linksCanvasFx;
				initLinksCanvasFx(doc, win);
			}
		};
		motionQuery?.addEventListener?.('change', onMotion);
		return () => {
			motionQuery?.removeEventListener?.('change', onMotion);
			if (root.dataset.linksCanvasFx === 'off') delete root.dataset.linksCanvasFx;
		};
	}

	root.dataset.linksCanvasFx = 'on';
	let palette = linksFxPalette(readTheme(doc, win));
	let ripple: FxHandle | null = null;
	let blaze: FxHandle | null = null;
	const cards = new Map<HTMLElement, CardRecord>();
	let syncing = false;
	let stopped = false;

	const pushPalette = () => {
		palette = linksFxPalette(readTheme(doc, win));
		ripple?.setPalette(palette);
		blaze?.setPalette(palette);
		for (const record of cards.values()) record.handle?.setPalette(palette);
	};

	const mountRipple = (): FxHandle | null => {
		const host = doc.createElement('div');
		host.className = 'ls-fx-ripple';
		host.dataset.linksFx = 'ripple';
		host.setAttribute('aria-hidden', 'true');
		const source = hiddenSource(doc);
		const output = doc.createElement('canvas');
		paintOutput(output);
		const content = doc.body;
		if (!content) return null;
		host.append(source, output);
		doc.body.append(host);
		const instance: RippleInstance | null = createRipple({ source, content, output }, rippleOptions());
		if (!instance) {
			host.remove();
			return null;
		}
		return {
			setPalette() {},
			destroy() {
				instance.destroy();
				host.remove();
			},
		};
	};

	const mountBlaze = (): FxHandle | null => {
		const host = doc.createElement('div');
		host.className = 'ls-fx-blaze';
		host.dataset.linksFx = 'blaze';
		host.setAttribute('aria-hidden', 'true');
		host.style.height = `${BLAZE_BAND * 100}dvh`;
		const source = hiddenSource(doc);
		const content = doc.createElement('div');
		content.className = 'ls-fx-blaze-content';
		const output = doc.createElement('canvas');
		paintOutput(output);
		host.append(source, content, output);
		doc.body.append(host);
		const instance: BlazeInstance | null = createBlaze({ source, content, output }, blazeOptions(palette));
		if (!instance) {
			host.remove();
			return null;
		}
		return {
			setPalette(next) {
				instance.setOptions({ sparkColor: next.spark, smokeColor: next.smoke });
			},
			destroy() {
				instance.destroy();
				host.remove();
			},
		};
	};

	const mountFlame = (card: HTMLElement): FxHandle | null => {
		const key = flameKeyFromCard(card);
		const tint = flameColorForKey(key, readTheme(doc, win));
		const options = flameOptions(palette, tint);
		const { reach, glow } = flameWrapCanvasOutset(options.height ?? 36, options.spread ?? 8);
		const source = hiddenSource(doc);
		const output = doc.createElement('canvas');
		output.className = 'ls-fx-flame';
		output.dataset.linksFx = 'flame';
		output.dataset.linksFxKey = key;
		output.setAttribute('aria-hidden', 'true');
		output.style.top = `${-reach}px`;
		output.style.right = `${-glow}px`;
		output.style.bottom = `${-glow}px`;
		output.style.left = `${-glow}px`;
		output.style.width = `calc(100% + ${glow * 2}px)`;
		output.style.height = `calc(100% + ${reach + glow}px)`;
		card.append(source, output);
		const instance: FlameWrapInstance | null = createFlameWrap({ source, content: card, output }, options);
		if (!instance) {
			source.remove();
			output.remove();
			return null;
		}
		return {
			setPalette() {
				instance.setOptions({ color: flameColorForKey(key, readTheme(doc, win)) });
			},
			destroy() {
				instance.destroy();
				source.remove();
				output.remove();
			},
		};
	};

	const cardIsOpen = (card: HTMLElement) => card.closest('[data-open]') !== null;

	const syncCard = (card: HTMLElement) => {
		const record = cards.get(card);
		if (!record || syncing || stopped) return;
		const intersecting = record.reported
			? record.intersecting
			: elementIntersectsViewport(card.getBoundingClientRect(), { width: win.innerWidth || 0, height: win.innerHeight || 0 });
		const want = flameCardShouldMount(cardIsOpen(card), intersecting, true);
		if (want && !record.handle) {
			syncing = true;
			try {
				record.handle = mountFlame(card);
			} finally {
				syncing = false;
			}
		} else if (!want && record.handle) {
			const handle = record.handle;
			record.handle = null;
			syncing = true;
			try {
				handle.destroy();
			} finally {
				syncing = false;
			}
		}
	};

	const intersection = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				const card = entry.target as HTMLElement;
				const record = cards.get(card);
				if (!record) continue;
				record.reported = true;
				record.intersecting = entry.isIntersecting;
				syncCard(card);
			}
		},
		{ root: null, rootMargin: '64px', threshold: 0.01 },
	);

	const watchCard = (card: HTMLElement) => {
		if (cards.has(card)) return;
		cards.set(card, { intersecting: false, reported: false, handle: null });
		intersection.observe(card);
	};

	const dropCard = (card: HTMLElement) => {
		const record = cards.get(card);
		if (!record) return;
		intersection.unobserve(card);
		record.handle?.destroy();
		cards.delete(card);
	};

	const walkCards = (node: Node, visit: (card: HTMLElement) => void) => {
		if (node.nodeType !== 1) return;
		const el = node as HTMLElement;
		if (el.classList?.contains('ls-card')) visit(el);
		el.querySelectorAll?.('.ls-card').forEach((card) => visit(card as HTMLElement));
	};

	const mutations = new MutationObserver((records) => {
		if (syncing || stopped) return;
		for (const record of records) {
			if (record.type === 'childList') {
				record.removedNodes.forEach((node) => walkCards(node, dropCard));
				record.addedNodes.forEach((node) => walkCards(node, (card) => {
					watchCard(card);
					syncCard(card);
				}));
			} else if (record.type === 'attributes' && record.attributeName === 'data-open') {
				const signal = record.target as HTMLElement;
				const card = signal.querySelector?.<HTMLElement>('.ls-card') ?? null;
				if (card) syncCard(card);
			}
		}
	});

	ripple = mountRipple();
	blaze = mountBlaze();
	root.querySelectorAll<HTMLElement>('.ls-card').forEach((card) => watchCard(card));
	mutations.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-open'] });

	const themeObserver = new MutationObserver(pushPalette);
	themeObserver.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

	let schemeQuery: MediaQueryList | null = null;
	try {
		schemeQuery = win.matchMedia?.('(prefers-color-scheme: dark)') ?? null;
	} catch {
		schemeQuery = null;
	}
	const onScheme = () => pushPalette();
	schemeQuery?.addEventListener?.('change', onScheme);

	const stop = () => {
		if (stopped) return;
		stopped = true;
		motionQuery?.removeEventListener?.('change', onReduce);
		schemeQuery?.removeEventListener?.('change', onScheme);
		themeObserver.disconnect();
		mutations.disconnect();
		intersection.disconnect();
		for (const record of cards.values()) record.handle?.destroy();
		cards.clear();
		ripple?.destroy();
		blaze?.destroy();
		ripple = null;
		blaze = null;
		if (root.dataset.linksCanvasFx === 'on') delete root.dataset.linksCanvasFx;
	};

	const onReduce = () => {
		if (!motionQuery?.matches) return;
		stop();
		root.dataset.linksCanvasFx = 'off';
		const resume = () => {
			if (motionQuery.matches) return;
			motionQuery.removeEventListener('change', resume);
			delete root.dataset.linksCanvasFx;
			initLinksCanvasFx(doc, win);
		};
		motionQuery.addEventListener('change', resume);
	};
	motionQuery?.addEventListener?.('change', onReduce);

	return stop;
}

export function initLinksCanvasFx(doc: Document = document, win: Window = window): () => void {
	try {
		return mountLinksCanvasFx(doc, win);
	} catch {
		return () => {};
	}
}
