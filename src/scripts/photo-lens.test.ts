import assert from 'node:assert/strict';
import test from 'node:test';
import { blurFadeDelaySeconds, lensPoint } from './photo-lens.ts';

test('blur-fade delays stagger like the Magic UI photo list', () => {
	assert.equal(blurFadeDelaySeconds(0), 0.25);
	assert.equal(blurFadeDelaySeconds(1), 0.3);
	assert.equal(blurFadeDelaySeconds(3), 0.4);
});

test('the lens sits on the pointer relative to the photo frame', () => {
	assert.deepEqual(lensPoint(180, 90, { left: 40, top: 20 }), { x: 140, y: 70 });
});
