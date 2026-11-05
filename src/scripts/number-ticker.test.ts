import assert from 'node:assert/strict';
import test from 'node:test';
import { armNumberTicker, displayedTicker, formatTicker, stepUnitSpring } from './number-ticker.ts';

test('the unit spring climbs from 0 and settles at 1', () => {
	let state = { value: 0, velocity: 0 };
	let previous = 0;
	for (let i = 0; i < 280; i += 1) {
		state = stepUnitSpring(state, 1 / 60);
		assert.ok(state.value >= previous);
		previous = state.value;
		if (state.settled) break;
	}
	assert.equal(state.settled, true);
	assert.equal(state.value, 1);
});

test('displayed digits start at 0 and land on the target', () => {
	assert.equal(displayedTicker(0, 2500), 0);
	assert.equal(displayedTicker(0.5, 2500), 1250);
	assert.equal(displayedTicker(0.9999, 2500), 2500);
	assert.equal(displayedTicker(1, 8), 8);
});

test('formatTicker groups digits and survives a bad locale', () => {
	assert.equal(formatTicker(2500, 'en'), '2,500');
	assert.equal(formatTicker(2500.4, 'zh-CN'), '2,500');
	assert.equal(formatTicker(7, 'not a locale'), '7');
});

test('armNumberTicker ignores non-elements so tests can call it safely', () => {
	const node = { textContent: '9' };
	armNumberTicker(node, 9, 'en');
	assert.equal(node.textContent, '9');
});
