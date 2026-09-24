import {
	applyResolvedTheme,
	otherTheme,
	readResolvedTheme,
	writeResolvedTheme,
	type ResolvedTheme,
} from './theme-preference.ts';

export type ThemeControlLabels = {
	light: string;
	dark: string;
	toggleAria: (nextLabel: string) => string;
};

interface ThemeControlOptions {
	documentElement: HTMLElement;
	trigger: HTMLElement | null;
	labels: ThemeControlLabels;
	storage?: Storage | null;
}

function labelFor(theme: ResolvedTheme, labels: ThemeControlLabels) {
	return theme === 'dark' ? labels.dark : labels.light;
}

/** Wires the header button so one click flips between the light and dark canvases. */
export function initThemeControl({
	documentElement,
	trigger,
	labels,
	storage = globalThis.localStorage,
}: ThemeControlOptions) {
	const updateTrigger = (theme: ResolvedTheme) => {
		if (!trigger) return;
		const next = labels.toggleAria(labelFor(otherTheme(theme), labels));
		trigger.setAttribute('aria-label', next);
		trigger.setAttribute('title', next);
	};

	let theme = readResolvedTheme(storage);
	applyResolvedTheme(documentElement, theme);
	updateTrigger(theme);

	trigger?.addEventListener('click', () => {
		theme = otherTheme(theme);
		applyResolvedTheme(documentElement, theme);
		writeResolvedTheme(storage, theme);
		updateTrigger(theme);
	});
}
