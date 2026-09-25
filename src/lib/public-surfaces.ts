import { localePath } from './locale.ts';
import { withBase } from './paths.ts';

/**
 * Machine-readable surfaces every build publishes. The footer link list and the
 * `scripts/verify.mjs` existence check both read this module, so a link cannot
 * drift from what the build actually emits.
 */
export type PublicSurfaceScope = 'locale' | 'site';

export type PublicSurface = {
	/** Logical path without locale prefix or deploy base. */
	path: string;
	/** `locale` surfaces exist once per locale; `site` surfaces exist once at the root. */
	scope: PublicSurfaceScope;
};

export const PUBLIC_SURFACES: readonly PublicSurface[] = [
	{ path: '/llms.txt', scope: 'locale' },
	{ path: '/llms-full.txt', scope: 'locale' },
	{ path: '/rss.xml', scope: 'locale' },
	{ path: '/api/profile.json', scope: 'locale' },
	{ path: '/api/articles.json', scope: 'locale' },
	{ path: '/api/topics.json', scope: 'locale' },
	{ path: '/api/search-index.json', scope: 'locale' },
	{ path: '/openapi.json', scope: 'site' },
	{ path: '/.well-known/about.json', scope: 'site' },
];

/** Rendered href for a surface (locale prefix and deploy base applied). */
export function publicSurfaceHref(locale: string, surface: PublicSurface, base?: string): string {
	const path = surface.scope === 'locale' ? localePath(locale, surface.path) : surface.path;
	return withBase(path, base);
}

/** Display label for a surface: site-wide files stay unprefixed, locale surfaces show their prefix. */
export function publicSurfaceLabel(locale: string, surface: PublicSurface): string {
	return surface.scope === 'locale' ? localePath(locale, surface.path) : surface.path;
}
