import assert from 'node:assert/strict';
import test from 'node:test';
import { circleRevealClipPaths, maxRevealRadius, revealOrigin } from './theme-transition.ts';

test('the reveal starts at the toggle and expands past the far corner', () => {
	const origin = revealOrigin({ left: 900, top: 20, width: 40, height: 40 }, 1000, 800);
	assert.equal(origin.x, 920);
	assert.equal(origin.y, 40);
	const radius = maxRevealRadius(origin.x, origin.y, 1000, 800);
	const [from, to] = circleRevealClipPaths(origin.x, origin.y, radius, 1000, 800);
	assert.match(from, /^circle\(0% at 92% 5%\)$/);
	assert.match(to, /^circle\(([\d.]+)% at 92% 5%\)$/);
	const end = Number(to.match(/circle\(([\d.]+)%/)?.[1]);
	assert.ok(end > 100);
});

test('fromCenter expands from the middle of the viewport', () => {
	const origin = revealOrigin({ left: 0, top: 0, width: 10, height: 10 }, 800, 600, true);
	assert.deepEqual(origin, { x: 400, y: 300 });
});
