import assert from 'node:assert/strict';
import test from 'node:test';
import { copyText, copyValueFromContact } from './copy-text.ts';

test('contact values drop a mailto prefix and surrounding space', () => {
	assert.equal(copyValueFromContact('mailto:HYDhyd0505@gmail.com'), 'HYDhyd0505@gmail.com');
	assert.equal(copyValueFromContact('  mailto:hydagent10@gmail.com  '), 'hydagent10@gmail.com');
	assert.equal(copyValueFromContact('2804956879'), '2804956879');
	assert.equal(copyValueFromContact(undefined), '');
});

test('copyText writes the trimmed value and reports failure', async () => {
	const written: string[] = [];
	assert.equal(await copyText('  hydagent10@gmail.com ', async (value) => {
		written.push(value);
	}), true);
	assert.deepEqual(written, ['hydagent10@gmail.com']);

	assert.equal(await copyText('   ', async () => {}), false);
	assert.equal(
		await copyText('2804956879', async () => {
			throw new Error('denied');
		}),
		false,
	);
});
