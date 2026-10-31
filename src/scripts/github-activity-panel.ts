import {
	odometerColumns,
	placeContributionTooltip,
	spotlightOffset,
	stepContributionCell,
	type Box,
} from '../lib/github-activity-calendar';

/**
 * Hover, focus, and arrow-key details for the projects contribution card.
 * The grid itself is server-rendered from `content/github-activity.json`.
 */
export function initGitHubActivity(doc: Document = document, win: Window = window): void {
	const root = doc.querySelector<HTMLElement>('[data-gh-activity]');
	if (!root || root.dataset.ghReady === 'true') return;

	const grid = root.querySelector<HTMLElement>('[data-gh-cells]');
	const base = root.querySelector<HTMLElement>('[data-gh-base]');
	const card = root.querySelector<HTMLElement>('[data-gh-card]');
	const tooltip = root.querySelector<HTMLElement>('[data-gh-tooltip]');
	const odometer = root.querySelector<HTMLElement>('[data-gh-odo]');
	const noun = root.querySelector<HTMLElement>('[data-gh-noun]');
	const dateLabel = root.querySelector<HTMLElement>('[data-gh-date]');
	if (!grid || !base || !card || !tooltip || !odometer || !noun || !dateLabel) return;

	const columns = [...odometer.querySelectorAll<HTMLElement>('[data-gh-odo-col]')];
	const reels = columns.map((column) => column.querySelector<HTMLElement>('[data-gh-odo-reel]'));
	if (columns.length === 0 || reels.some((reel) => !reel)) return;
	const digitReels = reels as HTMLElement[];
	root.dataset.ghReady = 'true';
	const reducedMotion = prefersReducedMotion(win);
	const cells = [...base.querySelectorAll<HTMLElement>('.gh-cell')];
	const interactive = cells.map((cell) => cell.dataset.date !== undefined);
	let active: HTMLElement | null = null;

	const applyCount = (value: number) => {
		const frames = odometerColumns(value, digitReels.length, { staggerMs: reducedMotion ? 0 : 70 });
		frames.forEach((frame, index) => {
			const column = columns[index];
			const reel = digitReels[index];
			column.dataset.hidden = frame.hidden ? 'true' : 'false';
			column.style.flexBasis = frame.hidden ? '0px' : '0.62em';
			column.style.opacity = frame.hidden ? '0' : '1';
			reel.style.transitionDelay = `${frame.delayMs}ms`;
			reel.style.transform = `translateY(-${frame.digit}em)`;
		});
	};

	const hideTooltip = () => {
		tooltip.dataset.visible = 'false';
		if (active) active.removeAttribute('data-active');
		active = null;
	};

	const showTooltip = (cell: HTMLElement) => {
		if (active !== cell) {
			if (active) active.removeAttribute('data-active');
			active = cell;
			cell.dataset.active = 'true';
			applyCount(Number(cell.dataset.count ?? '0'));
			noun.textContent = cell.dataset.noun ?? '';
			dateLabel.textContent = cell.dataset.dateLabel ?? '';
		}

		const placement = placeContributionTooltip({
			cell: toBox(cell.getBoundingClientRect()),
			figure: toBox(root.getBoundingClientRect()),
			card: toBox(card.getBoundingClientRect()),
			tooltip: sizeOf(tooltip),
		});
		tooltip.dataset.position = placement.position;
		tooltip.style.transform = placement.transform;
		tooltip.dataset.visible = 'true';
	};

	const focusCell = (cell: HTMLElement) => {
		for (const entry of cells) entry.tabIndex = entry === cell ? 0 : -1;
		if (doc.activeElement !== cell) cell.focus();
		const spot = spotlightOffset(toBox(cell.getBoundingClientRect()), toBox(grid.getBoundingClientRect()));
		grid.style.setProperty('--mx', `${spot.x}px`);
		grid.style.setProperty('--my', `${spot.y}px`);
		showTooltip(cell);
	};

	grid.addEventListener('pointermove', (event) => {
		const point = event as PointerEvent;
		const rect = grid.getBoundingClientRect();
		grid.style.setProperty('--mx', `${point.clientX - rect.left}px`);
		grid.style.setProperty('--my', `${point.clientY - rect.top}px`);
		const cell = cellFromEvent(point);
		if (cell) showTooltip(cell);
		else if (!grid.contains(doc.activeElement)) hideTooltip();
	});

	grid.addEventListener('pointerdown', (event) => {
		const cell = cellFromEvent(event as PointerEvent);
		if (cell) showTooltip(cell);
	});

	grid.addEventListener('pointerleave', () => {
		const focused = doc.activeElement;
		if (focused instanceof HTMLElement && focused.dataset.date && grid.contains(focused)) {
			const spot = spotlightOffset(
				toBox(focused.getBoundingClientRect()),
				toBox(grid.getBoundingClientRect()),
			);
			grid.style.setProperty('--mx', `${spot.x}px`);
			grid.style.setProperty('--my', `${spot.y}px`);
			showTooltip(focused);
			return;
		}
		grid.style.setProperty('--mx', '-200px');
		grid.style.setProperty('--my', '-200px');
		hideTooltip();
	});

	base.addEventListener('focusin', (event) => {
		const cell = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('.gh-cell[data-date]') : null;
		if (!cell || !base.contains(cell)) return;
		focusCell(cell);
	});

	base.addEventListener('focusout', (event) => {
		const next = (event as FocusEvent).relatedTarget;
		if (next instanceof Node && base.contains(next)) return;
		hideTooltip();
	});

	base.addEventListener('keydown', (event) => {
		const keyEvent = event as KeyboardEvent;
		if (keyEvent.key === 'Escape') {
			hideTooltip();
			return;
		}
		const current = doc.activeElement;
		if (!(current instanceof HTMLElement) || current.dataset.index === undefined) return;
		const nextIndex = stepContributionCell(Number(current.dataset.index), keyEvent.key, interactive);
		if (nextIndex === Number(current.dataset.index)) return;
		const next = cells[nextIndex];
		if (!next) return;
		keyEvent.preventDefault();
		focusCell(next);
	});

	root.querySelector<HTMLImageElement>('[data-gh-avatar]')?.addEventListener('error', () => {
		const image = root.querySelector<HTMLImageElement>('[data-gh-avatar]');
		const fallback = root.querySelector<HTMLElement>('[data-gh-avatar-fallback]');
		if (image) image.hidden = true;
		if (fallback) fallback.dataset.shown = 'true';
	});
}

function cellFromEvent(event: Event): HTMLElement | null {
	if (!(event.target instanceof Element)) return null;
	return event.target.closest<HTMLElement>('.gh-layer-base .gh-cell[data-date]');
}

function prefersReducedMotion(win: Window): boolean {
	try {
		return win.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
	} catch {
		return false;
	}
}

function toBox(rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height' | 'right' | 'bottom'>): Box {
	return {
		left: rect.left,
		top: rect.top,
		width: rect.width,
		height: rect.height,
		right: rect.right,
		bottom: rect.bottom,
	};
}

function sizeOf(element: HTMLElement): { width: number; height: number } {
	const rect = element.getBoundingClientRect();
	return { width: rect.width, height: rect.height };
}
