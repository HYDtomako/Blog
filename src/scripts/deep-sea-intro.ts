/** Marker written once the visitor has seen the intro this browsing session. */
export const INTRO_STORAGE_KEY = 'refined-x-intro-seen';
/** `?intro=1` replays the intro even for a visitor who has already seen it. */
export const INTRO_FORCE_PARAM = 'intro';

/**
 * The brief's single timeline: start-up, the descent to the abyssal floor, the arrival
 * climax, a short hold so the arrival is not wiped away the instant it lands, then the
 * clip-path reveal that hands the page over.
 */
export const INTRO_BOOT_MS = 600;
export const INTRO_DESCENT_MS = 4200;
export const INTRO_CLIMAX_MS = 800;
/** Loiter on the seabed: keep the wordmark, sonar and tagline on screen before the reveal. */
export const INTRO_HOLD_MS = 1400;
export const INTRO_REVEAL_MS = 900;

export const INTRO_ARRIVED_MS = INTRO_BOOT_MS + INTRO_DESCENT_MS;
export const INTRO_REVEAL_START_MS = INTRO_ARRIVED_MS + INTRO_CLIMAX_MS + INTRO_HOLD_MS;
export const INTRO_TOTAL_MS = INTRO_REVEAL_START_MS + INTRO_REVEAL_MS;

/** Compressed reveal when the visitor skips. */
export const INTRO_SKIP_REVEAL_MS = 320;
/** Hard stop owned by the inline boot script, so a page without the intro bundle stays usable. */
export const INTRO_FAILSAFE_MS = INTRO_TOTAL_MS + 2500;

/** Attribute on the document root that arms the overlay; absent means "no intro". */
export const INTRO_ATTRIBUTE = 'data-intro';
export const INTRO_PLAYING = 'play';
export const INTRO_REVEALING = 'revealing';

/** The brief's final reading: the Challenger Deep, rounded to the hundred metres. */
export const INTRO_MAX_DEPTH = 10900;

/** The brief's two water temperatures: 18.0 °C at the surface, near 2 °C on the floor. */
export const INTRO_TEMP_SURFACE = 18;
export const INTRO_TEMP_DEEP = 2;
/** E-folding depth of the thermocline in metres, so the drop happens in the first kilometre. */
const THERMOCLINE_M = 900;

/** Where the deep water starts and where the pressure line changes, for the status word. */
export const PRESSURE_LABEL_DEPTH = 2000;
export const DEEP_WATER_DEPTH = 6000;

export type IntroPhase = 'boot' | 'descent' | 'reached' | 'reveal';
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
	/** Climb from 0 to 1 across the whole timeline, used for the reveal and the descent. */
	progress: number;
	/** Depth as a 0–1 fraction, used for every depth-driven style. */
	depthRatio: number;
	/** Climb from 0 to 1 across the start-up, used for every staged style. */
	bootRatio: number;
	/** Climb from 0 to 1 across the arrival, driving the sonar ring and the spotlight. */
	climaxRatio: number;
	/** Climb from 0 to 1 across the reveal, driving the clip-path hand-off. */
	revealRatio: number;
}

function clamp(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return min;
	return Math.min(Math.max(value, min), max);
}

function clamp01(value: number): number {
	return clamp(value, 0, 1);
}

