import assert from 'node:assert/strict';
import test from 'node:test';
import {
	DOT_SCALE_MAX,
	DOT_SCALE_MIN,
	SIGNAL_MIN_SEPARATION,
	SIGNAL_RADIUS_CEILING,
	SIGNAL_RADIUS_FLOOR,
	SONAR_RADIUS_STAGE,
	layoutSignals,
	placePendingSignal,
	readLinkEntries,
	signalPlacement,
	summarizeSignals,
} from './links.ts';
import { formatDepth, signalDepth, type LinkEntry } from '../../shared/link-metadata.ts';

const SAMPLE: LinkEntry[] = [
	{ url: 'https://astro.build/' },
	{ url: 'https://vite.dev/' },
	{ url: 'https://developers.cloudflare.com/' },
	{ url: 'https://developer.mozilla.org/' },
	{ url: 'https://github.com/withastro' },
	{ url: 'https://starlight.astro.build/' },
];

function generated(count: number): LinkEntry[] {
	return Array.from({ length: count }, (_, index) => ({ url: `https://signal-${index}.example.com/` }));
}

function pairwiseMinimum(points: { x: number; y: number }[]): number {
	let minimum = Number.POSITIVE_INFINITY;
	for (let i = 0; i < points.length; i += 1) {
		for (let j = i + 1; j < points.length; j += 1) {
			minimum = Math.min(minimum, Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y));
		}
	}
	return minimum;
}

/** The relaxation runs in stage units; one sonar radius is half the stage. */
const MIN_SEPARATION_STAGE = SIGNAL_MIN_SEPARATION * SONAR_RADIUS_STAGE;

test('a url keeps the same placement every time it is laid out', () => {
	const first = layoutSignals(SAMPLE);
	const second = layoutSignals(SAMPLE.map((entry) => ({ ...entry })));
	assert.deepEqual(second, first);
	assert.deepEqual(layoutSignals(SAMPLE), first);

	const placement = signalPlacement('https://astro.build/');
	assert.deepEqual(signalPlacement('https://astro.build/'), placement);
	assert.equal(placement.depth, signalDepth('https://astro.build/'));
});

test('signals stay inside the radius band and away from each other', () => {
	for (const entries of [SAMPLE, generated(12), generated(40)]) {
		const placed = layoutSignals(entries);
		assert.equal(placed.length, entries.length);
		for (const signal of placed) {
			assert.ok(signal.radius >= SIGNAL_RADIUS_FLOOR - 1e-9, `${signal.url} radius ${signal.radius}`);
			assert.ok(signal.radius <= SIGNAL_RADIUS_CEILING + 1e-9, `${signal.url} radius ${signal.radius}`);
			assert.ok(signal.x > 0 && signal.x < 1 && signal.y > 0 && signal.y < 1);
			assert.ok(signal.turn >= 0 && signal.turn < 1.000001);
		}
		const minimum = pairwiseMinimum(placed);
		assert.ok(
			minimum >= MIN_SEPARATION_STAGE * 0.9,
			`closest pair ${minimum.toFixed(4)} under ${MIN_SEPARATION_STAGE}`,
		);
	}
});

test('signal numbers follow depth and the layout is not a grid', () => {
	const placed = layoutSignals(SAMPLE);
	assert.deepEqual(
		placed.map((signal) => signal.depth),
		[...placed.map((signal) => signal.depth)].sort((a, b) => a - b),
	);
	assert.equal(placed[0].signalLabel, '#001');
	assert.equal(placed.at(-1)?.signalLabel, `#${String(placed.length).padStart(3, '0')}`);

	// No two signals share a radius, so the field can never read as concentric rings.
	const radii = new Set(placed.map((signal) => signal.radius.toFixed(6)));
	assert.equal(radii.size, placed.length);
	const summary = summarizeSignals(placed);
	assert.equal(summary.count, placed.length);
	assert.equal(summary.minDepth, placed[0].depth);
	assert.equal(summary.maxDepth, placed.at(-1)?.depth);
	assert.deepEqual(summarizeSignals([]), { count: 0, minDepth: 0, maxDepth: 0 });
});

test('a pending signal lands inside the field without moving the rendered dots', () => {
	const placed = layoutSignals(SAMPLE);
	const pending = placePendingSignal(placed, 'https://pending.example.com/');
	assert.deepEqual(placePendingSignal(placed, 'https://pending.example.com/'), pending);
	assert.equal(pending.depth, signalDepth('https://pending.example.com/'));
	assert.equal(pending.depthLabel, formatDepth(pending.depth));

	const minimum = pairwiseMinimum([...placed, pending]);
	assert.ok(minimum >= MIN_SEPARATION_STAGE * 0.9, `pending dot is too close: ${minimum.toFixed(4)}`);
});

test('authored rows are validated, normalized, and de-duplicated', () => {
	const entries = readLinkEntries([
		{ url: 'example.com', name: 'Example' },
		{ url: 'https://example.com/', name: 'duplicate' },
		{ url: 'http://localhost:8787/' },
		{ url: 'not a url' },
		{ url: 'https://vite.dev/#hash', description: 'Next Generation Frontend Tooling' },
		'https://astro.build/',
		null,
		{ name: 'no url' },
	]);
	assert.deepEqual(entries, [
		{ url: 'https://example.com/', name: 'Example' },
		{ url: 'https://vite.dev/', description: 'Next Generation Frontend Tooling' },
	]);
	assert.deepEqual(readLinkEntries('nope'), []);
	assert.deepEqual(readLinkEntries(undefined), []);
});

test('a signal without a name falls back to its domain', () => {
	const placed = layoutSignals([{ url: 'https://www.example.com/blog' }]);
	assert.equal(placed[0].name, 'example.com');
	assert.equal(placed[0].domain, 'example.com');
	assert.equal(placed[0].depthLabel, formatDepth(signalDepth('https://www.example.com/blog')));
});

test('dots vary by a few percent and some are drawn hollow', () => {
	const placed = layoutSignals(generated(48));
	for (const signal of placed) {
		assert.ok(signal.scale >= DOT_SCALE_MIN && signal.scale <= DOT_SCALE_MAX, `${signal.url} scale ${signal.scale}`);
		assert.ok(signal.variant === 'solid' || signal.variant === 'ring');
		assert.equal(signal.scale, signalPlacement(signal.url).scale);
		assert.equal(signal.variant, signalPlacement(signal.url).variant);
	}
	const variants = new Set(placed.map((signal) => signal.variant));
	assert.deepEqual([...variants].sort(), ['ring', 'solid']);
	assert.ok(placed.filter((signal) => signal.variant === 'ring').length < placed.length / 3);

	const pending = placePendingSignal(placed, 'https://pending.example.com/');
	assert.equal(pending.scale, signalPlacement('https://pending.example.com/').scale);
	assert.equal(pending.variant, signalPlacement('https://pending.example.com/').variant);
});
