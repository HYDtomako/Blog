import assert from 'node:assert/strict';
import test from 'node:test';
import {
	applyResolvedTheme,
	otherTheme,
	readResolvedTheme,
	THEME_PREFERENCE_KEY,
	STARLIGHT_THEME_KEY,
	writeResolvedTheme,
} from './theme-preference.ts';

function storageStub(initial: Record<string, string> = {}) {
	const values = new Map(Object.entries(initial));
	return {
		getItem(key: string) {
			return values.get(key) ?? null;
		},
		setItem(key: string, value: string) {
			values.set(key, value);
		},
		value(key: string) {
			return values.get(key);
		},
	};
}

function rootStub() {
	return {
		dataset: {} as Record<string, string>,
		style: {} as { colorScheme?: string },
	} as HTMLElement & { style: { colorScheme?: string } };
}

test('the light canvas is the default when nothing is stored', () => {
	assert.equal(readResolvedTheme(storageStub()), 'light');
	assert.equal(readResolvedTheme(storageStub({ [THEME_PREFERENCE_KEY]: 'system' })), 'light');
});

test('a stored theme wins and legacy starlight values still migrate', () => {
	assert.equal(readResolvedTheme(storageStub({ [THEME_PREFERENCE_KEY]: 'dark' })), 'dark');
	assert.equal(readResolvedTheme(storageStub({ [THEME_PREFERENCE_KEY]: 'light' })), 'light');
	assert.equal(readResolvedTheme(storageStub({ [STARLIGHT_THEME_KEY]: 'dark' })), 'dark');
});

test('values left by the retired auto preference resolve to the legacy theme', () => {
	assert.equal(
		readResolvedTheme(storageStub({ [THEME_PREFERENCE_KEY]: 'auto', [STARLIGHT_THEME_KEY]: 'dark' })),
		'dark',
	);
	assert.equal(readResolvedTheme(storageStub({ [THEME_PREFERENCE_KEY]: 'auto' })), 'light');
});

test('otherTheme flips between the two canvases', () => {
	assert.equal(otherTheme('light'), 'dark');
	assert.equal(otherTheme('dark'), 'light');
});

test('writes persist the theme under both storage keys', () => {
	const storage = storageStub();
	writeResolvedTheme(storage, 'dark');

	assert.equal(storage.value(THEME_PREFERENCE_KEY), 'dark');
	assert.equal(storage.value(STARLIGHT_THEME_KEY), 'dark');
});

test('applyResolvedTheme sets the theme dataset and color scheme on root', () => {
	const root = rootStub();
	applyResolvedTheme(root, 'dark');

	assert.equal(root.dataset.theme, 'dark');
	assert.equal(root.style.colorScheme, 'dark');
});
