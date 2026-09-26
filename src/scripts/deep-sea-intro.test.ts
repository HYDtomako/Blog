import assert from 'node:assert/strict';
import test from 'node:test';
import {
	DEEP_WATER_DEPTH,
	DEPTH_CHECKPOINTS,
	DESCENT_MARKS,
	DESCENT_MS,
	INTRO_ARRIVED_MS,
	INTRO_ATTRIBUTE,
	INTRO_BOOT_MS,
	INTRO_FAILSAFE_MS,
	INTRO_HOLD_MS,
	INTRO_HYD_START_MS,
	INTRO_MAX_DEPTH,
	INTRO_SKIP_REVEAL_MS,
	INTRO_STORAGE_KEY,
	INTRO_TEMP_DEEP,
	INTRO_TOTAL_MS,
	PRESSURE_LABEL_DEPTH,
	depthAt,
	formatDepth,
	formatPressure,
	formatTemperature,
	hasSeenIntro,
	initDeepSeaIntro,
	introBootScript,
	introForcedByUrl,
	introFrameAt,
	needleAngleAt,
	needleTestAt,
	phaseAt,
	pressureFor,
	shouldPlayIntro,
	temperatureFor,
} from './deep-sea-intro.ts';

type Listener = (event: unknown) => void;

/** `1 + depth / 10`, the brief's pressure column, spelled out checkpoint by checkpoint. */
const PRESSURE_CHECKPOINTS = [
	1, 9, 17, 29, 43, 66, 91, 121, 151, 176, 191, 195, 198, 199.5, 200.5, 201,
];

/** When a checkpoint is reached, in timeline milliseconds. */
const checkpointAt = (index: number) => INTRO_BOOT_MS + DESCENT_MARKS[index] * DESCENT_MS;

function createIntro(options: { reducedMotion?: boolean; search?: string; seen?: boolean } = {}) {
	const styles = new Map<string, string>();
	const attributes = new Map<string, string>();
	const windowListeners = new Map<string, Listener>();
	const documentListeners = new Map<string, Listener>();
	const skipListeners = new Map<string, Listener>();
	const stored = new Map<string, string>();
	const timers: Array<{ run: () => void; ms: number }> = [];
	let pendingFrame: ((time: number) => void) | null = null;
	let clock = 0;
	let removed = false;
	let frameIds = 0;

	if (options.seen) stored.set(INTRO_STORAGE_KEY, '1');

	const depth = { textContent: '' };
	const pressure = { textContent: '' };
	const temperature = { textContent: '' };
	const skip = {
		addEventListener: (type: string, handler: Listener) => skipListeners.set(type, handler),
		removeEventListener: (type: string) => skipListeners.delete(type),
	};
	const root = {
		dataset: {} as Record<string, string>,
		style: {
			setProperty: (name: string, value: string) => {
				styles.set(name, value);
			},
		},
		contains: (node: unknown) => node === skip,
		remove: () => {
			removed = true;
		},
		querySelector: (selector: string) =>
			selector === '[data-ds-depth]'
				? depth
				: selector === '[data-ds-pressure]'
					? pressure
					: selector === '[data-ds-temp]'
						? temperature
						: selector === '[data-ds-skip]'
							? skip
							: null,
		addEventListener: (type: string, handler: Listener) =>
			windowListeners.set(`root:${type}`, handler),
	};
	const documentElement = {
		setAttribute: (name: string, value: string) => attributes.set(name, value),
		removeAttribute: (name: string) => attributes.delete(name),
	};
	const doc = {
		documentElement,
		activeElement: null,
		querySelector: (selector: string) => (selector === '[data-deep-intro]' ? root : null),
		addEventListener: (type: string, handler: Listener) => documentListeners.set(type, handler),
		removeEventListener: (type: string) => documentListeners.delete(type),
	} as unknown as Document;
	const win = {
		location: { search: options.search ?? '' },
		localStorage: {
			getItem: (key: string) => stored.get(key) ?? null,
			setItem: (key: string, value: string) => stored.set(key, value),
		},
		matchMedia: () => ({ matches: options.reducedMotion === true }),
		requestAnimationFrame: (callback: (time: number) => void) => {
			pendingFrame = callback;
			frameIds += 1;
			return frameIds;
		},
		cancelAnimationFrame: () => {
			pendingFrame = null;
		},
		setTimeout: (handler: () => void, ms: number) => {
			timers.push({ run: handler, ms });
			return timers.length;
		},
	} as unknown as Window;

	return {
		styles,
		attributes,
		timers,
		stored,
		root,
		depth,
		pressure,
		temperature,
		doc,
		win,
		removed: () => removed,
		frameScheduled: () => pendingFrame !== null,
		/** Advances the clock and runs the queued frame, mirroring rAF timestamps. */
		advance: (ms: number) => {
			clock += ms;
			const frame = pendingFrame;
			pendingFrame = null;
			frame?.(clock);
		},
		skip: () => skipListeners.get('click')?.(undefined),
		escape: () => documentListeners.get('keydown')?.({ key: 'Escape' }),
		depthText: () => depth.textContent,
		pressureText: () => pressure.textContent,
		temperatureText: () => temperature.textContent,
		phase: () => root.dataset.dsPhase,
		label: () => root.dataset.dsLabel,
	};
}

