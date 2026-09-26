/** Marker written once the visitor has seen the intro through (or skipped it). */
export const INTRO_STORAGE_KEY = 'refined-x-intro-seen';
/** `?intro=1` replays the intro even for a visitor who has already seen it. */
export const INTRO_FORCE_PARAM = 'intro';

/**
 * The brief's six beats, in milliseconds: start-up, descent, the breath at the mark, HYD,
 * then the hand-off to the hero. 7.5 s in total, inside the brief's 6–8 s budget.
 */
export const INTRO_BOOT_MS = 1200;
/** The pause the brief insists on between DEPTH REACHED and HYD. */
export const INTRO_HOLD_MS = 500;
export const INTRO_HYD_MS = 800;
export const INTRO_REVEAL_MS = 1500;

/** Every depth the readout has to stop on, from the brief's three descent stages. */
export const DEPTH_CHECKPOINTS = [
	0, 80, 160, 280, 420, 650, 900, 1200, 1500, 1750, 1900, 1940, 1970, 1985, 1995, 2000,
] as const;

/** Time each checkpoint takes to reach, in order: two even stages, then the crawl to 2000 m. */
const CHECKPOINT_STEPS_MS = [
	260, 260, 260, 260, 260, 340, 340, 340, 340, 340, 100, 100, 100, 100, 100,
] as const;

/** 3.5 s from the surface to 2000 m: slow start, a long cruise, then the deceleration. */
export const DESCENT_MS = CHECKPOINT_STEPS_MS.reduce((total, step) => total + step, 0);

/** Where each checkpoint falls inside the descent window, as a 0–1 fraction. */
export const DESCENT_MARKS: readonly number[] = (() => {
	const marks = [0];
	for (const step of CHECKPOINT_STEPS_MS) {
		marks.push(marks[marks.length - 1] + step / DESCENT_MS);
	}
	return marks;
})();

export const INTRO_ARRIVED_MS = INTRO_BOOT_MS + DESCENT_MS;
export const INTRO_HYD_START_MS = INTRO_ARRIVED_MS + INTRO_HOLD_MS;
export const INTRO_TOTAL_MS = INTRO_HYD_START_MS + INTRO_HYD_MS + INTRO_REVEAL_MS;

/** Compressed reveal when the visitor skips. */
export const INTRO_SKIP_REVEAL_MS = 320;
/** Hard stop owned by the inline boot script, so a page without the intro bundle stays usable. */
export const INTRO_FAILSAFE_MS = INTRO_TOTAL_MS + 2500;

/** Attribute on the document root that arms the overlay; absent means "no intro". */
export const INTRO_ATTRIBUTE = 'data-intro';
export const INTRO_PLAYING = 'play';

export const INTRO_MAX_DEPTH = 2000;
export const INTRO_DIAL_DEGREES = 300;

/** The brief's two water temperatures: 18.0 °C at the surface, 4.2 °C on the bottom. */
export const INTRO_TEMP_SURFACE = 18;
export const INTRO_TEMP_DEEP = 4.2;
/** E-folding depth of the thermocline in metres, so the drop happens in the first few hundred. */
const THERMOCLINE_M = 300;

/** Where the deep water starts and where the bottom is, for the status line. */
export const PRESSURE_LABEL_DEPTH = 650;
export const DEEP_WATER_DEPTH = 1500;

export type IntroPhase = 'boot' | 'descent' | 'reached' | 'hyd' | 'reveal';
export type IntroLabel = 'initialized' | 'descending' | 'pressure' | 'deep-sea' | 'reached';

export interface IntroFrame {
	phase: IntroPhase;
	label: IntroLabel;
	/** Metres, fractional until formatted. */
	depth: number;
	/** Bar, fractional until formatted. */
	pressure: number;
	/** Celsius, fractional until formatted. */
	temperature: number;
	/** Climb from 0 to 1 across the descent, used for every depth-driven style. */
	depthRatio: number;
	/** Climb from 0 to 1 across the start-up, used for every staged style. */
	bootRatio: number;
	/** Needle rotation in degrees, −150 to +150. */
	needleAngle: number;
}

