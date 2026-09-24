import assert from 'node:assert/strict';
import test from 'node:test';
import { initThemeControl } from './theme-control.ts';
import { THEME_PREFERENCE_KEY, STARLIGHT_THEME_KEY } from './theme-preference.ts';

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
	} as Storage & { value(key: string): string | undefined };
}

function elementStub<T extends HTMLElement>(tagName: string, dataset: Record<string, string> = {}) {
	const listeners = new Map<string, Array<(event: Event) => void>>();
	const attributes = new Map<string, string>();
	return {
		tagName: tagName.toUpperCase(),
		dataset,
		hidden: false,
		style: {} as CSSStyleDeclaration,
		addEventListener(type: string, listener: EventListener) {
			const callbacks = listeners.get(type) ?? [];
			callbacks.push(listener as (event: Event) => void);
			listeners.set(type, callbacks);
		},
		click() {
			for (const listener of listeners.get('click') ?? []) listener({ target: this } as unknown as Event);
		},
		contains(target: Node) {
			return target === this;
		},
		setAttribute(name: string, value: string) {
			attributes.set(name, value);
		},
		getAttribute(name: string) {
			return attributes.get(name) ?? null;
		},
	} as T & { click(): void; style: CSSStyleDeclaration };
}

const labels = {
	light: '浅色',
	dark: '深色',
	toggleAria: (next: string) => `切换到${next}主题`,
};

test('each click flips straight between the light and dark canvas', () => {
	const root = elementStub<HTMLElement>('html');
	const trigger = elementStub<HTMLButtonElement>('button');
	const storage = storageStub();

	initThemeControl({ documentElement: root, trigger, labels, storage });

	assert.equal(root.dataset.theme, 'light');
	assert.equal(root.style.colorScheme, 'light');
	assert.equal(trigger.getAttribute('aria-label'), '切换到深色主题');
	assert.equal(trigger.getAttribute('title'), '切换到深色主题');

	trigger.click();
	assert.equal(root.dataset.theme, 'dark');
	assert.equal(root.style.colorScheme, 'dark');
	assert.equal(trigger.getAttribute('aria-label'), '切换到浅色主题');
	assert.equal(storage.value(THEME_PREFERENCE_KEY), 'dark');
	assert.equal(storage.value(STARLIGHT_THEME_KEY), 'dark');

	trigger.click();
	assert.equal(root.dataset.theme, 'light');
	assert.equal(trigger.getAttribute('aria-label'), '切换到深色主题');
	assert.equal(storage.value(THEME_PREFERENCE_KEY), 'light');
	assert.equal(storage.value(STARLIGHT_THEME_KEY), 'light');
});

test('a stored dark theme boots dark and offers the light switch', () => {
	const root = elementStub<HTMLElement>('html');
	const trigger = elementStub<HTMLButtonElement>('button');

	initThemeControl({
		documentElement: root,
		trigger,
		labels,
		storage: storageStub({ [THEME_PREFERENCE_KEY]: 'dark' }),
	});

	assert.equal(root.dataset.theme, 'dark');
	assert.equal(trigger.getAttribute('aria-label'), '切换到浅色主题');
});

test('a missing trigger still applies the stored theme', () => {
	const root = elementStub<HTMLElement>('html');

	initThemeControl({ documentElement: root, trigger: null, labels, storage: storageStub() });

	assert.equal(root.dataset.theme, 'light');
});
