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
	title: 'HYD',
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
	site: 'https://hydblog.xyz',
	timeZone: 'UTC',
	contentRoot: './content',
	publicDir: './public',
	outDir: './dist',
	/** Optional image library root; when unset, collect-assets is a no-op. */
	assetSource: undefined,
	social: {
		github: 'https://github.com/HYDtomako',
	},
	ask: {
		askUrl: 'https://ask.hydblog.xyz/ask',
		mcpUrl: 'https://ask.hydblog.xyz/mcp',
		healthUrl: 'https://ask.hydblog.xyz/health',
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
	/** Page-view/like counters. Keep `url` empty for same-origin; point it at `wrangler dev` while developing the API. */
	stats: {
		enabled: true,
		url: '',
	},
	/** Anonymous guestbook at /guestbook/. Keep `url` empty for same-origin; point it at `wrangler dev` while developing the API. */
	guestbook: {
		enabled: true,
		url: '',
	},
	/** Renamed answers keep their old URLs working. */
	redirects: {
		'/answers/what-is-refined-x': '/answers/what-is-this-site/',
		'/answers/external-content-vault': '/answers/where-articles-were/',
		'/en/answers/what-is-refined-x': '/en/answers/what-is-this-site/',
		'/en/answers/external-content-vault': '/en/answers/where-articles-were/',
	},
	/** Per-locale public identity and page copy, keyed by locale id. */
	brand: {
		'zh-CN': {
			description:
				'HYD 的个人站点：公开文章、项目与自我介绍。同一份内容同时供人阅读、搜索引擎收录与 AI Agent 读取。',
			persona: 'HYD',
			wordmark: 'HYD Personal Blog',
			alternateNames: ['HYD'],
			homeHeading: 'HYD',
			homeTitle: 'HYD — 个人站点',
			homeLede: '把文章、项目与自我介绍发布一次，让人和 Agent 都能读到。',
			writingLede: '平时沉淀的长文，参考多角度的观点，欢迎分享你的见解。',
			askChips: [
				{ label: '这是谁？', query: '作者是谁？' },
				{ label: 'AI 实践', query: '站点记录了哪些 AI 实践？' },
				{ label: '开源项目', query: '有哪些开源项目？' },
				{ label: '合作方式', query: '如何与 HYD 合作？' },
			],
			projects: {
				heading: '项目',
				lede: '如果你也热爱开源，欢迎交流！',
				titleSuffix: '项目',
			},
			about: {
				crumb: '关于',
				pageName: '关于',
			},
		},
		en: {
			description:
				'HYD is an agent-ready personal site for Astro + Starlight.',
			persona: 'HYD',
			wordmark: 'HYD Personal Blog',
			alternateNames: ['HYD'],
			homeHeading: 'HYD',
			homeTitle: 'HYD — Personal site',
			writingLede: 'Long-form pieces written over time, drawing on more than one angle — your thoughts are welcome.',
			askChips: [
				{ label: 'Who is this?', query: 'Who is the author?' },
				{ label: 'AI practice', query: 'What AI practices does this site document?' },
				{ label: 'Open source', query: 'Which open source projects are here?' },
				{ label: 'Collaborate', query: 'How can I collaborate with HYD?' },
			],
			projects: {
				heading: 'Projects',
				lede: 'Into open source too? Let’s talk.',
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
	guestbook: { ...defaults.guestbook, ...(overlayRest.guestbook ?? {}) },
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
