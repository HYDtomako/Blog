import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { absoluteUrlFromSite, astroBaseFromSite } from '../src/lib/paths.ts';

function walkMarkdown(directory) {
	return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const target = path.join(directory, entry.name);
		return entry.isDirectory() ? walkMarkdown(target) : entry.name.endsWith('.md') ? [target] : [];
	});
}

function frontmatter(file) {
	const source = fs.readFileSync(file, 'utf8');
	const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
	if (!match) throw new Error(`缺少 YAML frontmatter：${file}`);
	return YAML.parse(match[1]);
}

function topicSlug(tag, locale) {
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

function pageUrl(site, pathname) {
	return absoluteUrlFromSite(site, pathname.endsWith('/') ? pathname : `${pathname}/`);
}

/** Request pathname without the deploy base, so sitemap lookups match built paths. */
function sitePathname(site, pathname) {
	const base = astroBaseFromSite(site);
	if (base === '/') return pathname;
	if (pathname === base || pathname === `${base}/`) return '/';
	return pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : pathname;
}

export function createSeoSitemapOptions({ contentRoot, site, locales }) {
	const localeList = locales?.list ?? [locales?.default ?? 'zh-CN'];
	const defaultLocale = locales?.default ?? localeList[0];
	const localePrefix = (locale) => (locale === defaultLocale ? '' : `/${locale}`);

	const tagCounts = new Map();
	const lastModified = new Map();
	let latest;

	for (const locale of localeList) {
		const articlesDir = path.join(contentRoot, 'articles', locale);
		if (!fs.existsSync(articlesDir)) continue;
		const prefix = localePrefix(locale);
		const seriesDates = new Map();

		for (const article of walkMarkdown(articlesDir).map(frontmatter)) {
			const dateMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(article.pubDate));
			if (!dateMatch) throw new Error(`文章缺少有效 pubDate：${article.slug}`);
			const articleDate = new Date(article.updatedDate ?? article.pubDate);
			const articlePath = `${prefix}/${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}/${article.slug}/`;
			lastModified.set(pageUrl(site, articlePath), articleDate);
			if (!latest || articleDate > latest) latest = articleDate;
			if (article.series) {
				const previousSeriesDate = seriesDates.get(article.series);
				if (!previousSeriesDate || articleDate > previousSeriesDate) {
					seriesDates.set(article.series, articleDate);
				}
			}
			for (const tag of article.tags ?? []) {
				const key = `${prefix}/topics/${topicSlug(tag, locale)}/`;
				const current = tagCounts.get(key) ?? { count: 0, latest: articleDate };
				current.count += 1;
				if (articleDate > current.latest) current.latest = articleDate;
				tagCounts.set(key, current);
			}
		}

		for (const [series, date] of seriesDates) {
			lastModified.set(pageUrl(site, `${prefix}/writing/${series}/`), date);
		}
		for (const route of ['/', '/writing/', '/topics/']) {
			lastModified.set(pageUrl(site, `${prefix}${route}`), latest);
		}
	}

	for (const [topicPath, data] of tagCounts) lastModified.set(pageUrl(site, topicPath), data.latest);

	return {
		filter(page) {
			const url = new URL(page);
			const pathname = sitePathname(site, url.pathname);
			if (/^(\/[^/]+)?\/404\/?$/.test(pathname)) return false;
			const topic = /^(\/[^/]+)?\/topics\/([^/]+)\/$/.exec(pathname);
			if (topic) {
				const prefix = topic[1] ?? '';
				const slug = decodeURIComponent(topic[2]);
				if ((tagCounts.get(`${prefix}/topics/${slug}/`)?.count ?? 0) < 3) return false;
			}
			return true;
		},
		serialize(item) {
			const url = item.url.endsWith('/') ? item.url : `${item.url}/`;
			const lastmod = lastModified.get(url);
			return { url, ...(lastmod ? { lastmod } : {}) };
		},
	};
}