function clamp(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return min;
	return Math.min(Math.max(value, min), max);
}

/** The intro carries its own check, so no other page feature has to be present for it to skip. */
function prefersReducedMotion(win: Window | undefined): boolean {
	try {
		return win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
	} catch {
		return false;
	}
}

/** Piecewise interpolation through the brief's checkpoints, so the readout lands on each one. */
export function depthAt(progress: number): number {
	const p = clamp(progress, 0, 1);
	for (let index = 0; index < DESCENT_MARKS.length - 1; index += 1) {
		const from = DESCENT_MARKS[index];
		const to = DESCENT_MARKS[index + 1];
		if (p <= to || index === DESCENT_MARKS.length - 2) {
			const span = to - from;
			const within = span <= 0 ? 0 : clamp((p - from) / span, 0, 1);
			const start = DEPTH_CHECKPOINTS[index];
			const end = DEPTH_CHECKPOINTS[index + 1];
			return start + (end - start) * within;
		}
	}
	return INTRO_MAX_DEPTH;
}

/** Seawater pressure in the brief's fiction: every checkpoint is exactly `1 + depth / 10`. */
export function pressureFor(depth: number): number {
	return 1 + clamp(depth, 0, INTRO_MAX_DEPTH) / 10;
}

/** Water cools through a thermocline, then holds near the deep reading. */
export function temperatureFor(depth: number): number {
	const metres = clamp(depth, 0, INTRO_MAX_DEPTH);
	return INTRO_TEMP_DEEP + (INTRO_TEMP_SURFACE - INTRO_TEMP_DEEP) * Math.exp(-metres / THERMOCLINE_M);
}

/** The status line follows the depth, so it changes exactly where the brief says it does. */
export function labelFor(phase: IntroPhase, depth: number): IntroLabel {
	if (phase === 'boot') return 'initialized';
	if (depth >= INTRO_MAX_DEPTH - 0.5) return 'reached';
	if (depth >= DEEP_WATER_DEPTH) return 'deep-sea';
	if (depth >= PRESSURE_LABEL_DEPTH) return 'pressure';
	return 'descending';
}

export function phaseAt(elapsedMs: number): IntroPhase {
	if (elapsedMs < INTRO_BOOT_MS) return 'boot';
	if (elapsedMs < INTRO_ARRIVED_MS) return 'descent';
	if (elapsedMs < INTRO_HYD_START_MS) return 'reached';
	if (elapsedMs < INTRO_HYD_START_MS + INTRO_HYD_MS) return 'hyd';
	return 'reveal';
}

export function needleAngleAt(depthRatio: number): number {
	return -INTRO_DIAL_DEGREES / 2 + INTRO_DIAL_DEGREES * clamp(depthRatio, 0, 1);
}

/**
 * The pointer lifts off its rest pin and settles back, the way a real gauge does when it is
 * switched on. Zero by the end of the start-up, so the descent starts from a resting needle.
 */
export function needleTestAt(bootRatio: number): number {
	const start = 0.55;
	if (!(bootRatio > start && bootRatio < 1)) return 0;
	return Math.sin(((bootRatio - start) / (1 - start)) * Math.PI) * 9;
}

export function formatDepth(depth: number): string {
	return `${String(Math.round(clamp(depth, 0, INTRO_MAX_DEPTH))).padStart(3, '0')} m`;
}

/** One decimal all the way down, so the readout never changes width under the numbers. */
export function formatPressure(bar: number): string {
	return `${bar.toFixed(1)} BAR`;
}

export function formatTemperature(celsius: number): string {
	return `${celsius.toFixed(1)} °C`;
}

