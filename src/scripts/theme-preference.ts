export type ResolvedTheme = 'light' | 'dark';

export const THEME_PREFERENCE_KEY = 'refined-x-theme-preference';
export const STARLIGHT_THEME_KEY = 'starlight-theme';

interface StorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

function isResolvedTheme(value: string | null): value is ResolvedTheme {
	return value === 'light' || value === 'dark';
}

function safeGet(storage: StorageLike | null | undefined, key: string): string | null {
	try {
		return storage?.getItem(key) ?? null;
	} catch {
		return null;
	}
}

function safeSet(storage: StorageLike | null | undefined, key: string, value: string): void {
	try {
		storage?.setItem(key, value);
	} catch {
		// Storage can be disabled; the current page should still receive a theme.
	}
}

/**
 * The site ships the light canvas as its default. Values written by the retired
 * `auto` preference (and the legacy Starlight key) still resolve to a real theme.
 */
export function readResolvedTheme(storage: StorageLike | null | undefined): ResolvedTheme {
	const stored = safeGet(storage, THEME_PREFERENCE_KEY);
	if (isResolvedTheme(stored)) return stored;
	const legacy = safeGet(storage, STARLIGHT_THEME_KEY);
	return isResolvedTheme(legacy) ? legacy : 'light';
}

export function writeResolvedTheme(storage: StorageLike | null | undefined, theme: ResolvedTheme): void {
	safeSet(storage, THEME_PREFERENCE_KEY, theme);
	safeSet(storage, STARLIGHT_THEME_KEY, theme);
}

export function otherTheme(theme: ResolvedTheme): ResolvedTheme {
	return theme === 'dark' ? 'light' : 'dark';
}

export function applyResolvedTheme(documentElement: HTMLElement, theme: ResolvedTheme): void {
	documentElement.dataset.theme = theme;
	documentElement.style.colorScheme = theme;
}
