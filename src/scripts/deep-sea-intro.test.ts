import assert from 'node:assert/strict';
import test from 'node:test';
import {
	DEEP_WATER_DEPTH,
	INTRO_ARRIVED_MS,
	INTRO_BOOT_MS,
	INTRO_CLIMAX_MS,
	INTRO_FAILSAFE_MS,
	INTRO_HOLD_MS,
	INTRO_MAX_DEPTH,
	INTRO_REVEAL_START_MS,
	INTRO_STORAGE_KEY,
	INTRO_TEMP_DEEP,
	INTRO_TEMP_SURFACE,
	INTRO_TOTAL_MS,
	PRESSURE_LABEL_DEPTH,
	depthAt,
	easeInOutCubic,
	bubbleCountFor,
	glowCountFor,
	glowBoostFor,
	formatDepth,
	formatPressure,
	formatRate,
	formatTemperature,
	hasSeenIntro,
	initDeepSeaIntro,
	systemWordFor,
	introBootScript,
	introForcedByUrl,
	introFrameAt,
	labelFor,
	phaseAt,
	pressureFor,
	shouldPlayIntro,
	snowBrightnessFor,
	snowDensityFor,
	snowFallSpeedFor,
	temperatureFor,
} from './deep-sea-intro.ts';

type Storage = { store: Map<string, string>; getItem(k: string): string | null; setItem(k: string, v: string): void };

function makeStorage(): Storage {
	const store = new Map<string, string>();
	return {
		store,
		getItem: (k) => (store.has(k) ? (store.get(k) as string) : null),
		setItem: (k, v) => void store.set(k, v),
	};
}

interface FakeIntro {
	root: { removed: boolean; dataset: Record<string, string>; style: Record<string, unknown> };
	doc: unknown;
	win: unknown;
	storage: Storage;
}

/** A fake overlay whose children all resolve to null, so the timeline stays headless. */
function makeFakeIntro(options: { search?: string } = {}): FakeIntro {
	const storage = makeStorage();
	const root = {
		removed: false,
		dataset: {} as Record<string, string>,
		style: {
			props: {} as Record<string, string>,
			clipPath: '',
			setProperty(this: { props: Record<string, string> }, key: string, value: string) {
				this.props[key] = value;
			},
		} as Record<string, unknown>,
		remove() {
			root.removed = true;
		},
		querySelector: () => null,
		querySelectorAll: () => [],
		addEventListener: () => {},
		removeEventListener: () => {},
		contains: () => false,
	};
	const html = {
		removeAttribute: () => {},
		setAttribute: () => {},
		style: { overflowY: '', setProperty: () => {} },
	};
	const doc = {
		documentElement: html,
		activeElement: null,
		querySelector: (selector: string) => (selector === '[data-deep-intro]' ? root : null),
		addEventListener: () => {},
		removeEventListener: () => {},
	};
	const win = {
		location: { search: options.search ?? '' },
		sessionStorage: storage,
		devicePixelRatio: 1,
		innerWidth: 1200,
		innerHeight: 900,
		requestAnimationFrame: () => 1,
		cancelAnimationFrame: () => {},
		setTimeout: (fn: () => void) => {
			fn();
			return 1;
		},
		addEventListener: () => {},
		removeEventListener: () => {},
		matchMedia: () => ({ matches: false }),
	};
	return { root, doc, win, storage };
}

test('bubbles thin out with depth and bioluminescence wakes in the deep', () => {
	assert.ok(bubbleCountFor(0) > bubbleCountFor(0.2), 'fewer bubbles as it gets deeper');
	assert.equal(bubbleCountFor(0.5), 0, 'no bubbles below the shallows');
	assert.equal(glowCountFor(0.3), 0, 'no glow until the deep water');
	assert.ok(glowCountFor(1) > glowCountFor(0.7), 'more glow the deeper it gets');
	assert.equal(glowBoostFor(0, 100), 1);
	assert.equal(glowBoostFor(200, 100), 0);
	assert.equal(glowBoostFor(50, 100), 0.5);
	assert.equal(glowBoostFor(10, 0), 0, 'a zero radius never boosts');
});

test('easeInOutCubic is monotonic and spans 0..1', () => {

	assert.equal(easeInOutCubic(0), 0);
	assert.equal(easeInOutCubic(1), 1);
	assert.equal(easeInOutCubic(0.5), 0.5);
	assert.ok(easeInOutCubic(0.25) < easeInOutCubic(0.5));
	assert.ok(easeInOutCubic(0.75) > easeInOutCubic(0.5));
	assert.equal(easeInOutCubic(-1), 0);
	assert.equal(easeInOutCubic(2), 1);
});

test('depthAt runs from the surface to 10900 m', () => {
	assert.equal(depthAt(0), 0);
	assert.equal(depthAt(1), INTRO_MAX_DEPTH);
	assert.equal(INTRO_MAX_DEPTH, 10900);
	assert.ok(Math.abs(depthAt(0.5) - INTRO_MAX_DEPTH / 2) < 1e-6);
	let previous = -1;
	for (let step = 0; step <= 20; step += 1) {
		const value = depthAt(step / 20);
		assert.ok(value >= previous, 'depth never goes backwards');
		previous = value;
	}
});