test('INTRO_TOTAL_MS stays inside the brief’s 6–8 s budget', () => {
	assert.ok(INTRO_TOTAL_MS >= 6000, `expected >= 6000, received ${INTRO_TOTAL_MS}`);
	assert.ok(INTRO_TOTAL_MS <= 8000, `expected <= 8000, received ${INTRO_TOTAL_MS}`);
	assert.equal(INTRO_TOTAL_MS, INTRO_HYD_START_MS + 800 + 1500);
});

test('the brief’s stage lengths: 1.2 s start-up, a 3.5 s descent and a 0.5 s breath', () => {
	assert.equal(INTRO_BOOT_MS, 1200);
	assert.equal(DESCENT_MS, 3500);
	assert.equal(INTRO_HOLD_MS, 500);
	assert.equal(INTRO_ARRIVED_MS, 4700);
	assert.equal(INTRO_HYD_START_MS, 5200);
});

test('depthAt lands on every checkpoint and never runs backwards', () => {
	DESCENT_MARKS.forEach((mark, index) => {
		assert.equal(depthAt(mark), DEPTH_CHECKPOINTS[index]);
	});
	let previous = -1;
	for (let step = 0; step <= 400; step += 1) {
		const depth = depthAt(step / 400);
		assert.ok(depth >= previous, `depth dropped at ${step / 400}`);
		previous = depth;
	}
	assert.equal(depthAt(0), 0);
	assert.equal(depthAt(1), INTRO_MAX_DEPTH);
	assert.equal(depthAt(-0.4), 0);
	assert.equal(depthAt(3), INTRO_MAX_DEPTH);
	assert.equal(depthAt(Number.NaN), 0);
});

test('the descent speeds up through the middle stages and crawls into the mark', () => {
	/** Metres per millisecond over one step of the piecewise curve. */
	const speed = (index: number) =>
		(DEPTH_CHECKPOINTS[index + 1] - DEPTH_CHECKPOINTS[index]) /
		(DESCENT_MARKS[index + 1] - DESCENT_MARKS[index]) /
		DESCENT_MS;
	const speeds = DEPTH_CHECKPOINTS.slice(0, -1).map((_, index) => speed(index));
	const early = speeds.slice(0, 5);
	const late = speeds.slice(10);
	const fastest = Math.max(...speeds);
	const slowestStep = speeds[speeds.length - 1];

	assert.ok(early.every((value, index) => index === 0 || value >= early[index - 1]));
	assert.ok(late.every((value, index) => index === 0 || value <= late[index - 1]));
	assert.ok(speeds[0] < fastest / 2, 'the first metres have to be slow');
	assert.ok(
		speeds.indexOf(fastest) > 0 && speeds.indexOf(fastest) < speeds.length - 1,
		'the fastest stretch belongs in the middle of the descent',
	);
	assert.ok(slowestStep < fastest / 10, 'the last metres have to crawl');
});

test('pressureFor matches the brief’s pressure column at every checkpoint', () => {
	DEPTH_CHECKPOINTS.forEach((depth, index) => {
		assert.equal(pressureFor(depth), PRESSURE_CHECKPOINTS[index]);
	});
	assert.equal(pressureFor(0), 1);
	assert.equal(pressureFor(INTRO_MAX_DEPTH), 201);
});

