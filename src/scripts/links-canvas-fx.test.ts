import assert from 'node:assert/strict';
import test from 'node:test';
import { PREFIXED_LOCALES } from '../lib/locale.ts';
import {
	LINKS_FX_ACCENT,
	blazeIsRestrained,
	blazeOptions,
	elementIntersectsViewport,
	flameCardShouldMount,
	flameIsRestrained,
	flameOptions,
	FLAME_LOCALE_PREFIXES,
	flameColorForKey,
	flameIdentityKey,
	flameKeyFromCard,
	flameWrapCanvasOutset,
	hashString,
	hexToRgb01,
	linksCanvasEnabled,
	linksFxPalette,
	linksFxTheme,
	rippleOptions,
} from './links-canvas-fx.ts';

const ORANGE_SPARK: [number, number, number] = [1, 0.4, 0.05];
const ORANGE_SMOKE: [number, number, number] = [1, 0.43, 0.1];

test('accent colors are the sonar blue-cyan tokens in 0–1 RGB', () => {
	assert.deepEqual(linksFxPalette('light').spark, hexToRgb01(LINKS_FX_ACCENT.light));
	assert.deepEqual(linksFxPalette('light').smoke, hexToRgb01('#005fcc'));
	assert.deepEqual(linksFxPalette('light').flame, hexToRgb01('#005fcc'));
	assert.deepEqual(linksFxPalette('dark').spark, hexToRgb01('#7fb4d8'));
	assert.deepEqual(linksFxPalette('dark').smoke, hexToRgb01('#7fb4d8'));
	assert.deepEqual(linksFxPalette('dark').flame, hexToRgb01('#7fb4d8'));
	for (const theme of ['light', 'dark'] as const) {
		for (const channel of linksFxPalette(theme).spark) {
			assert.ok(channel >= 0 && channel <= 1);
		}
		const [r, g, b] = linksFxPalette(theme).spark;
		assert.ok(b > r && b > g * 0.9, `${theme} stays blue-cyan`);
	}
});

test('blaze and flame reject the default orange palette and stay quieter than the demos', () => {
	for (const theme of ['light', 'dark'] as const) {
		const palette = linksFxPalette(theme);
		const blaze = blazeOptions(palette);
		const flame = flameOptions(palette);
		assert.deepEqual(blaze.sparkColor, palette.spark);
		assert.deepEqual(blaze.smokeColor, palette.smoke);
		assert.deepEqual(flame.color, palette.flame);
		assert.notDeepEqual(blaze.sparkColor, ORANGE_SPARK);
		assert.notDeepEqual(blaze.smokeColor, ORANGE_SMOKE);
		assert.equal(blazeIsRestrained(blaze), true);
		assert.equal(flameIsRestrained(flame), true);
		assert.equal(blaze.capture, false);
		assert.equal(flame.capture, false);
		assert.equal(flame.scorch, 0);
	}
});

test('ripple is click-only and does not capture the document', () => {
	const ripple = rippleOptions();
	assert.equal(ripple.trigger, 'click');
	assert.equal(ripple.interval, 0);
	assert.equal(ripple.capture, false);
});

test('effects are disabled for reduced motion and for browsers without WebGL2', () => {
	assert.equal(linksCanvasEnabled(false, true), true);
	assert.equal(linksCanvasEnabled(true, true), false);
	assert.equal(linksCanvasEnabled(false, false), false);
	assert.equal(linksCanvasEnabled(true, false), false);
});

test('flame wrap mounts only for an open card that intersects the viewport', () => {
	assert.equal(flameCardShouldMount(true, true, true), true);
	assert.equal(flameCardShouldMount(false, true, true), false);
	assert.equal(flameCardShouldMount(true, false, true), false);
	assert.equal(flameCardShouldMount(true, true, false), false);
});

