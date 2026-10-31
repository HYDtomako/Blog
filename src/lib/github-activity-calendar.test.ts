import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { en } from '../i18n/en.ts';
import { zhCN } from '../i18n/zh-CN.ts';
import {
	buildContributionCalendar,
	formatActivityDate,
	formatActivityMonth,
	odometerColumns,
	placeContributionTooltip,
	spotlightOffset,
	stepContributionCell,
	type Box,
} from './github-activity-calendar.ts';
import type { GitHubActivityDay } from './github-activity.ts';

function day(date: string, count = 0, level = 0): GitHubActivityDay {
	return { date, count, level };
}

function addDays(date: string, amount: number): string {
	const next = new Date(`${date}T00:00:00Z`);
	next.setUTCDate(next.getUTCDate() + amount);
	return next.toISOString().slice(0, 10);
}

function range(start: string, length: number): GitHubActivityDay[] {
	return Array.from({ length }, (_, index) => day(addDays(start, index), index === 3 ? 2 : 0, index === 3 ? 1 : 0));
}

test('calendar pads a Sunday-start week and leaves the first month unlabeled', () => {
	assert.equal(new Date('2025-10-26T00:00:00Z').getUTCDay(), 0);
	const calendar = buildContributionCalendar(range('2025-10-26', 14), 'en');
	assert.equal(calendar.weekCount, 2);
	assert.equal(calendar.cells.length, 14);
	assert.deepEqual(calendar.monthLabels, ['', 'nov']);
	assert.equal(calendar.cells[0]?.date, '2025-10-26');
	assert.equal(calendar.cells[7]?.date, '2025-11-02');
});

test('calendar uses the site locale for month labels and pads a partial week', () => {
	assert.equal(new Date('2024-01-03T00:00:00Z').getUTCDay(), 3);
	const partial = buildContributionCalendar(range('2024-01-03', 1), 'zh-CN');
	assert.equal(partial.weekCount, 1);
	assert.equal(partial.cells.length, 7);
	assert.equal(partial.cells[0], null);
	assert.equal(partial.cells[3]?.date, '2024-01-03');
	assert.equal(partial.cells[6], null);
	assert.equal(partial.monthLabels[0], '');

	assert.equal(new Date('2024-01-28T00:00:00Z').getUTCDay(), 0);
	const crossed = buildContributionCalendar(range('2024-01-28', 10), 'zh-CN');
	assert.equal(crossed.monthLabels[0], '');
	assert.equal(crossed.monthLabels[1], '2月');
	assert.equal(formatActivityMonth('2025-11-02', 'en'), 'nov');
	assert.equal(formatActivityMonth('2025-11-02', 'zh-CN'), '11月');
});

test('checked-in contribution snapshot still lays out as a year of weeks', async () => {
	const raw = JSON.parse(await readFile(new URL('../../content/github-activity.json', import.meta.url), 'utf8')) as {
		days: GitHubActivityDay[];
	};
	const calendar = buildContributionCalendar(raw.days, 'zh-CN');
	assert.equal(calendar.cells.length, calendar.weekCount * 7);
	assert.ok(calendar.weekCount >= 52);
	assert.equal(calendar.monthLabels.length, calendar.weekCount);
	assert.equal(calendar.monthLabels[0], '');
	assert.equal(calendar.monthLabels.filter(Boolean)[0], '11月');
	assert.equal(calendar.monthLabels.filter(Boolean).at(-1), '10月');
	const rendered = calendar.cells.filter((cell): cell is GitHubActivityDay => cell !== null);
	assert.deepEqual(
		rendered.map((cell) => cell.date),
		raw.days.map((cell) => cell.date),
	);
});

test('dates format in the active locale', () => {
	assert.equal(formatActivityDate('2025-11-18', 'en'), 'Nov 18, 2025');
	assert.equal(formatActivityDate('2025-11-18', 'zh-CN'), '2025年11月18日');
});

