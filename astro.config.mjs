// @ts-check
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import sitemap from '@astrojs/sitemap';
import starlight from '@astrojs/starlight';
import { siteConfig } from './site.config.mjs';
import { createSeoSitemapOptions } from './scripts/seo-sitemap.mjs';
import { awpDiscoveryGate } from './scripts/awp-discovery-gate.mjs';
import { remarkObsidianAssets } from './src/markdown/remark-obsidian-assets.mjs';
import { remarkProfileLinks } from './src/markdown/remark-profile-links.mjs';
import { astroBaseFromSite } from './src/lib/paths.ts';

/** @type {string} */
const defaultLocaleId = siteConfig.locales.default;
/** @type {string[]} */
const localeIds = siteConfig.locales.list;
/** @type {Record<string, string>} */
const localeLabels = siteConfig.locales.labels ?? {};

// https://astro.build/config
export default defineConfig({
	site: siteConfig.site,
	base: astroBaseFromSite(siteConfig.site),
	trailingSlash: 'ignore',
	build: {
		format: 'directory',
	},
	outDir: siteConfig.outDir,
	publicDir: siteConfig.publicDir,
	redirects: siteConfig.redirects ?? {},
	markdown: {
		processor: unified({ remarkPlugins: [remarkObsidianAssets, remarkProfileLinks] }),
	},
	vite: {
		build: { emptyOutDir: true },
		define: {
			'import.meta.env.PUBLIC_ASK_URL': JSON.stringify(siteConfig.ask.askUrl || ''),
			'import.meta.env.PUBLIC_MCP_URL': JSON.stringify(siteConfig.ask.mcpUrl || ''),
			'import.meta.env.PUBLIC_ASK_HEALTH_URL': JSON.stringify(siteConfig.ask.healthUrl || ''),
			'import.meta.env.PUBLIC_STATS_URL': JSON.stringify(siteConfig.stats?.url || ''),
		},
	},
	integrations: [
		awpDiscoveryGate(siteConfig),
		sitemap(
			createSeoSitemapOptions({
				contentRoot: siteConfig.contentRoot,
				site: siteConfig.site,
				locales: siteConfig.locales,
			}),
		),
		starlight({
			title: siteConfig.title,
			description: siteConfig.brand[siteConfig.locales.default].description,
			disable404Route: true,
			/** Site search lives in the /ask stage and its ⌘K overlay; the Pagefind index is unused. */
			pagefind: false,
			customCss: [
				'./src/styles/refined-x.css',
				'./src/styles/hero-theme-crossfade.css',
				'./src/styles/hero-glass-react.css',
				'./src/styles/chat-transcript.css',
			],
			components: {
				Head: './src/components/Head.astro',
				PageFrame: './src/components/PageFrame.astro',
				Header: './src/components/Header.astro',
				Footer: './src/components/FooterOverride.astro',
				ThemeSelect: './src/components/ThemeSelect.astro',
				PageTitle: './src/components/PageTitle.astro',
				TwoColumnContent: './src/components/TwoColumnContent.astro',
				MarkdownContent: './src/components/MarkdownContent.astro',
			},
			locales: Object.fromEntries([
				['root', { label: localeLabels[defaultLocaleId] ?? defaultLocaleId, lang: defaultLocaleId }],
				...localeIds.filter((locale) => locale !== defaultLocaleId).map((locale) => [
					locale,
					{ label: localeLabels[locale] ?? locale, lang: locale },
				]),
			]),
			social: siteConfig.social?.github
				? [{ icon: 'github', label: 'GitHub', href: siteConfig.social.github }]
				: [],
			sidebar: [
				{
					label: 'Public',
					items: [{ autogenerate: { directory: '' } }],
				},
			],
		}),
	],
});