test('temperatureFor falls from 18.0 °C to 4.2 °C through the thermocline', () => {
	assert.equal(formatTemperature(temperatureFor(0)), '18.0 °C');
	assert.equal(formatTemperature(temperatureFor(INTRO_MAX_DEPTH)), '4.2 °C');
	let previous = Number.POSITIVE_INFINITY;
	for (let depth = 0; depth <= INTRO_MAX_DEPTH; depth += 20) {
		const value = temperatureFor(depth);
		assert.ok(value <= previous, `temperature rose at ${depth} m`);
		previous = value;
	}
	// The drop belongs to the first few hundred metres, not the whole water column.
	const surface = temperatureFor(0);
	const totalDrop = surface - INTRO_TEMP_DEEP;
	assert.ok(
		surface - temperatureFor(400) > totalDrop / 2,
		'the thermocline should do most of the work in the top 400 m',
	);
	assert.ok(temperatureFor(2000) > INTRO_TEMP_DEEP, 'deep water stays just above the reading');
});

test('needleAngleAt sweeps the dial from -150 to +150 degrees', () => {
	assert.equal(needleAngleAt(0), -150);
	assert.equal(needleAngleAt(0.5), 0);
	assert.equal(needleAngleAt(1), 150);
	assert.equal(needleAngleAt(-2), -150);
	assert.equal(needleAngleAt(4), 150);
});

test('needleTestAt lifts the pointer and settles it back on the rest pin', () => {
	assert.equal(needleTestAt(0), 0);
	assert.equal(needleTestAt(0.5), 0);
	assert.equal(needleTestAt(0.8), needleTestAt(0.8));
	assert.ok(needleTestAt(0.8) > 0, 'the pointer has to move off the pin');
	assert.equal(needleTestAt(1), 0);
	assert.equal(needleTestAt(2), 0);
	assert.equal(needleTestAt(Number.NaN), 0);
});

test('formatDepth pads to three digits and the other readouts keep one decimal', () => {
	assert.equal(formatDepth(0), '000 m');
	assert.equal(formatDepth(120), '120 m');
	assert.equal(formatDepth(1999.6), '2000 m');
	assert.equal(formatPressure(1), '1.0 BAR');
	assert.equal(formatPressure(17), '17.0 BAR');
	assert.equal(formatPressure(201), '201.0 BAR');
	assert.equal(formatTemperature(18), '18.0 °C');
	assert.equal(formatTemperature(4.216), '4.2 °C');
});

test('labelFor walks the brief’s four status words as the depth grows', () => {
	assert.equal(introFrameAt(0).label, 'initialized');
	assert.equal(introFrameAt(INTRO_BOOT_MS - 1).label, 'initialized');
	assert.equal(introFrameAt(INTRO_BOOT_MS).label, 'descending');
	assert.equal(introFrameAt(checkpointAt(4)).label, 'descending');
	assert.equal(introFrameAt(checkpointAt(5)).label, 'pressure');
	assert.equal(introFrameAt(checkpointAt(7)).label, 'pressure');
	assert.equal(introFrameAt(checkpointAt(8)).label, 'deep-sea');
	assert.equal(introFrameAt(checkpointAt(14)).label, 'deep-sea');
	assert.equal(introFrameAt(checkpointAt(15)).label, 'reached');
	assert.equal(introFrameAt(INTRO_TOTAL_MS).label, 'reached');
	assert.equal(PRESSURE_LABEL_DEPTH, DEPTH_CHECKPOINTS[5]);
	assert.equal(DEEP_WATER_DEPTH, DEPTH_CHECKPOINTS[8]);
});

test('phaseAt walks boot, descent, reached, hyd and reveal', () => {
	assert.equal(phaseAt(0), 'boot');
	assert.equal(phaseAt(INTRO_BOOT_MS - 1), 'boot');
	assert.equal(phaseAt(INTRO_BOOT_MS), 'descent');
	assert.equal(phaseAt(INTRO_ARRIVED_MS - 1), 'descent');
	assert.equal(phaseAt(INTRO_ARRIVED_MS), 'reached');
	assert.equal(phaseAt(INTRO_HYD_START_MS - 1), 'reached');
	assert.equal(phaseAt(INTRO_HYD_START_MS), 'hyd');
	assert.equal(phaseAt(INTRO_HYD_START_MS + 799), 'hyd');
	assert.equal(phaseAt(INTRO_HYD_START_MS + 800), 'reveal');
	assert.equal(phaseAt(INTRO_TOTAL_MS), 'reveal');
});

