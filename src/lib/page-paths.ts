import { getSeriesEntries, seriesNumber, seriesOrder } from './articles';
import { overflowPageRoutes } from './list-pages';
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