test('viewport intersection ignores empty boxes and honors the margin', () => {
	const viewport = { width: 800, height: 600 };
	assert.equal(elementIntersectsViewport({ top: 10, left: 10, bottom: 40, right: 40, width: 30, height: 30 }, viewport), true);
	assert.equal(elementIntersectsViewport({ top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 }, viewport), false);
	assert.equal(elementIntersectsViewport({ top: 700, left: 0, bottom: 740, right: 20, width: 20, height: 40 }, viewport), false);
	assert.equal(elementIntersectsViewport({ top: 640, left: 0, bottom: 680, right: 20, width: 20, height: 40 }, viewport), true);
});

test('theme follows data-theme, then the color scheme', () => {
	assert.equal(linksFxTheme('dark', false), 'dark');
	assert.equal(linksFxTheme('light', true), 'light');
	assert.equal(linksFxTheme(null, true), 'dark');
	assert.equal(linksFxTheme(undefined, false), 'light');
});

test('flame canvas outset matches the wrapper reach so the licks are not clipped', () => {
	assert.deepEqual(flameWrapCanvasOutset(36, 8), { reach: Math.round(36 * 1.5) + 40, glow: Math.round(8 * 3) + 16 });
});

test('flame tint is stable per friend-link key and varies across keys', () => {
	const a = flameColorForKey('https://alice.example/', 'light');
	const aAgain = flameColorForKey('https://alice.example/', 'light');
	const b = flameColorForKey('https://bob.example/', 'light');
	assert.deepEqual(a, aAgain);
	assert.notDeepEqual(a, b);
	for (const channel of a) assert.ok(channel >= 0 && channel <= 1);
	const dark = flameColorForKey('https://alice.example/', 'dark');
	assert.notDeepEqual(a, dark);
	assert.equal(hashString('https://alice.example/'), hashString('https://alice.example/'));
});

function cardWithUrl(url: string | null, href?: string): HTMLElement {
	const signal = url === null
		? null
		: {
			getAttribute(name: string) {
				return name === 'data-url' ? url : null;
			},
		};
	return {
		closest() {
			return signal;
		},
		querySelector() {
			if (!href) return null;
			return {
				getAttribute(name: string) {
					return name === 'href' ? href : null;
				},
				href,
			};
		},
		getAttribute() {
			return 'Friend';
		},
	} as unknown as HTMLElement;
}

test('flame key prefers data-url on the signal wrapper', () => {
	assert.equal(flameKeyFromCard(cardWithUrl('https://friend.example/')), 'https://friend.example/');
});

test('zh and en path variants share one flame key and tint', () => {
	assert.deepEqual([...FLAME_LOCALE_PREFIXES], [...PREFIXED_LOCALES]);
	const zh = flameKeyFromCard(cardWithUrl('/about/'));
	const en = flameKeyFromCard(cardWithUrl('/en/about/'));
	assert.equal(zh, '/about/');
	assert.equal(en, zh);
	assert.deepEqual(flameColorForKey(zh, 'light'), flameColorForKey(en, 'light'));
	assert.deepEqual(flameColorForKey('/about/', 'light'), flameColorForKey('/en/about/', 'light'));
	assert.deepEqual(flameColorForKey('/about/', 'dark'), flameColorForKey('/en/about/', 'dark'));
	assert.equal(flameIdentityKey('/en/about'), '/about/');
	assert.equal(flameKeyFromCard(cardWithUrl(null, '/en/about/')), '/about/');
	assert.equal(flameIdentityKey('/blog/en/about/', '/blog/'), flameIdentityKey('/blog/about/', '/blog/'));
	assert.equal(flameIdentityKey('/english/about/'), '/english/about/');
	const friendLocalized = 'https://friend.example/en/about/';
	const friendCanonical = 'https://friend.example/about/';
	assert.equal(flameKeyFromCard(cardWithUrl(friendLocalized)), friendLocalized);
	assert.equal(flameKeyFromCard(cardWithUrl(friendCanonical)), friendCanonical);
	assert.notDeepEqual(flameColorForKey(friendLocalized, 'light'), flameColorForKey(friendCanonical, 'light'));
});