test('introFrameAt holds the surface during start-up and the ceiling afterwards', () => {
	const boot = introFrameAt(0);
	assert.equal(boot.phase, 'boot');
	assert.equal(boot.label, 'initialized');
	assert.equal(boot.depth, 0);
	assert.equal(boot.bootRatio, 0);
	assert.equal(formatDepth(boot.depth), '000 m');
	assert.equal(formatPressure(boot.pressure), '1.0 BAR');
	assert.equal(formatTemperature(boot.temperature), '18.0 °C');

	const half = introFrameAt(INTRO_BOOT_MS / 2);
	assert.equal(half.bootRatio, 0.5);

	const late = introFrameAt(INTRO_TOTAL_MS - 1);
	assert.equal(late.phase, 'reveal');
	assert.equal(late.bootRatio, 1);
	assert.equal(late.depth, INTRO_MAX_DEPTH);
	assert.equal(formatDepth(late.depth), '2000 m');
	assert.equal(formatPressure(late.pressure), '201.0 BAR');
	assert.equal(formatTemperature(late.temperature), '4.2 °C');
	assert.equal(late.needleAngle, 150);
});

test('the arrival holds every reading still for the brief’s 0.5 s breath', () => {
	const frames = [INTRO_ARRIVED_MS, INTRO_ARRIVED_MS + 250, INTRO_HYD_START_MS - 1].map((ms) =>
		introFrameAt(ms),
	);
	for (const frame of frames) {
		assert.equal(frame.phase, 'reached');
		assert.equal(frame.depth, INTRO_MAX_DEPTH);
		assert.equal(frame.needleAngle, 150);
		assert.equal(formatPressure(frame.pressure), '201.0 BAR');
	}
});

test('the descent crosses every checkpoint in order as the timeline runs', () => {
	const seen: number[] = [];
	const checkpoints = DEPTH_CHECKPOINTS.slice(1);
	for (let elapsed = 0; elapsed <= INTRO_TOTAL_MS; elapsed += 5) {
		const { depth } = introFrameAt(elapsed);
		while (checkpoints.length > 0 && depth >= checkpoints[0] - 0.001) {
			seen.push(checkpoints.shift() as number);
		}
	}
	assert.deepEqual(seen, [...DEPTH_CHECKPOINTS].slice(1));
});

test('shouldPlayIntro plays once and honours motion, force and the config gate', () => {
	const base = { enabled: true, seen: false, reducedMotion: false, forced: false };
	assert.equal(shouldPlayIntro(base), true);
	assert.equal(shouldPlayIntro({ ...base, seen: true }), false);
	assert.equal(shouldPlayIntro({ ...base, seen: true, forced: true }), true);
	assert.equal(shouldPlayIntro({ ...base, reducedMotion: true }), false);
	assert.equal(shouldPlayIntro({ ...base, reducedMotion: true, forced: true }), false);
	assert.equal(shouldPlayIntro({ ...base, enabled: false }), false);
});

test('introForcedByUrl reads ?intro=1 and ignores ?intro=0', () => {
	assert.equal(introForcedByUrl('?intro=1'), true);
	assert.equal(introForcedByUrl('?intro'), true);
	assert.equal(introForcedByUrl('?intro=true'), true);
	assert.equal(introForcedByUrl('?intro=0'), false);
	assert.equal(introForcedByUrl('?q=hello'), false);
	assert.equal(introForcedByUrl(''), false);
});

test('hasSeenIntro survives storage that throws', () => {
	assert.equal(hasSeenIntro(undefined), false);
	assert.equal(hasSeenIntro({ localStorage: { getItem: () => '1' } } as unknown as Window), true);
	assert.equal(hasSeenIntro({ localStorage: { getItem: () => null } } as unknown as Window), false);
	const blocked = {
		get localStorage() {
			throw new Error('blocked');
		},
	} as unknown as Window;
	assert.equal(hasSeenIntro(blocked), false);
});

