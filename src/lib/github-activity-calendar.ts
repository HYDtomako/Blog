import type { GitHubActivityDay } from './github-activity';

export interface ContributionCalendar {
	/** Column-major cells: each week is seven entries, Sunday through Saturday. */
	cells: Array<GitHubActivityDay | null>;
	weekCount: number;
	/** One label per week column. The first week stays blank, matching a nov→oct axis. */
	monthLabels: string[];
}

export interface Box {
	left: number;
	top: number;
	width: number;
	height: number;
	right: number;
	bottom: number;
}

export interface TooltipPlacement {
	position: 'above' | 'below';
	transform: string;
}

export interface OdometerColumn {
	hidden: boolean;
	digit: number;
	delayMs: number;
}

const WEEKDAYS = 7;

/** BCP-47 tag for stable month and date strings. Site locales collapse to en-US or zh-CN. */
export function activityIntlLocale(locale: string): string {
	const value = locale.trim().toLowerCase();
	if (value === 'zh' || value.startsWith('zh-')) return 'zh-CN';
	return 'en-US';
}

export function formatActivityMonth(date: string, locale: string): string {
	const formatted = new Intl.DateTimeFormat(activityIntlLocale(locale), {
		month: 'short',
		timeZone: 'UTC',
	}).format(utcDate(date));
	return /[A-Za-z]/.test(formatted) ? formatted.toLowerCase() : formatted;
}

export function formatActivityDate(date: string, locale: string): string {
	return new Intl.DateTimeFormat(activityIntlLocale(locale), {
		dateStyle: 'medium',
		timeZone: 'UTC',
	}).format(utcDate(date));
}

/**
 * Lay the contribution snapshot out as a Sunday-start week grid.
 * Leading and trailing days outside the snapshot are empty pads, not days.
 */
export function buildContributionCalendar(
	days: GitHubActivityDay[],
	locale: string,
): ContributionCalendar {
	if (days.length === 0) return { cells: [], weekCount: 0, monthLabels: [] };

	const lead = utcDate(days[0].date).getUTCDay();
	const cells: Array<GitHubActivityDay | null> = [
		...Array.from({ length: lead }, () => null),
		...days,
	];
	const remainder = cells.length % WEEKDAYS;
	if (remainder !== 0) {
		cells.push(...Array.from({ length: WEEKDAYS - remainder }, () => null));
	}

	const weekCount = cells.length / WEEKDAYS;
	const monthLabels: string[] = [];
	let previousMonth = -1;
	for (let week = 0; week < weekCount; week += 1) {
		const firstDay = cells.slice(week * WEEKDAYS, week * WEEKDAYS + WEEKDAYS).find((cell) => cell);
		if (!firstDay || week === 0) {
			monthLabels.push('');
			if (firstDay) previousMonth = utcDate(firstDay.date).getUTCMonth();
			continue;
		}
		const month = utcDate(firstDay.date).getUTCMonth();
		if (month === previousMonth) {
			monthLabels.push('');
			continue;
		}
		monthLabels.push(formatActivityMonth(firstDay.date, locale));
		previousMonth = month;
	}

	return { cells, weekCount, monthLabels };
}

/** Where the keyboard spotlight should sit, relative to the grid box. */
export function spotlightOffset(cell: Box, container: Box): { x: number; y: number } {
	return {
		x: cell.left + cell.width / 2 - container.left,
		y: cell.top + cell.height / 2 - container.top,
	};
}

/**
 * Anchor the tooltip on a cell, preferring above it.
 * Horizontal position stays inside the card's straight edges so the box
 * does not sit on a rounded corner. It flips below when the top would clip.
 */
export function placeContributionTooltip(input: {
	cell: Box;
	figure: Box;
	card: Box;
	tooltip: { width: number; height: number };
	cornerInset?: number;
	gap?: number;
	safeMargin?: number;
}): TooltipPlacement {
	const cornerInset = input.cornerInset ?? 16;
	const gap = input.gap ?? 10;
	const safeMargin = input.safeMargin ?? 4;
	const { cell, figure, card, tooltip } = input;
	const halfW = tooltip.width / 2;

	const cardLeft = card.left - figure.left;
	const cardRight = card.right - figure.left;
	const minX = cardLeft + cornerInset + halfW + safeMargin;
	const maxX = cardRight - cornerInset - halfW - safeMargin;
	const desiredX = cell.left + cell.width / 2 - figure.left;
	const x = minX <= maxX ? clamp(desiredX, minX, maxX) : desiredX;

	const cardTop = card.top - figure.top;
	const cellTop = cell.top - figure.top;
	const cellBottom = cell.bottom - figure.top;
	const aboveTop = cellTop - tooltip.height - gap;
	const placeBelow = aboveTop < cardTop + cornerInset;

	if (placeBelow) {
		return {
			position: 'below',
			transform: `translate(${x}px, ${cellBottom + gap}px) translate(-50%, 0)`,
		};
	}
	return {
		position: 'above',
		transform: `translate(${x}px, ${cellTop - gap}px) translate(-50%, -100%)`,
	};
}

/** Rolling-digit columns. Leading zeros collapse unless `padToFull` is set. */
export function odometerColumns(
	value: number,
	digits: number,
	options: { padToFull?: boolean; staggerMs?: number } = {},
): OdometerColumn[] {
	const width = Math.max(1, Math.floor(digits));
	const safe = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
	const text = String(safe).padStart(width, '0').slice(-width);
	const meaningful = options.padToFull ? width : Math.max(1, String(safe).length);
	const stagger = options.staggerMs ?? 70;
	return Array.from({ length: width }, (_, index) => {
		const hidden = index < width - meaningful;
		const order = index - (width - meaningful);
		return {
			hidden,
			digit: Number(text[index]),
			delayMs: order >= 0 ? order * stagger : 0,
		};
	});
}

/**
 * Move a roving day-focus through the column-major grid.
 * Left and right change week; up and down stay inside the week.
 * Returns the same index when the move would leave the grid or land on a pad.
 */
export function stepContributionCell(
	index: number,
	key: string,
	interactive: readonly boolean[],
): number {
	const count = interactive.length;
	if (count === 0 || index < 0 || index >= count) return index;

	if (key === 'Home') return nearestInteractive(index - (index % WEEKDAYS), 1, interactive, index);
	if (key === 'End') {
		const end = Math.min(index - (index % WEEKDAYS) + WEEKDAYS - 1, count - 1);
		return nearestInteractive(end, -1, interactive, index);
	}

	const delta =
		key === 'ArrowRight' ? WEEKDAYS : key === 'ArrowLeft' ? -WEEKDAYS : key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0;
	if (delta === 0) return index;
	if (key === 'ArrowDown' && index % WEEKDAYS === WEEKDAYS - 1) return index;
	if (key === 'ArrowUp' && index % WEEKDAYS === 0) return index;

	if (key === 'ArrowUp' || key === 'ArrowDown') {
		const next = index + delta;
		return next >= 0 && next < count && interactive[next] ? next : index;
	}

	let next = index + delta;
	while (next >= 0 && next < count) {
		if (interactive[next]) return next;
		next += delta;
	}
	return index;
}

function nearestInteractive(
	start: number,
	step: 1 | -1,
	interactive: readonly boolean[],
	fallback: number,
): number {
	for (let index = start; index >= 0 && index < interactive.length; index += step) {
		if (interactive[index]) return index;
	}
	return fallback;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function utcDate(date: string): Date {
	return new Date(`${date}T00:00:00Z`);
}