/** Ease in-out cubic, kept for reference and tests. */
export function easeInOutCubic(progress: number): number {
	const p = clamp01(progress);
	return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

/** Gentle ease in-out: the cruise is far less rushed than cubic, so the water reads as steady. */
export function easeInOutSine(progress: number): number {
	return 0.5 - 0.5 * Math.cos(Math.PI * clamp01(progress));
}

/** The intro carries its own check, so no other page feature has to be present for it to skip. */
function prefersReducedMotion(win: Window | undefined): boolean {
	try {
		return win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
	} catch {
		return false;
	}
}

/**
 * The scroll lock hides the scrollbar, so the page would widen for the length of the intro and
 * snap back — right edge first — the moment it is released. Measure the bar while the lock is
 * on and hand its width to CSS, so `html[data-intro="play"]` keeps the page the same width.
 */
export function reserveScrollbarGutter(doc: Document, win: Window): void {
	try {
		const html = doc?.documentElement;
		if (!html?.style) return;
		const previous = html.style.overflowY;
		html.style.overflowY = 'scroll';
		const gutter = Number(win?.innerWidth ?? 0) - html.clientWidth;
		html.style.overflowY = previous;
		if (gutter > 0) html.style.setProperty('--intro-gutter', `${Math.round(gutter)}px`);
	} catch {
		// An unmeasurable layout just keeps the browser's own scrollbar behaviour.
	}
}

/** Depth follows one eased progress, from the surface to the abyssal floor. */
export function depthAt(progress: number): number {
	return INTRO_MAX_DEPTH * easeInOutSine(progress);
}

/** Seawater pressure in the brief's fiction: exactly `1 + depth / 10`, so 10900 m reads 1091 bar. */
export function pressureFor(depth: number): number {
	return 1 + clamp(depth, 0, INTRO_MAX_DEPTH) / 10;
}

/** Water cools through a thermocline, then holds near the floor reading. */
export function temperatureFor(depth: number): number {
	const metres = clamp(depth, 0, INTRO_MAX_DEPTH);
	return (
		INTRO_TEMP_DEEP + (INTRO_TEMP_SURFACE - INTRO_TEMP_DEEP) * Math.exp(-metres / THERMOCLINE_M)
	);
}

/** The status word follows the depth, so it changes exactly where the brief says it does. */
export function labelFor(phase: IntroPhase, depth: number): IntroLabel {
	if (phase === 'boot') return 'initialized';
	if (phase === 'reached' || phase === 'reveal') return 'reached';
	if (depth >= DEEP_WATER_DEPTH) return 'deep-sea';
	if (depth >= PRESSURE_LABEL_DEPTH) return 'pressure';
	return 'descending';
}

export function phaseAt(elapsedMs: number): IntroPhase {
	if (elapsedMs < INTRO_BOOT_MS) return 'boot';
	if (elapsedMs < INTRO_ARRIVED_MS) return 'descent';
	if (elapsedMs < INTRO_REVEAL_START_MS) return 'reached';
	return 'reveal';
}

export function formatDepth(depth: number): string {
	return `${String(Math.round(clamp(depth, 0, INTRO_MAX_DEPTH))).padStart(5, '0')} m`;
}

/** One decimal all the way down, so the readout never changes width under the numbers. */
export function formatPressure(bar: number): string {
	return `${bar.toFixed(1)} BAR`;
}

export function formatTemperature(celsius: number): string {
	return `${celsius.toFixed(1)} °C`;
}

/** Descent rate, one decimal so the corner readout ticks without ever reflowing. */
export function formatRate(metresPerSecond: number): string {
	const value = Number.isFinite(metresPerSecond) ? Math.max(0, metresPerSecond) : 0;
	return `${value.toFixed(1)} m/s`;
}

/** The corner SYSTEM readout: one word per phase of the dive. */
export function systemWordFor(phase: string): string {
	switch (phase) {
		case 'boot':
			return 'BOOT';
		case 'descent':
			return 'DESCENT';
		case 'reached':
			return 'HOLD';
		default:
			return 'REVEAL';
	}
}

/** Marine-snow population, rising with depth: sparse up top, a steady drift near the floor. */
export function snowDensityFor(depthRatio: number): number {
	return Math.round(48 + 152 * clamp01(depthRatio));
}

/** Marine snow falls slower as the water thickens, as the brief asks. */
export function snowFallSpeedFor(depthRatio: number): number {
	return 0.95 - 0.6 * clamp01(depthRatio);
}

/** And it dims with depth, so the abyss never reads as a bright particle effect. */
export function snowBrightnessFor(depthRatio: number): number {
	return 0.42 - 0.27 * clamp01(depthRatio);
}

/** Everything the driver needs for one animation frame, as a pure function. */
export function introFrameAt(elapsedMs: number): IntroFrame {
	const elapsed = clamp(elapsedMs, 0, INTRO_TOTAL_MS);
	const phase = phaseAt(elapsed);
	const descentElapsed = clamp(elapsed - INTRO_BOOT_MS, 0, INTRO_DESCENT_MS);
	const depth = phase === 'boot' ? 0 : depthAt(descentElapsed / INTRO_DESCENT_MS);
	const depthRatio = depth / INTRO_MAX_DEPTH;
	return {
		phase,
		label: labelFor(phase, depth),
		depth,
		pressure: pressureFor(depth),
		temperature: temperatureFor(depth),
		progress: clamp01(elapsed / INTRO_TOTAL_MS),
		depthRatio,
		bootRatio: clamp01(elapsed / INTRO_BOOT_MS),
		climaxRatio: clamp01((elapsed - INTRO_ARRIVED_MS) / INTRO_CLIMAX_MS),
		revealRatio: clamp01((elapsed - INTRO_REVEAL_START_MS) / INTRO_REVEAL_MS),
	};
}

export function hasSeenIntro(win: Window | undefined): boolean {
	try {
		return win?.sessionStorage?.getItem(INTRO_STORAGE_KEY) === '1';
	} catch {
		// Private mode and blocked storage both throw here; treat as "not seen".
		return false;
	}
}

function markIntroSeen(win: Window | undefined): void {
	try {
		win?.sessionStorage?.setItem(INTRO_STORAGE_KEY, '1');
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
	const seen = () => { try { return sessionStorage.getItem('${INTRO_STORAGE_KEY}') === '1'; } catch { return false; } };
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
	rate: HTMLElement | null;
	system: HTMLElement | null;
	skip: HTMLElement | null;
	canvas: HTMLCanvasElement | null;
	statuses: HTMLElement[];
}

function resolveIntroDom(doc: Document): IntroDom | null {
	const root = doc.querySelector<HTMLElement>('[data-deep-intro]');
	if (!root) return null;
	// Publish the arrival time so the CSS-only embellishments (sonar, beam, tagline) fire in
	// step with the JavaScript timeline instead of drifting from hard-coded seconds.
	root.style.setProperty('--ds-arrived', `${INTRO_ARRIVED_MS}ms`);
	return {
		root,
		depth: root.querySelector<HTMLElement>('[data-ds-depth]'),
		pressure: root.querySelector<HTMLElement>('[data-ds-pressure]'),
		temperature: root.querySelector<HTMLElement>('[data-ds-temp]'),
		rate: root.querySelector<HTMLElement>('[data-ds-hud="rate"]'),
		system: root.querySelector<HTMLElement>('[data-ds-hud="system"]'),
		skip: root.querySelector<HTMLElement>('[data-ds-skip]'),
		canvas: root.querySelector<HTMLCanvasElement>('[data-ds-snow]'),
		statuses: Array.from(root.querySelectorAll<HTMLElement>('[data-ds-for]')),
	};
}

function writeText(node: HTMLElement | null, value: string, previous: string): string {
	if (!node || node.textContent === value) return previous;
	node.textContent = value;
	return value;
}

/** Shallow-water bubbles: common near the surface, thinned out over the first kilometre. */
export function bubbleCountFor(depthRatio: number): number {
	return Math.round(16 * Math.max(0, 1 - clamp01(depthRatio) * 3));
}

/** Deep-water bioluminescence: dormant until the abyss, then a scatter of waking points. */
export function glowCountFor(depthRatio: number): number {
	return Math.round(26 * Math.max(0, clamp01(depthRatio) * 1.6 - 0.58));
}

/** A bioluminescent point swells as the pointer nears it, as the brief asks. */
export function glowBoostFor(distance: number, radius: number): number {
	if (!(radius > 0)) return 0;
	return clamp01(1 - distance / radius);
}

interface ParticlePointer {
	x: number;
	y: number;
	active: boolean;
}

interface Flake {
	x: number;
	y: number;
	radius: number;
	vy: number;
	vx: number;
	alpha: number;
}

interface Bubble {
	x: number;
	y: number;
	radius: number;
	vy: number;
	vx: number;
	alpha: number;
	phase: number;
}

interface Glow {
	x: number;
	y: number;
	radius: number;
	alpha: number;
	phase: number;
	speed: number;
	drift: number;
}

/**
 * The one shared particle canvas: marine snow, shallow bubbles and deep bioluminescence.
 * Each pool is resized to its depth-derived target every frame, so nothing allocates per frame
 * after warm-up. The loop is owned by the caller so `finish()` can stop it and drop the canvas.
 */
function createParticleLayer(canvas: HTMLCanvasElement, win: Window) {
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;
	const flakes: Flake[] = [];
	const bubbles: Bubble[] = [];
	const glows: Glow[] = [];
	let width = 0;
	let height = 0;
	let dpr = 1;

	const resize = () => {
		dpr = Math.min(win.devicePixelRatio || 1, 2);
		width = Math.max(1, win.innerWidth || canvas.clientWidth || 1);
		height = Math.max(1, win.innerHeight || canvas.clientHeight || 1);
		canvas.width = Math.round(width * dpr);
		canvas.height = Math.round(height * dpr);
		canvas.style.width = `${width}px`;
		canvas.style.height = `${height}px`;
	};
	resize();

	const spawnFlake = (fromTop: boolean): Flake => {
		const radius = 0.5 + Math.random() * 1.6;
		return {
			x: Math.random() * width,
			y: fromTop ? -radius : Math.random() * height,
			radius,
			vy: 8 + Math.random() * 18,
			vx: (Math.random() - 0.5) * 4,
			alpha: 0.25 + Math.random() * 0.75,
		};
	};

	const spawnBubble = (): Bubble => ({
		x: Math.random() * width,
		y: height + Math.random() * height * 0.3,
		radius: 0.8 + Math.random() * 2.4,
		vy: 22 + Math.random() * 46,
		vx: (Math.random() - 0.5) * 10,
		alpha: 0.16 + Math.random() * 0.3,
		phase: Math.random() * Math.PI * 2,
	});

	const spawnGlow = (): Glow => ({
		x: Math.random() * width,
		y: Math.random() * height,
		radius: 0.8 + Math.random() * 1.8,
		alpha: 0.3 + Math.random() * 0.7,
		phase: Math.random() * Math.PI * 2,
		speed: 0.6 + Math.random() * 1.4,
		drift: (Math.random() - 0.5) * 6,
	});

	/** Recycle a risen bubble in place, so the pool never grows. */
	const resetBubble = (bubble: Bubble): void => {
		const fresh = spawnBubble();
		Object.assign(bubble, fresh);
	};

	return {
		resize,
		draw(
			depthRatio: number,
			deltaMs: number,
			elapsedMs: number,
			pointer: ParticlePointer,
		) {
			const seconds = Math.min(deltaMs, 48) / 1000;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.clearRect(0, 0, width, height);

			// Marine snow — the base layer, present the whole way down.
			const snowTarget = snowDensityFor(depthRatio);
			while (flakes.length < snowTarget) flakes.push(spawnFlake(false));
			if (flakes.length > snowTarget) flakes.length = snowTarget;
			const snowSpeed = snowFallSpeedFor(depthRatio);
			const snowBright = snowBrightnessFor(depthRatio);
			ctx.fillStyle = '#cfe6f2';
			for (const flake of flakes) {
				flake.y += flake.vy * snowSpeed * seconds;
				flake.x += flake.vx * snowSpeed * seconds;
				if (flake.y - flake.radius > height) {
					flake.y = -flake.radius;
					flake.x = Math.random() * width;
				}
				if (flake.x < -2) flake.x = width + 2;
				else if (flake.x > width + 2) flake.x = -2;
				ctx.globalAlpha = flake.alpha * snowBright;
				ctx.beginPath();
				ctx.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
				ctx.fill();
			}

			// Bubbles — shallow water only, rising and breathing as they climb.
			const bubbleTarget = bubbleCountFor(depthRatio);
			while (bubbles.length < bubbleTarget) bubbles.push(spawnBubble());
			if (bubbles.length > bubbleTarget) bubbles.length = bubbleTarget;
			ctx.fillStyle = '#dff2fb';
			for (const bubble of bubbles) {
				bubble.y -= bubble.vy * seconds;
				bubble.x += (bubble.vx + Math.sin(elapsedMs / 700 + bubble.phase) * 7) * seconds;
				if (bubble.y + bubble.radius < 0) resetBubble(bubble);
				if (bubble.x < -4) bubble.x = width + 4;
				else if (bubble.x > width + 4) bubble.x = -4;
				ctx.globalAlpha = bubble.alpha * (0.55 + 0.45 * Math.sin(elapsedMs / 480 + bubble.phase));
				ctx.beginPath();
				ctx.arc(bubble.x, bubble.y, bubble.radius, 0, Math.PI * 2);
				ctx.fill();
			}

			// Bioluminescence — deep water only, blinking, and waking under the pointer.
			const glowTarget = glowCountFor(depthRatio);
			while (glows.length < glowTarget) glows.push(spawnGlow());
			if (glows.length > glowTarget) glows.length = glowTarget;
			ctx.fillStyle = '#74d6e8';
			for (const glow of glows) {
				glow.x += glow.drift * seconds;
				if (glow.x < -6) glow.x = width + 6;
				else if (glow.x > width + 6) glow.x = -6;
				const blink = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin((elapsedMs / 1000) * glow.speed + glow.phase));
				const boost = pointer?.active
					? glowBoostFor(Math.hypot(pointer.x - glow.x, pointer.y - glow.y), 170)
					: 0;
				const alpha = clamp01(glow.alpha * blink + boost * 0.7);
				ctx.globalAlpha = alpha * 0.25;
				ctx.beginPath();
				ctx.arc(glow.x, glow.y, glow.radius * 3.4, 0, Math.PI * 2);
				ctx.fill();
				ctx.globalAlpha = alpha;
				ctx.beginPath();
				ctx.arc(glow.x, glow.y, glow.radius, 0, Math.PI * 2);
				ctx.fill();
			}
			ctx.globalAlpha = 1;
		},
	};
}

export interface IntroInitOptions {
	enabled?: boolean;
	reducedMotion?: boolean;
}

/**
 * Drives the deep-sea instrument: one rAF loop writing CSS custom properties and the readouts,
 * one canvas layer for the marine snow, then a skip or the end of the timeline removes the
 * overlay and marks the session. Everything is injectable so the timeline can be tested without
 * a browser.
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
	let previousRateText = '';
	let previousDepth = 0;
	let lastNow = 0;

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

	let particles: ReturnType<typeof createParticleLayer> = null;
	const onResize = () => particles?.resize();

	const finish = () => {
		if (finished) return;
		finished = true;
		cancelFrame();
		doc.removeEventListener('keydown', onKeydown, true);
		doc.removeEventListener('pointerdown', onPointerDown, true);
		if (typeof win.removeEventListener === 'function') {
			win.removeEventListener('resize', onResize);
			win.removeEventListener('pointermove', onPointerMove);
		}
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
		if (typeof win.removeEventListener === 'function') {
			win.removeEventListener('resize', onResize);
			win.removeEventListener('pointermove', onPointerMove);
		}
		root.remove();
		html?.removeAttribute(INTRO_ATTRIBUTE);
	};

	const skip = () => {
		if (finished || skipping) return;
		skipping = true;
		cancelFrame();
		root.dataset.dsFast = 'true';
		root.dataset.dsPhase = 'reveal';
		html?.setAttribute(INTRO_ATTRIBUTE, INTRO_REVEALING);
		const schedule = typeof win.setTimeout === 'function' ? win.setTimeout.bind(win) : null;
		if (schedule) schedule(finish, INTRO_SKIP_REVEAL_MS);
		else finish();
	};

	function onSkip() {
		skip();
	}

	function onPointerDown() {
		skip();
	}

	const pointer: ParticlePointer = { x: 0, y: 0, active: false };

	function onPointerMove(event: PointerEvent) {
		pointer.x = event.clientX;
		pointer.y = event.clientY;
		pointer.active = true;
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
	doc.addEventListener('pointerdown', onPointerDown, true);
	reserveScrollbarGutter(doc, win);

	particles = dom.canvas ? createParticleLayer(dom.canvas, win) : null;
	if (typeof win.addEventListener === 'function') {
		win.addEventListener('resize', onResize);
		win.addEventListener('pointermove', onPointerMove, { passive: true });
	}

	const raf = win.requestAnimationFrame.bind(win);

	let start: number | null = null;
	const step = (now: number) => {
		frameId = null;
		if (finished) return;
		if (start === null) start = Number.isFinite(now) ? now : 0;
		const elapsed = now - start;
		const delta = lastNow === 0 ? 16 : elapsed - lastNow;
		lastNow = elapsed;
		const frame = introFrameAt(elapsed);

		root.style.setProperty('--ds-boot', frame.bootRatio.toFixed(4));
		root.style.setProperty('--ds-depth', frame.depthRatio.toFixed(4));
		root.style.setProperty('--ds-climax', frame.climaxRatio.toFixed(4));
		root.style.setProperty('--ds-reveal', frame.revealRatio.toFixed(4));
		root.style.setProperty('--ds-progress', frame.progress.toFixed(4));
		if (frame.phase !== previousPhase) {
			previousPhase = frame.phase;
			root.dataset.dsPhase = frame.phase;
			if (frame.phase === 'reveal') {
				html?.setAttribute(INTRO_ATTRIBUTE, INTRO_REVEALING);
			}
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
		const rate = delta > 0 ? (frame.depth - previousDepth) / (delta / 1000) : 0;
		previousDepth = frame.depth;
		previousRateText = writeText(dom.rate, formatRate(rate), previousRateText);
		if (dom.system) dom.system.textContent = systemWordFor(frame.phase);

		if (frame.phase === 'reveal') {
			// Clip-path hand-off: a circular aperture opening from the centre of the screen.
			const radius = 150 * (1 - frame.revealRatio);
			root.style.clipPath = `circle(${radius.toFixed(2)}% at 50% 50%)`;
		}

		particles?.draw(frame.depthRatio, delta, elapsed, pointer);

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
