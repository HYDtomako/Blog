import assert from 'node:assert/strict';
import test from 'node:test';
import { WATER_BALL_PROGRESS, initScrollWaterBall, prefersReducedMotion, readingProgress } from './scroll-water-ball.ts';

type Listener = (event: unknown) => void;

function createBoard(options: { ball?: boolean; reducedMotion?: boolean } = {}) {
	const styles = new Map<string, string>();
	const windowListeners = new Map<string, Listener>();
	const buttonListeners = new Map<string, Listener>();
	const scrolls: ScrollToOptions[] = [];

	const button = {
		addEventListener: (type: string, handler: Listener) => buttonListeners.set(type, handler),
	};
	const ball = {
		style: {
			setProperty: (name: string, value: string) => {
				styles.set(name, value);
			},
		},
		querySelector: (selector: string) => (selector === '[data-water-ball-button]' ? button : null),
	};
	const doc = {
		documentElement: { scrollHeight: 2000 },
		querySelector: (selector: string) =>
			selector === '[data-water-ball]' && options.ball !== false ? ball : null,
	} as unknown as Document;
	const win = {
		scrollY: 0,
		innerHeight: 1000,
		requestAnimationFrame: (run: () => void) => {
			run();
			return 1;
		},
		matchMedia: () => ({ matches: options.reducedMotion === true }),
		addEventListener: (type: string, handler: Listener) => windowListeners.set(type, handler),
		scrollTo: (next: ScrollToOptions) => {
			scrolls.push(next);
		},
	} as unknown as Window;

	return {
		styles,
		scrolls,
		doc,
		win,
		progress: () => styles.get(WATER_BALL_PROGRESS),
		scrollTo: (top: number) => {
			(win as { scrollY: number }).scrollY = top;
			windowListeners.get('scroll')?.(undefined);
		},
		click: () => buttonListeners.get('click')?.(undefined),
		resize: () => windowListeners.get('resize')?.(undefined),
	};
}

test('readingProgress maps the scroll span to 0..1 and clamps the ends', () => {
	assert.equal(readingProgress(0, 2000, 1000), 0);
	assert.equal(readingProgress(500, 2000, 1000), 0.5);
	assert.equal(readingProgress(1000, 2000, 1000), 1);
	assert.equal(readingProgress(1400, 2000, 1000), 1);
	assert.equal(readingProgress(-80, 2000, 1000), 0);
});

test('readingProgress reports 0 for a page that cannot scroll', () => {
	assert.equal(readingProgress(0, 800, 1000), 0);
	assert.equal(readingProgress(400, 1000, 1000), 0);
});

test('readingProgress survives missing or broken measurements', () => {
	assert.equal(readingProgress(Number.NaN, 2000, 1000), 0);
	assert.equal(readingProgress(500, Number.POSITIVE_INFINITY, 1000), 0);
	assert.equal(readingProgress(500, 2000, Number.NaN), 0);
});

test('initScrollWaterBall writes the scroll ratio onto the ball', () => {
	const board = createBoard();
	initScrollWaterBall(board.doc, board.win);
	assert.equal(board.progress(), '0.0000');

	board.scrollTo(500);
	assert.equal(board.progress(), '0.5000');

	board.scrollTo(2000);
	assert.equal(board.progress(), '1.0000');
});

test('initScrollWaterBall recomputes after a resize and does nothing without the ball', () => {
	const board = createBoard();
	initScrollWaterBall(board.doc, board.win);
	(board.doc.documentElement as { scrollHeight: number }).scrollHeight = 4000;
	board.scrollTo(1000);
	assert.equal(board.progress(), '0.3333');
	(board.win as unknown as { innerHeight: number }).innerHeight = 2000;
	board.resize();
	assert.equal(board.progress(), '0.5000');

	const empty = createBoard({ ball: false });
	initScrollWaterBall(empty.doc, empty.win);
	assert.equal(empty.progress(), undefined);
});

test('clicking the ball scrolls home smoothly, or instantly with reduced motion', () => {
	const board = createBoard();
	initScrollWaterBall(board.doc, board.win);
	board.click();
	assert.deepEqual(board.scrolls, [{ top: 0, behavior: 'smooth' }]);

	const reduced = createBoard({ reducedMotion: true });
	initScrollWaterBall(reduced.doc, reduced.win);
	reduced.click();
	assert.deepEqual(reduced.scrolls, [{ top: 0, behavior: 'auto' }]);
});

test('prefersReducedMotion tolerates a window without matchMedia', () => {
	assert.equal(prefersReducedMotion(undefined), false);
	assert.equal(prefersReducedMotion({} as Window), false);
	assert.equal(prefersReducedMotion({ matchMedia: () => ({ matches: true }) } as unknown as Window), true);
});