/** Everything the driver needs for one animation frame, as a pure function. */
export function introFrameAt(elapsedMs: number): IntroFrame {
	const elapsed = clamp(elapsedMs, 0, INTRO_TOTAL_MS);
	const phase = phaseAt(elapsed);
	const descentElapsed = clamp(elapsed - INTRO_BOOT_MS, 0, DESCENT_MS);
	const bootRatio = clamp(elapsed / INTRO_BOOT_MS, 0, 1);
	const depth = phase === 'boot' ? 0 : depthAt(descentElapsed / DESCENT_MS);
	const depthRatio = depth / INTRO_MAX_DEPTH;
	return {
		phase,
		label: labelFor(phase, depth),
		depth,
		pressure: pressureFor(depth),
		temperature: temperatureFor(depth),
		depthRatio,
		bootRatio,
		needleAngle: needleAngleAt(depthRatio) + needleTestAt(bootRatio),
	};
}

export function hasSeenIntro(win: Window | undefined): boolean {
	try {
		return win?.localStorage?.getItem(INTRO_STORAGE_KEY) === '1';
	} catch {
		// Private mode and blocked storage both throw here; treat as "not seen".
		return false;
	}
}

function markIntroSeen(win: Window | undefined): void {
	try {
		win?.localStorage?.setItem(INTRO_STORAGE_KEY, '1');
	} catch {
		// Storage can be unavailable; the intro still runs.
	}
}

/** `?intro=1` (or bare `?intro`) forces a replay; `?intro=0` does not. */
export function introForcedByUrl(href: string): boolean {
	try {
		const params = new URLSearchParams(href);
		return params.has(INTRO_FORCE_PARAM) && params.get(INTRO_FORCE_PARAM) !== '0';
	} catch {
		return false;
	}
}

export interface IntroDecisionOptions {
	enabled: boolean;
	seen: boolean;
	reducedMotion: boolean;
	forced: boolean;
}

export function shouldPlayIntro(options: IntroDecisionOptions): boolean {
	if (!options.enabled) return false;
	if (options.reducedMotion) return false;
	return options.forced || !options.seen;
}

/**
 * Boot script for the document head. It runs while the body is still parsing, so the
 * overlay is armed before the first paint, and it owns the failsafe that frees the page
 * when the intro bundle never loads.
 */
export function introBootScript(): string {
	return `(() => {
	const root = document.documentElement;
	const seen = () => { try { return localStorage.getItem('${INTRO_STORAGE_KEY}') === '1'; } catch { return false; } };
	const forced = () => { try { const p = new URLSearchParams(location.search); return p.has('${INTRO_FORCE_PARAM}') && p.get('${INTRO_FORCE_PARAM}') !== '0'; } catch { return false; } };
	const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches === true; } catch { return false; } };
	if (reduced()) return;
	if (seen() && !forced()) return;
	root.setAttribute('${INTRO_ATTRIBUTE}', '${INTRO_PLAYING}');
	setTimeout(() => {
		root.removeAttribute('${INTRO_ATTRIBUTE}');
		const node = document.querySelector('[data-deep-intro]');
		if (node) node.remove();
	}, ${INTRO_FAILSAFE_MS});
})();`;
}

interface IntroDom {
	root: HTMLElement;
	depth: HTMLElement | null;
	pressure: HTMLElement | null;
	temperature: HTMLElement | null;
	skip: HTMLElement | null;
}

function resolveIntroDom(doc: Document): IntroDom | null {
	const root = doc.querySelector<HTMLElement>('[data-deep-intro]');
	if (!root) return null;
	return {
		root,
		depth: root.querySelector<HTMLElement>('[data-ds-depth]'),
		pressure: root.querySelector<HTMLElement>('[data-ds-pressure]'),
		temperature: root.querySelector<HTMLElement>('[data-ds-temp]'),
		skip: root.querySelector<HTMLElement>('[data-ds-skip]'),
	};
}

function writeText(node: HTMLElement | null, value: string, previous: string): string {
	if (!node || node.textContent === value) return previous;
	node.textContent = value;
	return value;
}

export interface IntroInitOptions {
	enabled?: boolean;
	reducedMotion?: boolean;
}

/**
 * Drives the deep-sea instrument: one rAF loop writing CSS custom properties and the three
 * readouts, then a skip or the end of the timeline removes the overlay from the DOM.
 * Everything is injectable so the timeline can be tested without a browser.
 */
