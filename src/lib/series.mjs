import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { siteConfig } from '../../site.config.mjs';

function findSiteRoot(startDir) {
	let dir = startDir;
	while (true) {
		if (existsSync(path.join(dir, 'astro.config.mjs')) && existsSync(path.join(dir, 'package.json'))) {
			return dir;
		}
		const parent = path.dirname(dir);
		if (parent === dir) {
			throw new Error('无法定位 Astro 站点根目录（缺少 astro.config.mjs）');
		}
		dir = parent;
	}
}

const siteRoot = findSiteRoot(path.dirname(fileURLToPath(import.meta.url)));

/**
 * Series live under `content/series/<locale>/` — one manifest per locale.
 * Zero series is a valid state: a missing directory or an empty `order` means
 * the instance publishes no series pages at all.
 */
function loadSeries(locale) {
	const seriesRoot = path.join(siteConfig.contentRoot, 'series', locale);
	const empty = () => ({ order: [], titles: Object.create(null) });
	if (!existsSync(seriesRoot)) return empty();

	const manifestPath = path.join(seriesRoot, 'series.json');
	if (!existsSync(manifestPath)) return empty();

	const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
	const order = Array.isArray(manifest.order) ? manifest.order.map(String) : [];

	const titles = Object.create(null);
	for (const slug of order) {
		const file = path.join(seriesRoot, `${slug}.yaml`);
		try {
			const data = parseYaml(readFileSync(file, 'utf8')) ?? {};
			titles[slug] = String(data.title ?? slug);
		} catch {
			titles[slug] = slug;
		}
	}

	const onDisk = readdirSync(seriesRoot)
		.filter((name) => /\.ya?ml$/i.test(name))
		.map((name) => path.basename(name, path.extname(name)));
	const orphans = onDisk.filter((slug) => !order.includes(slug));
	if (orphans.length > 0) {
		console.warn(`[series] yaml not listed in series.json order (${locale}): ${orphans.join(', ')}`);
	}

	return { order, titles };
}

const byLocale = Object.fromEntries(siteConfig.locales.list.map((locale) => [locale, loadSeries(locale)]));

/** Series slugs in configured order, keyed by locale. */
export const SERIES_ORDER_BY_LOCALE = Object.freeze(
	Object.fromEntries(
		siteConfig.locales.list.map((locale) => [
			locale,
			/** @type {readonly string[]} */ (Object.freeze(byLocale[locale].order)),
		]),
	),
);

const DEFAULT_LOCALE = siteConfig.locales.default;

/** Default-locale series order (back-compat for locale-agnostic callers). */
export const SERIES_ORDER = SERIES_ORDER_BY_LOCALE[DEFAULT_LOCALE];

/** Every series slug across locales — used as the frontmatter enum. */
export const SERIES_IDS = /** @type {readonly [string, ...string[]]} */ (
	Object.freeze([...new Set(siteConfig.locales.list.flatMap((locale) => byLocale[locale].order))])
);

/** @param {string | undefined | null} locale */
export function seriesOrderFor(locale) {
	return SERIES_ORDER_BY_LOCALE[locale] ?? SERIES_ORDER_BY_LOCALE[DEFAULT_LOCALE];
}

/** @param {string | undefined | null} value */
export function isSeriesId(value) {
	return typeof value === 'string' && SERIES_IDS.includes(value);
}

/**
 * @param {string | undefined | null} slug
 * @param {string | undefined | null} locale
 */
export function seriesTitle(slug, locale) {
	if (!slug) return '';
	const resolved = locale && byLocale[locale] ? locale : DEFAULT_LOCALE;
	return byLocale[resolved].titles[slug] ?? byLocale[DEFAULT_LOCALE].titles[slug] ?? 'Article';
}
