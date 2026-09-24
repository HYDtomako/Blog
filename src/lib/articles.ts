import { getCollection, type CollectionEntry } from 'astro:content';
import { DEFAULT_LOCALE, localizedHref } from './locale';
import { SERIES_IDS, seriesOrderFor, seriesTitle } from './series.mjs';
import { sitePath, withBase } from './paths';

export const ARTICLE_PAGE_SIZE = 10;

/** Series slugs in configured order for a locale. */
export function seriesOrder(locale: string = DEFAULT_LOCALE) {
	return seriesOrderFor(locale);
}

/**
 * Series entries for the instance. With zero configured series the collection is
 * never queried, so Astro does not warn about an empty collection on every call.
 */
export async function getSeriesEntries(): Promise<CollectionEntry<'series'>[]> {
	if (SERIES_IDS.length === 0) return [];
	return getCollection('series');
}

export function seriesNumber(slug?: string, locale: string = DEFAULT_LOCALE) {
	const index = (seriesOrder(locale) as readonly string[]).indexOf(slug as string);
	return index < 0 ? '--' : String(index + 1).padStart(2, '0');
}

export function seriesName(slug?: string, locale: string = DEFAULT_LOCALE) {
	return seriesTitle(slug, locale);
}

export function formatArticleDate(date: Date, withYear = true) {
	const y = date.getUTCFullYear();
	const m = String(date.getUTCMonth() + 1).padStart(2, '0');
	const d = String(date.getUTCDate()).padStart(2, '0');
	return withYear ? `${y}-${m}-${d}` : `${m}-${d}`;
}

export function getArticlePageCount(total: number) {
	return Math.ceil(total / ARTICLE_PAGE_SIZE);
}

export function pageHref(pageNumber: number, locale: string = DEFAULT_LOCALE) {
	return localizedHref(
		locale,
		pageNumber === 1 ? '/writing/' : sitePath(`/writing/page/${pageNumber}`),
	);
}

/** Rough reading time from markdown body length (Chinese + code mixed). */
export function estimateReadingMinutes(bodyLength: number) {
	return Math.max(1, Math.ceil(bodyLength / 400));
}

export function isSameCalendarDay(a: Date, b: Date) {
	return (
		a.getUTCFullYear() === b.getUTCFullYear() &&
		a.getUTCMonth() === b.getUTCMonth() &&
		a.getUTCDate() === b.getUTCDate()
	);
}
