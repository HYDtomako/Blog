import { siteConfig } from '../../site.config.mjs';
import { getUi, type UiCopy } from '../i18n/index';
import { selectAskPersistenceCopy } from './ask-persistence';
import { DEFAULT_LOCALE } from './locale';
import {
	PUBLIC_ASK_CAPABILITY,
	PUBLIC_ASK_SUPPORTED,
	PUBLIC_ASK_UNSUPPORTED,
	PUBLIC_ASK_SUPPORTED_ITEMS,
	PUBLIC_ASK_UNSUPPORTED_ITEMS,
} from '../../shared/public-ask-contract.ts';

export {
	PUBLIC_ASK_CAPABILITY,
	PUBLIC_ASK_SUPPORTED,
	PUBLIC_ASK_UNSUPPORTED,
	PUBLIC_ASK_SUPPORTED_ITEMS,
	PUBLIC_ASK_UNSUPPORTED_ITEMS,
};

/** Locale-neutral site identity (site.config / instance overlay). */
export const SITE_BRAND = siteConfig.title;

export const SITE_ORIGIN = new URL(siteConfig.site).origin;

export const MCP_ENDPOINT_URL = siteConfig.ask.mcpUrl || '';

export const MCP_ASK_URL = siteConfig.ask.askUrl || '';

export const MCP_HEALTH_URL = siteConfig.ask.healthUrl || '';

/** Public identity and page copy for one locale (`siteConfig.brand[locale]`). */
export type SiteBrand = {
	description: string;
	persona: string;
	/** Header wordmark — the short standing title shown in the top bar. */
	wordmark: string;
	alternateNames: string[];
	homeHeading: string;
	homeTitle: string;
	homeLede?: string;
	/** Optional writing-section lede; when unset the section shows only its count line. */
	writingLede?: string;
	askChips: Array<{ label: string; query: string }>;
	footerTagline?: string;
	projects: {
		heading: string;
		description?: string;
		lede: string;
		titleSuffix: string;
	};
	about: {
		crumb: string;
		pageName: string;
	};
};

/** Everything locale-dependent that components render. */
export type SiteCopy = {
	locale: string;
	/** UI chrome language pack. */
	ui: UiCopy;
	/** Public identity, home copy, and section labels. */
	brand: SiteBrand;
	ask: {
		placeholder: string;
		overlayPlaceholder: string;
		pagePlaceholder: string;
		button: string;
		pageTitle: string;
		pageLede: string;
		privacyNote: string;
	};
	askRuntime: UiCopy['askRuntime'] & { liveFootPrimary: string };
	mcp: {
		agentPrompt: string;
		guideTitle: string;
		guideLede: string;
		guideFollowup: string;
	};
};

const copyCache = new Map<string, SiteCopy>();

/** Resolve locale-dependent copy, falling back to the default locale. */
export function getSiteCopy(locale?: string): SiteCopy {
	const resolved = locale && siteConfig.locales.list.includes(locale) ? locale : DEFAULT_LOCALE;
	const cached = copyCache.get(resolved);
	if (cached) return cached;

	const ui = getUi(resolved);
	const brand = siteConfig.brand[resolved] as SiteBrand;
	const persistence = selectAskPersistenceCopy(siteConfig.ask.persistInteractions, ui.ask, ui.askRuntime);

	const copy: SiteCopy = {
		locale: resolved,
		ui,
		brand,
		ask: {
			placeholder: ui.ask.placeholder,
			overlayPlaceholder: ui.ask.overlayPlaceholder,
			pagePlaceholder: ui.ask.pagePlaceholder,
			button: ui.ask.button,
			pageTitle: ui.ask.pageTitle,
			pageLede: ui.ask.pageLede,
			privacyNote: persistence.privacyNote,
		},
		askRuntime: {
			...ui.askRuntime,
			liveFootPrimary: persistence.liveFootPrimary,
		},
		mcp: {
			agentPrompt: MCP_ENDPOINT_URL ? ui.mcp.agentPrompt(MCP_ENDPOINT_URL) : ui.mcp.agentPromptMissing,
			guideTitle: ui.mcp.guideTitle,
			guideLede: ui.mcp.guideLede,
			guideFollowup: ui.mcp.guideFollowup(PUBLIC_ASK_UNSUPPORTED),
		},
	};

	copyCache.set(resolved, copy);
	return copy;
}
