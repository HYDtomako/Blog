import { DEFAULT_LOCALE, localizedHref } from './locale.ts';

/** Writing and notes indexes share one page size. */
export const LIST_PAGE_SIZE = 7;

export type ListCollection = 'writing' | 'notes';

export function assertPageSize(pageSize: number): number {
	if (!Number.isInteger(pageSize) || pageSize < 1) {
		throw new Error(`page size must be a positive integer, received ${pageSize}`);
	}
	return pageSize;
}

/** Newest publication date first. Missing dates are not expected on articles or notes. */
export function compareNewest(a: Date, b: Date): number {
	return b.valueOf() - a.valueOf();
}

export function sortByPubDateDesc<T extends { pubDate: Date }>(items: readonly T[]): T[] {
	return [...items].sort((a, b) => compareNewest(a.pubDate, b.pubDate));
}

/**
 * Short list blurb from fields that already exist on the entry.
 * Description is the human summary; llmSummary is only a fallback.
 */
export function listSummary(entry: { description?: string | null; llmSummary?: string | null }): string {
	const description = normalizeSummary(entry.description);
	if (description) return description;
	return normalizeSummary(entry.llmSummary);
}

function normalizeSummary(value: string | null | undefined): string {
	return (value ?? '').replace(/\s+/g, ' ').trim();
}

export function pageCount(total: number, pageSize: number = LIST_PAGE_SIZE): number {
	const size = assertPageSize(pageSize);
	if (!Number.isFinite(total) || total <= 0) return 0;
	return Math.ceil(total / size);
}

export function slicePage<T>(items: readonly T[], pageNumber: number, pageSize: number = LIST_PAGE_SIZE): T[] {
	const size = assertPageSize(pageSize);
	if (!Number.isInteger(pageNumber) || pageNumber < 1) return [];
	const start = (pageNumber - 1) * size;
	return items.slice(start, start + size);
}

/** Same slug rules as the topic directory, so a tag keeps one stable path. */
export function tagSlug(tag: string, locale: string): string {
	return tag
		.normalize('NFKC')
		.trim()
		.toLocaleLowerCase(locale)
		.replace(/\+/g, '-plus-')
		.replace(/#/g, '-sharp-')
		.replace(/\./g, '-dot-')
		.replace(/[^\p{Letter}\p{Number}]+/gu, '-')
		.replace(/^-+|-+$/g, '');
}

export interface CollectionTag {
	name: string;
	slug: string;
	count: number;
}

type TaggedEntry = { data: { tags?: readonly string[] | null } };

/** Unique tags that actually appear on this collection, in locale name order. */
export function collectionTags(entries: readonly TaggedEntry[], locale: string): CollectionTag[] {
	const tags = new Map<string, CollectionTag>();
	for (const entry of entries) {
		for (const name of entry.data.tags ?? []) {
			const slug = tagSlug(name, locale);
			if (!slug) continue;
			const existing = tags.get(slug);
			if (existing) existing.count += 1;
			else tags.set(slug, { name, slug, count: 1 });
		}
	}
	return [...tags.values()].sort((a, b) => a.name.localeCompare(b.name, locale) || a.slug.localeCompare(b.slug));
}

/** Keeps the incoming order, which is newest-first for articles and notes. */
export function entriesWithTag<T extends TaggedEntry>(entries: readonly T[], slug: string, locale: string): T[] {
	return entries.filter((entry) => (entry.data.tags ?? []).some((tag) => tagSlug(tag, locale) === slug));
}

/** Page 1 lives on the collection index. Later pages use `/<collection>/page/N/`. */
export function collectionPagePath(collection: ListCollection, pageNumber: number): string {
	if (!Number.isInteger(pageNumber) || pageNumber <= 1) return `/${collection}/`;
	return `/${collection}/page/${pageNumber}/`;
}

export function collectionPageHref(
	collection: ListCollection,
	pageNumber: number,
	locale: string = DEFAULT_LOCALE,
): string {
	return localizedHref(locale, collectionPagePath(collection, pageNumber));
}

/** Page 1 of a collection tag filter. Later pages use `/<collection>/tags/<slug>/page/N/`. */
export function collectionTagPath(collection: ListCollection, slug: string, pageNumber = 1): string {
	const base = `/${collection}/tags/${slug}/`;
	if (!Number.isInteger(pageNumber) || pageNumber <= 1) return base;
	return `/${collection}/tags/${slug}/page/${pageNumber}/`;
}

export function collectionTagHref(
	collection: ListCollection,
	slug: string,
	pageNumber = 1,
	locale: string = DEFAULT_LOCALE,
): string {
	return localizedHref(locale, collectionTagPath(collection, slug, pageNumber));
}

export interface PaginationControls {
	visible: boolean;
	showPrevious: boolean;
	showNext: boolean;
	pages: number[];
}

/**
 * Controls to render. A single page (including a collection of 7 or fewer at the
 * default size) is `visible: false`, so no inert previous/next control is drawn.
 */
export function paginationControls(pageNumber: number, pageCountValue: number): PaginationControls {
	const count = Number.isInteger(pageCountValue) && pageCountValue > 0 ? pageCountValue : 0;
	const current = Number.isInteger(pageNumber) ? pageNumber : 0;
	const visible = count > 1 && current >= 1 && current <= count;
	return {
		visible,
		showPrevious: visible && current > 1,
		showNext: visible && current < count,
		pages: visible ? Array.from({ length: count }, (_, index) => index + 1) : [],
	};
}

export interface ListPageWindow<T> {
	page: string;
	pageNumber: number;
	pageCount: number;
	total: number;
	items: T[];
}

/** Static routes for pages 2…n. Empty when everything fits on the index. */
export function overflowPageRoutes<T>(items: readonly T[], pageSize: number = LIST_PAGE_SIZE): ListPageWindow<T>[] {
	const count = pageCount(items.length, pageSize);
	return Array.from({ length: Math.max(0, count - 1) }, (_, index) => {
		const pageNumber = index + 2;
		return {
			page: String(pageNumber),
			pageNumber,
			pageCount: count,
			total: items.length,
			items: slicePage(items, pageNumber, pageSize),
		};
	});
}