test('initDeepSeaIntro drives the readouts and removes the overlay at the end', () => {
	const board = createIntro();
	initDeepSeaIntro(board.doc, board.win);

	board.advance(0);
	assert.equal(board.phase(), 'boot');
	assert.equal(board.label(), 'initialized');
	assert.equal(board.depthText(), '000 m');
	assert.equal(board.pressureText(), '1.0 BAR');
	assert.equal(board.temperatureText(), '18.0 °C');
	assert.equal(board.styles.get('--ds-boot'), '0.0000');
	assert.equal(board.styles.get('--ds-depth'), '0.0000');
	assert.equal(board.styles.get('--ds-needle'), '-150.00');

	board.advance(600);
	assert.equal(board.phase(), 'boot');
	assert.equal(board.styles.get('--ds-boot'), (600 / INTRO_BOOT_MS).toFixed(4));

	board.advance(400);
	assert.equal(board.styles.get('--ds-boot'), '0.8333');

	board.advance(1500);
	assert.equal(board.phase(), 'descent');
	assert.equal(board.styles.get('--ds-boot'), '1.0000');
	assert.equal(
		board.styles.get('--ds-depth'),
		(depthAt((2500 - INTRO_BOOT_MS) / DESCENT_MS) / INTRO_MAX_DEPTH).toFixed(4),
	);

	board.advance(INTRO_ARRIVED_MS - 2500);
	assert.equal(board.phase(), 'reached');
	assert.equal(board.label(), 'reached');
	assert.equal(board.depthText(), '2000 m');
	assert.equal(board.pressureText(), '201.0 BAR');
	assert.equal(board.temperatureText(), '4.2 °C');
	assert.equal(board.styles.get('--ds-needle'), '150.00');

	board.advance(INTRO_TOTAL_MS);
	assert.equal(board.removed(), true);
	assert.equal(board.attributes.has(INTRO_ATTRIBUTE), false);
	assert.equal(board.stored.get(INTRO_STORAGE_KEY), '1');
	assert.equal(board.frameScheduled(), false);
});

test('a visitor who has seen the intro gets no overlay and no new marker', () => {
	const board = createIntro({ seen: true });
	initDeepSeaIntro(board.doc, board.win);

	assert.equal(board.removed(), true);
	assert.equal(board.attributes.has(INTRO_ATTRIBUTE), false);
	assert.equal(board.frameScheduled(), false);
	assert.equal(board.depthText(), '');
});

test('reduced motion skips the intro without marking it seen', () => {
	const board = createIntro({ reducedMotion: true });
	initDeepSeaIntro(board.doc, board.win);

	assert.equal(board.removed(), true);
	assert.equal(board.stored.has(INTRO_STORAGE_KEY), false);
	assert.equal(board.frameScheduled(), false);
});

test('reduced motion wins over ?intro=1, and the config gate wins over everything', () => {
	const forced = createIntro({ search: '?intro=1' });
	initDeepSeaIntro(forced.doc, forced.win, { reducedMotion: true });
	assert.equal(forced.removed(), true);

	const disabled = createIntro({ search: '?intro=1' });
	initDeepSeaIntro(disabled.doc, disabled.win, { enabled: false });
	assert.equal(disabled.removed(), true);
	assert.equal(disabled.stored.has(INTRO_STORAGE_KEY), false);
});

test('?intro=1 replays for a visitor who has already seen the intro', () => {
	const board = createIntro({ seen: true, search: '?intro=1' });
	initDeepSeaIntro(board.doc, board.win);

	assert.equal(board.removed(), false);
	assert.equal(board.frameScheduled(), true);

	board.advance(0);
	board.advance(INTRO_TOTAL_MS + 40);
	assert.equal(board.removed(), true);
});

test('clicking skip reveals immediately, keeps the current reading and marks it seen', () => {
	const board = createIntro();
	initDeepSeaIntro(board.doc, board.win);
	board.advance(0);
	board.advance(3000);
	const depthBeforeSkip = board.depthText();
	const pressureBeforeSkip = board.pressureText();
	assert.equal(board.phase(), 'descent');
	assert.notEqual(depthBeforeSkip, '000 m');

	board.skip();
	assert.equal(board.root.dataset.dsFast, 'true');
	assert.equal(board.phase(), 'reveal');
	assert.equal(board.depthText(), depthBeforeSkip);
	assert.equal(board.pressureText(), pressureBeforeSkip);
	assert.equal(board.frameScheduled(), false);
	assert.equal(board.removed(), false);

	assert.equal(board.timers.at(-1)?.ms, INTRO_SKIP_REVEAL_MS);
	board.timers.at(-1)?.run();
	assert.equal(board.removed(), true);
	assert.equal(board.attributes.has(INTRO_ATTRIBUTE), false);
	assert.equal(board.stored.get(INTRO_STORAGE_KEY), '1');
});