test('pressure is 1 + depth / 10 across the full descent', () => {
	assert.equal(pressureFor(0), 1);
	assert.equal(pressureFor(INTRO_MAX_DEPTH), 1091);
	assert.equal(pressureFor(500), 51);
	assert.equal(pressureFor(-100), 1, 'clamped below');
	assert.equal(pressureFor(999999), 1091, 'clamped above');
});

test('temperature falls through the thermocline and holds near the floor', () => {
	assert.equal(temperatureFor(0), INTRO_TEMP_SURFACE);
	assert.ok(Math.abs(temperatureFor(INTRO_MAX_DEPTH) - INTRO_TEMP_DEEP) < 0.05);
	assert.ok(temperatureFor(200) < INTRO_TEMP_SURFACE);
	assert.ok(temperatureFor(200) > temperatureFor(2000));
});

test('labelFor walks the brief five status words', () => {
	assert.equal(labelFor('boot', 0), 'initialized');
	assert.equal(labelFor('descent', 0), 'descending');
	assert.equal(labelFor('descent', PRESSURE_LABEL_DEPTH), 'pressure');
	assert.equal(labelFor('descent', DEEP_WATER_DEPTH), 'deep-sea');
	assert.equal(labelFor('reached', INTRO_MAX_DEPTH), 'reached');
	assert.equal(labelFor('reveal', INTRO_MAX_DEPTH), 'reached');
});

test('phaseAt maps the elapsed time onto the timeline', () => {
	assert.equal(phaseAt(0), 'boot');
	assert.equal(phaseAt(INTRO_BOOT_MS - 1), 'boot');
	assert.equal(phaseAt(INTRO_BOOT_MS), 'descent');
	assert.equal(phaseAt(INTRO_ARRIVED_MS), 'reached');
	assert.equal(phaseAt(INTRO_REVEAL_START_MS), 'reveal');
	assert.equal(phaseAt(INTRO_TOTAL_MS * 10), 'reveal');
});

test('the whole timeline stays inside a browsable budget', () => {
	assert.ok(INTRO_TOTAL_MS >= 3000 && INTRO_TOTAL_MS <= 8000, `${INTRO_TOTAL_MS} ms`);
	assert.ok(INTRO_FAILSAFE_MS > INTRO_TOTAL_MS);
});

test('the arrival is held before the clip-path reveal', () => {
	assert.ok(INTRO_HOLD_MS >= 500, 'the seabed moment is not wiped away instantly');
	assert.equal(INTRO_REVEAL_START_MS, INTRO_ARRIVED_MS + INTRO_CLIMAX_MS + INTRO_HOLD_MS);
	// Through the hold the climax has plateaued and the reveal has not begun.
	const held = introFrameAt(INTRO_ARRIVED_MS + INTRO_CLIMAX_MS + INTRO_HOLD_MS - 1);
	assert.equal(held.climaxRatio, 1);
	assert.equal(held.revealRatio, 0);
});

test('formatDepth pads to five digits and carries the unit', () => {
	assert.equal(formatDepth(0), '00000 m');
	assert.equal(formatDepth(10900), '10900 m');
	assert.equal(formatDepth(1234.6), '01235 m');
	assert.equal(formatDepth(20000), '10900 m', 'clamped at the floor');
});

test('pressure and temperature keep one decimal so the readout never reflows', () => {
	assert.equal(formatPressure(1), '1.0 BAR');
	assert.equal(formatPressure(1091), '1091.0 BAR');
	assert.equal(formatTemperature(18), '18.0 °C');
	assert.equal(formatTemperature(4.2), '4.2 °C');
});

test('formatRate keeps one decimal and never goes negative', () => {
	assert.equal(formatRate(0), '0.0 m/s');
	assert.equal(formatRate(12.34), '12.3 m/s');
	assert.equal(formatRate(-5), '0.0 m/s');
	assert.equal(formatRate(Number.NaN), '0.0 m/s');
});

test('systemWordFor names each phase of the dive', () => {
	assert.equal(systemWordFor('boot'), 'BOOT');
	assert.equal(systemWordFor('descent'), 'DESCENT');
	assert.equal(systemWordFor('reached'), 'HOLD');
	assert.equal(systemWordFor('reveal'), 'REVEAL');
});

test('introFrameAt describes the start of the boot', () => {
	const frame = introFrameAt(0);
	assert.equal(frame.phase, 'boot');
	assert.equal(frame.label, 'initialized');
	assert.equal(frame.depth, 0);
	assert.equal(frame.pressure, 1);
	assert.equal(frame.temperature, INTRO_TEMP_SURFACE);
	assert.equal(frame.progress, 0);
	assert.equal(frame.revealRatio, 0);
});

