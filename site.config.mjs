import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveCommentsConfig } from './src/lib/comments.mjs';
import { assertPublicCapabilitiesConfig } from './src/lib/public-capabilities.ts';
import { omitRetiredSiteOverlayKeys } from './src/lib/site-config-overlay.mjs';

function findPackageRoot() {
	let dir = process.cwd();
	while (true) {
		if (existsSync(path.join(dir, 'astro.config.mjs')) && existsSync(path.join(dir, 'package.json'))) {
			return dir;
		}
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return path.dirname(fileURLToPath(import.meta.url));
}

/** Absolute path to the Astro project root (this package). Prefer cwd — import.meta.url breaks when Vite bundles this module. */
export const siteRoot = findPackageRoot();

const defaults = {
	/** Site name — locale-neutral; used by Starlight chrome and machine-readable identity. */
	title: 'Your Site',
	/**
	 * `default` is served at `/`; every other entry is served under `/<locale>/`.
	 * UI chrome copy lives in `src/i18n`, public identity copy in `brand` below.
	 */
	locales: {
		default: 'zh-CN',
		list: ['zh-CN', 'en'],
		/** Compact labels for the header language switch and Starlight locale UI. */
		labels: { 'zh-CN': '中文', en: 'EN' },
	},
	site: 'https://example.com',
	timeZone: 'UTC',
	contentRoot: './content',
	publicDir: './public',
	outDir: './dist',
	/** Optional image library root; when unset, collect-assets is a no-op. */
	assetSource: undefined,
	social: {
		/** Set your GitHub profile URL to refresh the contribution graph and project stars. */
		github: '',
	},
	ask: {
		/** Optional Live Ask endpoints — leave empty for a static-only site (see docs/deploy-live-ask.md). */
		askUrl: '',
		mcpUrl: '',
		healthUrl: '',
		/**
		 * Public protocol declaration for discovery/OpenAPI.
		 * Default `undeclared` does not claim modern dual-era until a deployment has passed acceptance.
		 * Set `dual-era` only after the accepted Worker + static docs combo is verified.
		 */
		protocolProfile: 'undeclared',
		/** Must match the Worker PERSIST_INTERACTIONS setting when Live Ask is enabled. */
		persistInteractions: false,
	},
	/** Optional giscus repository/category identifiers. Leave all fields empty to disable comments. */
	comments: {
		repo: '',
		repoId: '',
		category: '',
		categoryId: '',
	},
	/**
	 * Page-view/like counters. Off by default: turn it on after deploying the site Worker
	 * (`worker/`). Keep `url` empty for same-origin; point it at `wrangler dev` while developing the API.
	 */
	stats: {
		enabled: false,
		url: '',
	},
	/** Renamed pages keep their old URLs working: `{ '/old-path': '/new-path/' }`. */
	redirects: {},
	/** Per-locale public identity and page copy, keyed by locale id. */
	brand: {
		'zh-CN': {
			description:
				'这里是你的站点简介：公开文章、随笔、项目与自我介绍，同一份内容同时供人阅读、搜索引擎收录与 AI Agent 读取。',
			persona: '你的名字',
			wordmark: 'Your Site',
			alternateNames: ['你的名字'],
			homeHeading: '你的名字',
			homeTitle: '你的名字 — 个人站点',
			homeLede: '把文章、项目与自我介绍发布一次，让人和 Agent 都能读到。',
			writingLede: '平时沉淀的长文，欢迎分享你的见解。',
			askChips: [
				{ label: '这是谁？', query: '作者是谁？' },
				{ label: '写了什么？', query: '站点上有哪些文章？' },
				{ label: '有哪些项目？', query: '有哪些项目？' },
				{ label: '怎么联系？', query: '怎么联系作者？' },
			],
			projects: {
				heading: '项目',
				lede: '这里放你做过的东西。',
				titleSuffix: '项目',
			},
			about: {
				crumb: '关于',
				pageName: '关于',
			},
		},
		en: {
			description:
				'Your site description: articles, notes, projects, and a public profile — one corpus for readers, search engines, and AI agents.',
			persona: 'Your Name',
			wordmark: 'Your Site',
			alternateNames: ['Your Name'],
			homeHeading: 'Your Name',
			homeTitle: 'Your Name — Personal site',
			homeLede: 'Publish your writing, projects, and profile once — for people and agents alike.',
			writingLede: 'Long-form pieces written over time — your thoughts are welcome.',
			askChips: [
				{ label: 'Who is this?', query: 'Who is the author?' },
				{ label: 'What is here?', query: 'What articles are on this site?' },
				{ label: 'Projects', query: 'Which projects are here?' },
				{ label: 'Contact', query: 'How do I contact the author?' },
			],
			projects: {
				heading: 'Projects',
				lede: 'Things built and shipped.',
				titleSuffix: 'Projects',
			},
			about: {
				crumb: 'About',
				pageName: 'About',
			},
		},
	},
	/**
	 * Optional discovery experiments. AWP manifests (`/agent.json`, `/.well-known/agent.json`)
	 * are off by default — enable only after the #17 start gate (consumer + draft pin + acceptance case).
	 */
	discovery: {
		awp: false,
	},
};

async function loadOverlay() {
	const fromEnv = process.env.REFINED_X_INSTANCE_CONFIG;
	const candidates = [
		fromEnv,
		path.resolve(siteRoot, '../instance.config.mjs'),
		path.resolve(siteRoot, 'instance.config.mjs'),
	].filter(Boolean);

	for (const candidate of candidates) {
		if (!existsSync(candidate)) continue;
		const mod = await import(/* @vite-ignore */ pathToFileURL(candidate).href);
		return mod.default ?? mod.siteConfig ?? mod;
	}
	return {};
}

function resolvePath(value) {
	if (value === undefined || value === null || value === '') return undefined;
	return path.isAbsolute(value) ? value : path.resolve(siteRoot, value);
}

const overlay = await loadOverlay();
const stripped = omitRetiredSiteOverlayKeys(overlay);
if (stripped.ignoredRetiredMcp) {
	console.warn(
		'instance config key "mcp" was removed in #18 (legacy discovery retirement); ignoring overlay.mcp',
	);
}
/** Keep overlay shape loose for siteConfig inference (helper return is untyped object). */
const overlayRest = /** @type {typeof overlay} */ (stripped.overlay);
const overlayLocales = overlayRest.locales ?? {};
const locales = {
	...defaults.locales,
	...overlayLocales,
	list: overlayLocales.list ?? defaults.locales.list,
};
if (locales.list.length === 0) throw new Error('locales.list must not be empty');
if (!locales.list.includes(locales.default)) {
	throw new Error(`locales.default (${locales.default}) must be one of locales.list (${locales.list.join(', ')})`);
}
const mergedBrand = Object.fromEntries(
	locales.list.map((locale) => {
		const base = defaults.brand[locale] ?? defaults.brand[locales.default];
		const override = overlayRest.brand?.[locale] ?? {};
		if (!base) throw new Error(`brand has no copy for locale "${locale}"; add it to site.config.mjs or the overlay`);
		return [
			locale,
			{
				...base,
				...override,
				projects: { ...base.projects, ...(override.projects ?? {}) },
				about: { ...base.about, ...(override.about ?? {}) },
				askChips: override.askChips ?? base.askChips,
				alternateNames: override.alternateNames ?? base.alternateNames,
			},
		];
	}),
);
const merged = {
	...defaults,
	...overlayRest,
	locales,
	social: { ...defaults.social, ...(overlayRest.social ?? {}) },
	ask: { ...defaults.ask, ...(overlayRest.ask ?? {}) },
	stats: { ...defaults.stats, ...(overlayRest.stats ?? {}) },
	comments: resolveCommentsConfig({ ...defaults.comments, ...(overlayRest.comments ?? {}) }),
	brand: mergedBrand,
	discovery: { ...defaults.discovery, ...(overlayRest.discovery ?? {}) },
	redirects: overlayRest.redirects ?? defaults.redirects,
};

const contentRoot = resolvePath(merged.contentRoot);
const publicDir = resolvePath(merged.publicDir);
const outDir = resolvePath(merged.outDir);
const assetSource = resolvePath(merged.assetSource);

/** Fail fast on illegal ask/mcp URLs, protocolProfile, or OpenAPI path collisions. */
assertPublicCapabilitiesConfig(merged);

/** Resolved site configuration (paths are absolute). */
export const siteConfig = {
	...merged,
	contentRoot,
	publicDir,
	outDir,
	assetSource,
};
