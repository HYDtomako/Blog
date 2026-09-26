export const WATER_BALL_PROGRESS = '--ball-progress';

/** Fraction of the page already scrolled through, clamped to 0..1. */
export function readingProgress(
	scrollTop: number,
	scrollHeight: number,
	viewportHeight: number,
): number {
	if (!Number.isFinite(scrollTop) || !Number.isFinite(scrollHeight) || !Number.isFinite(viewportHeight)) {
		return 0;
	}
	const span = scrollHeight - viewportHeight;
	if (span <= 0) return 0;
	return Math.min(Math.max(scrollTop / span, 0), 1);
}

export function prefersReducedMotion(win: Window | undefined): boolean {
	try {
		return win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
	} catch {
		return false;
	}
}

/**
 * Fills the corner water ball from the scroll position. Each page keeps its own
 * progress because nothing is stored: the ball is derived from this document only.
 */
export function initScrollWaterBall(doc: Document = document, win: Window = window): void {
	const ball = doc.querySelector<HTMLElement>('[data-water-ball]');
	if (!ball) return;

	const apply = () => {
		const progress = readingProgress(
			win.scrollY ?? 0,
			doc.documentElement?.scrollHeight ?? 0,
			win.innerHeight ?? 0,
		);
		ball.style.setProperty(WATER_BALL_PROGRESS, progress.toFixed(4));
	};

	let scheduled = false;
	const schedule = () => {
		if (scheduled) return;
		scheduled = true;
		const run = () => {
			scheduled = false;
			apply();
		};
		if (typeof win.requestAnimationFrame !== 'function') {
			run();
			return;
		}
		win.requestAnimationFrame(run);
	};

	apply();
	win.addEventListener('scroll', schedule, { passive: true });
	win.addEventListener('resize', schedule);
	win.addEventListener('load', schedule);

	// Images, fonts, and sections that arrive after the first paint change the
	// document height, so the ratio has to be recomputed when it does.
	const Observer = (win as Window & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
	if (typeof Observer === 'function') new Observer(schedule).observe(doc.documentElement);

	ball.querySelector<HTMLButtonElement>('[data-water-ball-button]')?.addEventListener('click', () => {
		win.scrollTo({ top: 0, behavior: prefersReducedMotion(win) ? 'auto' : 'smooth' });
	});
}