test('footer and tooltip copy stays off the GitHub green legend wording', () => {
	assert.equal(zhCN.projects.activityTotal(144), '144 次贡献');
	assert.equal(zhCN.projects.activityNoun(1), '次贡献');
	assert.equal(zhCN.projects.activityDayAria('2025年11月18日', 14), '2025年11月18日，14 次贡献');
	assert.equal(zhCN.projects.activitySynced('2026-10-30'), '数据同步于 2026-10-30');
	assert.equal(en.projects.activityTotal(1), '1 contribution');
	assert.equal(en.projects.activityTotal(2560), '2,560 contributions');
	assert.equal(en.projects.activityNoun(1), 'contribution');
	assert.equal(en.projects.activityNoun(23), 'contributions');
	assert.equal(en.projects.activityDayAria('Nov 18, 2025', 23), 'Nov 18, 2025, 23 contributions');
});

test('odometer hides leading zeros and staggers the visible digits', () => {
	assert.deepEqual(odometerColumns(23, 4), [
		{ hidden: true, digit: 0, delayMs: 0 },
		{ hidden: true, digit: 0, delayMs: 0 },
		{ hidden: false, digit: 2, delayMs: 0 },
		{ hidden: false, digit: 3, delayMs: 70 },
	]);
	assert.deepEqual(
		odometerColumns(0, 4).filter((column) => !column.hidden),
		[{ hidden: false, digit: 0, delayMs: 0 }],
	);
	assert.equal(odometerColumns(7, 4, { staggerMs: 0 }).at(-1)?.delayMs, 0);
});

test('tooltip prefers above the cell and flips below when the top would clip', () => {
	const figure: Box = { left: 100, top: 80, width: 800, height: 280, right: 900, bottom: 360 };
	const card: Box = { left: 100, top: 80, width: 800, height: 240, right: 900, bottom: 320 };
	const tooltip = { width: 140, height: 36 };
	const lowCell: Box = { left: 400, top: 180, width: 12, height: 12, right: 412, bottom: 192 };
	const above = placeContributionTooltip({ cell: lowCell, figure, card, tooltip });
	assert.equal(above.position, 'above');
	assert.match(above.transform, /translate\(306px, 90px\) translate\(-50%, -100%\)/);

	const highCell: Box = { left: 120, top: 90, width: 12, height: 12, right: 132, bottom: 102 };
	const below = placeContributionTooltip({ cell: highCell, figure, card, tooltip });
	assert.equal(below.position, 'below');
	assert.match(below.transform, /translate\(-50%, 0\)/);
});

test('tooltip clamps to the card instead of hanging off a rounded corner', () => {
	const figure: Box = { left: 0, top: 0, width: 320, height: 200, right: 320, bottom: 200 };
	const card: Box = { left: 0, top: 0, width: 320, height: 180, right: 320, bottom: 180 };
	const cell: Box = { left: 2, top: 80, width: 10, height: 10, right: 12, bottom: 90 };
	const placed = placeContributionTooltip({
		cell,
		figure,
		card,
		tooltip: { width: 120, height: 32 },
	});
	const x = Number(placed.transform.match(/translate\(([-\d.]+)px/)?.[1]);
	assert.ok(x >= 16 + 60 + 4);
});

test('arrow keys move by day and week and skip empty pads', () => {
	const interactive = [false, false, true, true, true, true, true, true];
	assert.equal(stepContributionCell(2, 'ArrowDown', interactive), 3);
	assert.equal(stepContributionCell(2, 'ArrowUp', interactive), 2);
	assert.equal(stepContributionCell(2, 'ArrowRight', interactive), 2);
	assert.equal(stepContributionCell(3, 'ArrowLeft', interactive), 3);
	assert.equal(stepContributionCell(4, 'Home', interactive), 2);
	assert.equal(stepContributionCell(4, 'End', interactive), 6);
	assert.equal(stepContributionCell(6, 'ArrowDown', interactive), 6);

	const weeks = Array.from({ length: 14 }, (_, index) => index !== 0);
	assert.equal(stepContributionCell(1, 'ArrowLeft', weeks), 1);
	assert.equal(stepContributionCell(8, 'ArrowLeft', weeks), 1);
	assert.equal(stepContributionCell(1, 'ArrowRight', weeks), 8);
});

test('spotlight offset is the cell center inside the grid', () => {
	assert.deepEqual(
		spotlightOffset(
			{ left: 110, top: 40, width: 10, height: 10, right: 120, bottom: 50 },
			{ left: 100, top: 20, width: 500, height: 80, right: 600, bottom: 100 },
		),
		{ x: 15, y: 25 },
	);
});
