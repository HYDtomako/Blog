import { HERO_THEME_CROSSFADE_READY_DATASET_KEY } from './hero-theme-bg.ts';
import {
	applyResolvedTheme,
	otherTheme,
	readResolvedTheme,
	writeResolvedTheme,
	type ResolvedTheme,
} from './theme-preference.ts';
import { circleRevealClipPaths, maxRevealRadius, revealOrigin } from './theme-transition.ts';

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

	const commit = (next: ResolvedTheme) => {
		theme = next;
		applyResolvedTheme(documentElement, theme);
		writeResolvedTheme(storage, theme);
		updateTrigger(theme);
	};

	if (!trigger) return;

	trigger.addEventListener('click', () => {
		const next = otherTheme(theme);
		if (!revealFromToggle(documentElement, trigger, () => commit(next))) commit(next);
	});
}

const THEME_REVEAL_MS = 400;

type ThemeViewDocument = Document & {
	startViewTransition?: (update: () => void) => {
		ready?: Promise<void>;
		finished?: Promise<void>;
	};
};

function motionReduced(): boolean {
	return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Circle clip reveal from the toggle. Theme storage stays the existing
 * light/dark preference; this only paints the change. Returns false when the
 * View Transitions API (or a measurable viewport) is unavailable.
 */
function revealFromToggle(documentElement: HTMLElement, trigger: HTMLElement, apply: () => void): boolean {
	if (motionReduced()) return false;
	const doc = documentElement.ownerDocument as ThemeViewDocument | null;
	const start = doc?.startViewTransition;
	const view = doc?.defaultView;
	if (!doc || typeof start !== 'function' || !view) return false;
	const viewportWidth = view.innerWidth;
	const viewportHeight = view.innerHeight;
	if (!viewportWidth || !viewportHeight) return false;

	const rect = typeof trigger.getBoundingClientRect === 'function' ? trigger.getBoundingClientRect() : null;
	const origin = rect
		? revealOrigin(rect, viewportWidth, viewportHeight)
		: revealOrigin({ left: 0, top: 0, width: viewportWidth, height: viewportHeight }, viewportWidth, viewportHeight, true);
	const clip = circleRevealClipPaths(
		origin.x,
		origin.y,
		maxRevealRadius(origin.x, origin.y, viewportWidth, viewportHeight),
		viewportWidth,
		viewportHeight,
	);

	const heroReady = documentElement.dataset[HERO_THEME_CROSSFADE_READY_DATASET_KEY];
	documentElement.dataset.magicuiThemeVt = 'active';
	documentElement.style.setProperty('--magicui-theme-vt-clip-from', clip[0]);
	documentElement.style.setProperty('--magicui-theme-toggle-vt-duration', `${THEME_REVEAL_MS}ms`);

	let settled = false;
	const cleanup = () => {
		if (settled) return;
		settled = true;
		delete documentElement.dataset.magicuiThemeVt;
		documentElement.style.removeProperty('--magicui-theme-vt-clip-from');
		documentElement.style.removeProperty('--magicui-theme-toggle-vt-duration');
		if (heroReady) documentElement.dataset[HERO_THEME_CROSSFADE_READY_DATASET_KEY] = heroReady;
	};

	let applied = false;
	let transition: ReturnType<NonNullable<ThemeViewDocument['startViewTransition']>> | undefined;
	try {
		transition = start.call(doc, () => {
			// Drop the hero crossfade for this snapshot so the clip, not a 2s fade, carries the change.
			if (heroReady) delete documentElement.dataset[HERO_THEME_CROSSFADE_READY_DATASET_KEY];
			applied = true;
			apply();
		});
	} catch {
		cleanup();
		return applied;
	}
	if (!transition) {
		cleanup();
		return applied;
	}

	transition.ready
		?.then(() => {
			documentElement.animate?.(
				{ clipPath: [clip[0], clip[1]] },
				{
					duration: THEME_REVEAL_MS,
					easing: 'ease-in-out',
					fill: 'forwards',
					pseudoElement: '::view-transition-new(root)',
				},
			);
		})
		.catch(() => {});

	if (transition.finished && typeof transition.finished.finally === 'function') {
		transition.finished.finally(cleanup).catch(() => {});
	} else {
		cleanup();
	}
	return true;
}