test('introFrameAt lands on the floor by the end', () => {
	const frame = introFrameAt(INTRO_TOTAL_MS);
	assert.equal(frame.phase, 'reveal');
	assert.equal(frame.label, 'reached');
	assert.equal(frame.depth, INTRO_MAX_DEPTH);
	assert.equal(frame.depthRatio, 1);
	assert.equal(frame.progress, 1);
	assert.equal(frame.revealRatio, 1);
});

test('introFrameAt clamps beyond the timeline instead of running away', () => {
	const frame = introFrameAt(INTRO_TOTAL_MS + 5000);
	assert.equal(frame.progress, 1);
	assert.equal(frame.depth, INTRO_MAX_DEPTH);
});

test('marine snow thickens, slows and dims with depth', () => {
	assert.ok(snowDensityFor(1) > snowDensityFor(0));
	assert.ok(snowFallSpeedFor(1) < snowFallSpeedFor(0));
	assert.ok(snowBrightnessFor(1) < snowBrightnessFor(0));
	assert.ok(snowDensityFor(0) > 0);
	assert.ok(snowFallSpeedFor(0) > 0);
	assert.ok(snowBrightnessFor(0) <= 1);
	assert.equal(snowDensityFor(-3), snowDensityFor(0), 'clamped below');
	assert.equal(snowDensityFor(9), snowDensityFor(1), 'clamped above');
});

test('hasSeenIntro reads the session marker without throwing', () => {
	const storage = makeStorage();
	assert.equal(hasSeenIntro({ sessionStorage: storage } as unknown as Window), false);
	storage.setItem(INTRO_STORAGE_KEY, '1');
	assert.equal(hasSeenIntro({ sessionStorage: storage } as unknown as Window), true);
	const broken = {
		get sessionStorage(): Storage {
			throw new Error('blocked');
		},
	} as unknown as Window;
	assert.equal(hasSeenIntro(broken), false);
});

test('introForcedByUrl only honours ?intro', () => {
	assert.equal(introForcedByUrl(''), false);
	assert.equal(introForcedByUrl('?intro=1'), true);
	assert.equal(introForcedByUrl('?intro'), true);
	assert.equal(introForcedByUrl('?intro=0'), false);
	assert.equal(introForcedByUrl('?foo=bar'), false);
});

test('shouldPlayIntro respects enablement, motion, replay and the session', () => {
	const base = { enabled: true, seen: false, reducedMotion: false, forced: false };
	assert.equal(shouldPlayIntro(base), true);
	assert.equal(shouldPlayIntro({ ...base, seen: true }), false);
	assert.equal(shouldPlayIntro({ ...base, seen: true, forced: true }), true);
	assert.equal(shouldPlayIntro({ ...base, reducedMotion: true }), false);
	assert.equal(shouldPlayIntro({ ...base, enabled: false }), false);
});

test('the boot script uses sessionStorage and owns the failsafe', () => {
	const script = introBootScript();
	assert.match(script, /sessionStorage/);
	assert.doesNotMatch(script, /localStorage/);
	assert.ok(script.includes(INTRO_STORAGE_KEY));
	assert.ok(script.includes(String(INTRO_FAILSAFE_MS)));
	assert.ok(script.includes(`data-intro`));
});

test('the driver publishes the arrival time for the CSS embellishments', () => {
	const { root, doc, win } = makeFakeIntro({ search: '?intro=1' });
	initDeepSeaIntro(doc as Document, win as unknown as Window);
	const props = (root.style as { props: Record<string, string> }).props;
	assert.equal(props['--ds-arrived'], `${INTRO_ARRIVED_MS}ms`);
});

test('a reduced-motion visitor gets no overlay and no session marker', () => {
	const { root, doc, win, storage } = makeFakeIntro();
	initDeepSeaIntro(doc as Document, win as unknown as Window, { reducedMotion: true });
	assert.equal(root.removed, true);
	assert.equal(storage.getItem(INTRO_STORAGE_KEY), null);
});

test('an already-seen session leaves nothing behind', () => {
	const { root, doc, win, storage } = makeFakeIntro();
	storage.setItem(INTRO_STORAGE_KEY, '1');
	initDeepSeaIntro(doc as Document, win as unknown as Window);
	assert.equal(root.removed, true);
	assert.equal(storage.getItem(INTRO_STORAGE_KEY), '1');
});

test('a disabled intro abandons without marking the session', () => {
	const { root, doc, win, storage } = makeFakeIntro();
	initDeepSeaIntro(doc as Document, win as unknown as Window, { enabled: false });
	assert.equal(root.removed, true);
	assert.equal(storage.getItem(INTRO_STORAGE_KEY), null);
});

test('initDeepSeaIntro is a no-op when the overlay is absent', () => {
	const doc = { querySelector: () => null } as unknown as Document;
	const win = {} as Window;
	assert.doesNotThrow(() => initDeepSeaIntro(doc, win));
});
