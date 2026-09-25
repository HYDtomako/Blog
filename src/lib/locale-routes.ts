import { getCollection } from 'astro:content';
import { ARTICLE_PAGE_SIZE } from './articles';
import { DEFAULT_LOCALE, localePath, stripLocalePrefix } from './locale';
import { entryLocale, topicSlug } from './public-data';
import { SERIES_ORDER_BY_LOCALE } from './series.mjs';

/** Page paths that exist in every locale (mirrored hub pages). */
const HUB_PATHS = ['/', '/writing/', '/notes/', '/projects/', '/about/', '/ask/', '/answers/', '/topics/'];

const pathCache = new Map<string, Promise<Set<string>>>();

/** Entry ids carry the locale prefix; switch targets are compared as logical paths. */
function logicalPath(id: string) {
	return stripLocalePrefix(`/${id}`);
}

async function computeLocalePaths(locale: string): Promise<Set<string>> {
	const paths = new Set(HUB_PATHS);
	const docs = await getCollection('docs');
	const own = docs.filter((entry) => entryLocale(entry.id) === locale);

	for (const entry of own) paths.add(`${logicalPath(entry.id)}/`);

	const articles = own.filter((entry) => entry.data.contentType === 'article');
	for (const article of articles) {
		for (const tag of article.data.tags) paths.add(`/topics/${topicSlug(tag, locale)}/`);
	}
	for (let page = 2; page <= Math.ceil(articles.length / ARTICLE_PAGE_SIZE); page += 1) {
		paths.add(`/writing/page/${page}/`);
	}
	for (const series of SERIES_ORDER_BY_LOCALE[locale] ?? []) paths.add(`/writing/${series}/`);

	if (locale !== DEFAULT_LOCALE) {
		// Starlight renders untranslated default-locale docs as fallback routes in other locales.
		for (const entry of docs.filter((doc) => entryLocale(doc.id) === DEFAULT_LOCALE)) {
			paths.add(`${logicalPath(entry.id)}/`);
		}
	}

	return paths;
}

/** Logical paths (no deploy base, no locale prefix) that this locale publishes. */
export function localePaths(locale: string): Promise<Set<string>> {
	let cached = pathCache.get(locale);
	if (!cached) {
		cached = computeLocalePaths(locale);
		pathCache.set(locale, cached);
	}
	return cached;
}

/**
 * Counterpart logical path for the current request in `targetLocale`, falling back
 * to that locale's home page when no counterpart exists (the header switch link
 * must never point at a missing page).
 */
export async function localeSwitchPath(pathname: string, targetLocale: string): Promise<string> {
	const logical = stripLocalePrefix(pathname);
	const normalized = logical.endsWith('/') ? logical : `${logical}/`;
	const paths = await localePaths(targetLocale);
	const counterpart = paths.has(normalized) ? normalized.replace(/\/$/, '') : '';
	return counterpart ? `${localePath(targetLocale, counterpart)}/` : localePath(targetLocale, '/');
}
