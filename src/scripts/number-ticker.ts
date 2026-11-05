/**
 * Viewport count-up for the home site-stats figures.
 * The spring drives a 0→1 progress (Magic UI damping 60 / stiffness 100) so a
 * large total finishes on the same beat as a small one, then snaps to the target
 * once the rounded digits land.
 */

export const TICKER_STIFFNESS = 100;
export const TICKER_DAMPING = 60;

export type SpringState = { value: number; velocity: number };

export function stepUnitSpring(
	state: SpringState,
	dt: number,
	stiffness = TICKER_STIFFNESS,
	damping = TICKER_DAMPING,
): SpringState & { settled: boolean } {
	const target = 1;
	const force = -stiffness * (state.value - target);
	const velocity = state.velocity + (force - damping * state.velocity) * dt;
	const value = state.value + velocity * dt;
	const settled = value >= 0.999;
	if (settled || value >= target) return { value: 1, velocity: 0, settled: true };
	return { value: Math.max(0, value), velocity, settled: false };
}

/** Integer shown while `progress` moves from 0 to 1. Lands on `target` once rounded. */
export function displayedTicker(progress: number, target: number): number {
	if (!Number.isFinite(target)) return 0;
	if (progress >= 1) return target;
	const shown = Math.round(progress * target);
	return shown === Math.round(target) ? target : shown;
}

export function formatTicker(value: number, locale: string): string {
	const rounded = Math.round(value);
	try {
		return new Intl.NumberFormat(locale || 'en', {
			maximumFractionDigits: 0,
		}).format(rounded);
	} catch {
		return String(rounded);
	}
}

function motionReduced(): boolean {
	return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function isElement(node: unknown): node is HTMLElement {
	return typeof HTMLElement !== 'undefined' && node instanceof HTMLElement;
}

function paint(node: HTMLElement, value: number, locale: string) {
	node.textContent = formatTicker(value, locale);
}

function runTicker(node: HTMLElement, target: number, locale: string) {
	if (typeof requestAnimationFrame !== 'function') {
		paint(node, target, locale);
		return;
	}
	let state: SpringState = { value: 0, velocity: 0 };
	let last = performance.now();
	// The Magic UI spring (damping 60, stiffness 100) is applied on a 0→1
	// progress and played at 2× so a large total finishes in about two seconds.
	const step = (now: number) => {
		const dt = Math.min(0.032, (now - last) / 1000);
		last = now;
		state = stepUnitSpring(state, dt * 2);
		const shown = displayedTicker(state.value, target);
		paint(node, shown, locale);
		if (!state.settled && shown !== target) requestAnimationFrame(step);
		else paint(node, target, locale);
	};
	paint(node, 0, locale);
	requestAnimationFrame(step);
}

/** Count `node` from 0 to `value` the first time it enters the viewport. */
export function armNumberTicker(node: unknown, value: number, locale: string) {
	if (!isElement(node) || !Number.isFinite(value)) return;
	if (node.dataset.tickerArmed === 'true') return;
	node.dataset.tickerArmed = 'true';
	if (value === 0 || motionReduced() || typeof IntersectionObserver !== 'function') {
		paint(node, value, locale);
		return;
	}
	paint(node, 0, locale);
	const observer = new IntersectionObserver(
		(entries) => {
			if (!entries.some((entry) => entry.isIntersecting)) return;
			observer.disconnect();
			runTicker(node, value, locale);
		},
		{ rootMargin: '0px', threshold: 0.35 },
	);
	observer.observe(node);
}

/** Arms every `[data-number-ticker]` inside the home site-stats block. */
export function initNumberTickers(doc: Document = document) {
	const scope = doc.querySelector<HTMLElement>('[data-site-stats]');
	if (!scope) return;
	const locale = scope.dataset.statsLocale || scope.getAttribute('data-stats-locale') || 'en';
	for (const el of scope.querySelectorAll('[data-number-ticker]')) {
		const value = Number(el.getAttribute('data-number-ticker'));
		if (!Number.isFinite(value)) continue;
		armNumberTicker(el, value, locale);
	}
}