export function initDeepSeaIntro(
	doc: Document = document,
	win: Window = window,
	options: IntroInitOptions = {},
): void {
	const dom = resolveIntroDom(doc);
	if (!dom) return;
	const { root } = dom;

	const html = doc.documentElement;
	const enabled = options.enabled !== false;
	const reducedMotion = options.reducedMotion ?? prefersReducedMotion(win);
	const forced = introForcedByUrl(win.location?.search ?? '');
	const plays = shouldPlayIntro({
		enabled,
		seen: hasSeenIntro(win),
		reducedMotion,
		forced,
	});

	let finished = false;
	let skipping = false;
	let frameId: number | null = null;
	let previousPhase = '';
	let previousLabel = '';
	let previousDepthText = '';
	let previousPressureText = '';
	let previousTemperatureText = '';

	const cancelFrame = () => {
		if (frameId === null) return;
		if (typeof win.cancelAnimationFrame === 'function') win.cancelAnimationFrame(frameId);
		frameId = null;
	};

	/** Hands focus back to the page when the visitor skipped out of the overlay. */
	const returnFocus = () => {
		const active = doc.activeElement;
		if (!active || !root.contains(active)) return;
		const target = doc.querySelector<HTMLElement>('#_top');
		if (!target) return;
		target.setAttribute('tabindex', '-1');
		target.focus();
	};

	const finish = () => {
		if (finished) return;
		finished = true;
		cancelFrame();
		doc.removeEventListener('keydown', onKeydown, true);
		dom.skip?.removeEventListener('click', onSkip);
		root.remove();
		html?.removeAttribute(INTRO_ATTRIBUTE);
		markIntroSeen(win);
		returnFocus();
	};

	/** An intro that must not play leaves nothing behind, and does not mark itself as seen. */
	const abandon = () => {
		if (finished) return;
		finished = true;
		cancelFrame();
		root.remove();
		html?.removeAttribute(INTRO_ATTRIBUTE);
	};

	const skip = () => {
		if (finished || skipping) return;
		skipping = true;
		cancelFrame();
		root.dataset.dsFast = 'true';
		root.dataset.dsPhase = 'reveal';
		const schedule = typeof win.setTimeout === 'function' ? win.setTimeout.bind(win) : null;
		if (schedule) schedule(finish, INTRO_SKIP_REVEAL_MS);
		else finish();
	};

	function onSkip() {
		skip();
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') skip();
	}

	if (!plays) {
		abandon();
		return;
	}

	if (typeof win.requestAnimationFrame !== 'function') {
		abandon();
		return;
	}

	dom.skip?.addEventListener('click', onSkip);
	doc.addEventListener('keydown', onKeydown, true);

	const raf = win.requestAnimationFrame.bind(win);

	let start: number | null = null;
	const step = (now: number) => {
		frameId = null;
		if (finished) return;
		if (start === null) start = Number.isFinite(now) ? now : 0;
		const elapsed = now - start;
		const frame = introFrameAt(elapsed);

		root.style.setProperty('--ds-boot', frame.bootRatio.toFixed(4));
		root.style.setProperty('--ds-depth', frame.depthRatio.toFixed(4));
		root.style.setProperty('--ds-needle', frame.needleAngle.toFixed(2));
		if (frame.phase !== previousPhase) {
			previousPhase = frame.phase;
			root.dataset.dsPhase = frame.phase;
		}
		if (frame.label !== previousLabel) {
			previousLabel = frame.label;
			root.dataset.dsLabel = frame.label;
		}
		previousDepthText = writeText(dom.depth, formatDepth(frame.depth), previousDepthText);
		previousPressureText = writeText(
			dom.pressure,
			formatPressure(frame.pressure),
			previousPressureText,
		);
		previousTemperatureText = writeText(
			dom.temperature,
			formatTemperature(frame.temperature),
			previousTemperatureText,
		);

		if (elapsed >= INTRO_TOTAL_MS) {
			finish();
			return;
		}
		frameId = raf(step);
	};

	try {
		frameId = raf(step);
	} catch {
		finish();
	}
}
