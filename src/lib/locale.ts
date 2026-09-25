import { siteConfig } from '../../site.config.mjs';
import { sitePath, stripBase, withBase } from './paths.ts';

/**
 * Locale routing model: the default locale is served at the site root, every
 * other locale under `/<locale>/`. Locale ids are also the BCP-47 language tags.
 */
export const DEFAULT_LOCALE: string = siteConfig.locales.default;

export const LOCALES: readonly string[] = siteConfig.locales.list;

/** Locales served under a URL prefix, in config order. */
export const PREFIXED_LOCALES: readonly string[] = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);

/** URL path prefix for a locale (`''` for the default locale). */
export function localePrefix(locale: string): string {
	return locale === DEFAULT_LOCALE ? '' : `/${locale}`;
}

/** Compact display label for a locale (header language switch, Starlight locale UI). */
export function localeLabel(locale: string): string {
	return siteConfig.locales.labels?.[locale] ?? locale;
}

/** Locale of a request pathname (deploy base is stripped first). */
export function localeFromPath(pathname: string | undefined): string {
	const logical = stripBase(pathname || '/');
	for (const locale of PREFIXED_LOCALES) {
		const prefix = `/${locale}`;
		if (logical === prefix || logical.startsWith(`${prefix}/`)) return locale;
	}
	return DEFAULT_LOCALE;
}

/** Request pathname with any locale prefix removed (always starts with `/`). */
export function stripLocalePrefix(pathname: string | undefined): string {
	const logical = stripBase(pathname || '/');
	for (const locale of PREFIXED_LOCALES) {
		const prefix = `/${locale}`;
		if (logical === prefix || logical === `${prefix}/`) return '/';
		if (logical.startsWith(`${prefix}/`)) return logical.slice(prefix.length);
	}
	return logical;
}

/** Locale-neutral logical path for a locale, preserving query/hash and trailing slash. */
export function localePath(locale: string, pathname = '/'): string {
	const prefix = localePrefix(locale);
	const [pathOnly, suffix = ''] = `${pathname}`.split(/(?=[#?])/);
	const clean = pathOnly.replace(/^\/+/, '');
	return `${prefix}/${clean}${suffix}`;
}

/** Locale-aware href, ready to render (deploy base applied). */
export function localizedHref(locale: string, pathname = '/', base?: string): string {
	return withBase(localePath(locale, pathname), base);
}

/** Locale-aware absolute site path with a trailing slash. */
export function localizedSitePath(locale: string, pathname = '/'): string {
	return sitePath(localePath(locale, pathname));
}

/** The other locale a visitor can switch to (first alternative for 3+ locales). */
export function alternateLocale(locale: string): string {
	return locale === DEFAULT_LOCALE ? (PREFIXED_LOCALES[0] ?? DEFAULT_LOCALE) : DEFAULT_LOCALE;
}
