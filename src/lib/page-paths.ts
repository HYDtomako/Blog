import { getSeriesEntries, seriesNumber, seriesOrder } from './articles';
import {
	collectionTags,
	entriesWithTag,
	overflowPageRoutes,
	pageCount,
	slicePage,
	type ListCollection,
} from './list-pages';
import { DEFAULT_LOCALE } from './locale';
import { getAnswers, getArticles, getNotes, getTopics } from './public-data';

/** Archive pages 2…n of a locale's article feed. */
export async function articlePagePaths(locale: string = DEFAULT_LOCALE) {
	const articles = await getArticles(locale);
	return overflowPageRoutes(articles).map((page) => ({
		params: { page: page.page },
		props: {
			articles: page.items,
			pageNumber: page.pageNumber,
			pageCount: page.pageCount,
			totalArticles: page.total,
		},
	}));
}

async function collectionEntries(collection: ListCollection, locale: string) {
	return collection === 'writing' ? getArticles(locale) : getNotes(locale);
}

/** Page 1 of each tag that appears in a locale's writing or notes collection. */
export async function collectionTagIndexPaths(collection: ListCollection, locale: string = DEFAULT_LOCALE) {
	const entries = await collectionEntries(collection, locale);
	const tags = collectionTags(entries, locale);
	return tags.map((tag) => {
		const matched = entriesWithTag(entries, tag.slug, locale);
		return {
			params: { tag: tag.slug },
			props: {
				tag,
				tags,
				entries: slicePage(matched, 1),
				pageNumber: 1,
				pageCount: pageCount(matched.length),
				total: matched.length,
			},
		};
	});
}

/** Pages 2…n of a collection tag filter. Empty when the tag has at most one page. */
export async function collectionTagOverflowPaths(collection: ListCollection, locale: string = DEFAULT_LOCALE) {
	const entries = await collectionEntries(collection, locale);
	const tags = collectionTags(entries, locale);
	return tags.flatMap((tag) => {
		const matched = entriesWithTag(entries, tag.slug, locale);
		return overflowPageRoutes(matched).map((page) => ({
			params: { tag: tag.slug, page: page.page },
			props: {
				tag,
				tags: tags,
				entries: page.items,
				pageNumber: page.pageNumber,
				pageCount: page.pageCount,
				total: page.total,
			},
		}));
	});
}

/** Archive pages 2…n of a locale's notes feed. */
export async function notePagePaths(locale: string = DEFAULT_LOCALE) {
	const notes = await getNotes(locale);
	return overflowPageRoutes(notes).map((page) => ({
		params: { page: page.page },
		props: {
			notes: page.items,
			pageNumber: page.pageNumber,
			pageCount: page.pageCount,
			totalNotes: page.total,
		},
	}));
}

/**
 * One path per series registered for the locale (`series/<locale>/series.json`).
 * Collection ids keep the locale folder verbatim (`zh-CN/notes`): the series loader
 * overrides `generateId` in `src/content.config.ts` so this lookup matches.
 */
export async function seriesPaths(locale: string = DEFAULT_LOCALE) {
	const allSeries = await getSeriesEntries();
	return seriesOrder(locale).map((slug: string) => {
		const entry = allSeries.find((series) => series.id === `${locale}/${slug}`);
		if (!entry) throw new Error(`缺少专栏配置：${locale}/${slug}`);
		return {
			params: { series: slug },
			props: { seriesData: entry.data, no: seriesNumber(slug, locale) },
		};
	});
}

/** One path per topic collected from the locale's articles. */
export async function topicPaths(locale: string = DEFAULT_LOCALE) {
	return (await getTopics(locale)).map((topic) => ({
		params: { tag: topic.slug },
		props: { topic },
	}));
}

/** One path per published answer of the locale. */
export async function answerPaths(locale: string = DEFAULT_LOCALE) {
	return (await getAnswers(locale)).map((entry) => ({
		params: { slug: entry.data.slug },
		props: { entry },
	}));
}