test('Escape skips the intro too, and a second skip does not reschedule', () => {
	const board = createIntro();
	initDeepSeaIntro(board.doc, board.win);
	board.advance(0);
	board.advance(400);

	board.escape();
	assert.equal(board.phase(), 'reveal');
	const scheduled = board.timers.length;
	board.escape();
	assert.equal(board.timers.length, scheduled);

	board.timers.at(-1)?.run();
	assert.equal(board.removed(), true);
	board.escape();
	assert.equal(board.timers.length, scheduled);
});

test('skipping during the start-up still leaves a coherent empty dial', () => {
	const board = createIntro();
	initDeepSeaIntro(board.doc, board.win);
	board.advance(0);
	board.advance(200);

	board.skip();
	assert.equal(board.depthText(), '000 m');
	assert.equal(board.temperatureText(), '18.0 °C');
	board.timers.at(-1)?.run();
	assert.equal(board.removed(), true);
});

test('initDeepSeaIntro is a no-op without the overlay markup', () => {
	const board = createIntro();
	const doc = { querySelector: () => null } as unknown as Document;
	initDeepSeaIntro(doc, board.win);
	assert.equal(board.frameScheduled(), false);
});

test('a browser without requestAnimationFrame drops the overlay instead of trapping the page', () => {
	const board = createIntro();
	const win = { ...(board.win as unknown as Record<string, unknown>) } as unknown as Window;
	delete (win as unknown as Record<string, unknown>).requestAnimationFrame;
	initDeepSeaIntro(board.doc, win);
	assert.equal(board.removed(), true);
	assert.equal(board.attributes.has(INTRO_ATTRIBUTE), false);
});

function runBootScript(
	env: { seen?: boolean; search?: string; reduced?: boolean; storageThrows?: boolean } = {},
) {
	const attributes = new Map<string, string>();
	const timers: Array<{ run: () => void; ms: number }> = [];
	const overlay = {
		removed: false,
		remove() {
			this.removed = true;
		},
	};
	const root = {
		setAttribute: (name: string, value: string) => attributes.set(name, value),
		removeAttribute: (name: string) => attributes.delete(name),
	};
	const documentLike = { documentElement: root, querySelector: () => overlay };
	const storage = {
		getItem: (_key: string) => {
			if (env.storageThrows) throw new Error('blocked');
			return env.seen ? '1' : null;
		},
	};
	const run = new Function(
		'document',
		'location',
		'localStorage',
		'matchMedia',
		'setTimeout',
		introBootScript(),
	);
	run(
		documentLike,
		{ search: env.search ?? '' },
		storage,
		() => ({ matches: env.reduced === true }),
		(handler: () => void, ms: number) => {
			timers.push({ run: handler, ms });
			return timers.length;
		},
	);
	return {
		attributes,
		timers,
		overlay,
		playing: () => attributes.get(INTRO_ATTRIBUTE) === 'play',
	};
}

test('the boot script arms the overlay before first paint and schedules a failsafe', () => {
	const boot = runBootScript();
	assert.equal(boot.playing(), true);
	assert.equal(boot.timers.length, 1);
	assert.equal(boot.timers[0].ms, INTRO_FAILSAFE_MS);
	assert.ok(INTRO_FAILSAFE_MS > INTRO_TOTAL_MS, 'the failsafe must outlast the intro');
	assert.ok(introBootScript().includes(INTRO_STORAGE_KEY));
	assert.ok(introBootScript().includes(INTRO_ATTRIBUTE));
});

test('the boot script stays out of the way for a returning or motion-sensitive visitor', () => {
	assert.equal(runBootScript({ seen: true }).playing(), false);
	assert.equal(runBootScript({ seen: true }).timers.length, 0);
	assert.equal(runBootScript({ reduced: true }).playing(), false);
	assert.equal(runBootScript({ reduced: true, search: '?intro=1' }).playing(), false);
});

test('the boot script replays on ?intro=1 and never throws on blocked storage', () => {
	const forced = runBootScript({ seen: true, search: '?intro=1' });
	assert.equal(forced.playing(), true);

	const blocked = runBootScript({ storageThrows: true });
	assert.equal(blocked.playing(), true);
});

test('the failsafe frees the page when the intro bundle never loads', () => {
	const boot = runBootScript();
	boot.timers[0].run();
	assert.equal(boot.attributes.has(INTRO_ATTRIBUTE), false);
	assert.equal(boot.overlay.removed, true);
});

test('the failsafe is idempotent when the intro already finished', () => {
	const boot = runBootScript();
	boot.timers[0].run();
	assert.doesNotThrow(() => boot.timers[0].run());
	assert.equal(boot.overlay.removed, true);
});
