import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { z } from 'astro/zod';
import { siteConfig } from '../site.config.mjs';
import { SERIES_IDS } from './lib/series.mjs';

/** Absolute content paths must be file:// URLs for Astro glob on Windows. */
function contentBase(...segments: string[]) {
	const abs = segments.length
		? path.join(siteConfig.contentRoot, ...segments)
		: siteConfig.contentRoot;
	return pathToFileURL(abs);
}

const LOCALES = /** @type {readonly string[]} */ (siteConfig.locales.list);
const DEFAULT_LOCALE = /** @type {string} */ (siteConfig.locales.default);

function fallbackSlug(entry: string) {
	return path.basename(entry, path.extname(entry));
}

/**
 * Content is grouped by locale folder inside each collection directory
 * (`articles/zh-CN/…`, `profile/en/…`). The glob loader hands over paths relative
 * to the collection base, so the locale folder is the second segment.
 */
function splitLocaleEntry(entry: string) {
	const segments = entry.split('/');
	const localeIndex = segments.findIndex((segment) => LOCALES.includes(segment));
	if (localeIndex < 0 || localeIndex === segments.length - 1) {
		throw new Error(
			`${entry} 必须放在 locale 目录下（content/<集合>/<${LOCALES.join('|')}>/…），以便生成多语言路由`,
		);
	}
	return { locale: segments[localeIndex], rest: segments.slice(localeIndex + 1).join('/') };
}

/** Collection entries keep their locale folder in the id (`en/notes`, `zh-CN/person`). */
function generateLocaleId({ data, entry }: { data: Record<string, unknown>; entry: string }) {
	const { locale, rest } = splitLocaleEntry(entry);
	return `${locale}/${String(data.slug ?? fallbackSlug(rest))}`;
}

function generateDocId({ data, entry }: { data: Record<string, unknown>; entry: string }) {
	const { locale, rest } = splitLocaleEntry(entry);
	const prefix = locale === DEFAULT_LOCALE ? '' : `${locale}/`;
	const contentType = String(data.contentType ?? '');
	const slug = String(data.slug ?? fallbackSlug(rest));

	if (contentType === 'article') {
		const rawDate = String(data.pubDate ?? '');
		const localDate = /^(\d{4})-(\d{2})-(\d{2})/.exec(rawDate);
		const date = new Date(rawDate);
		if (!localDate && Number.isNaN(date.valueOf())) throw new Error(`文章 ${entry} 缺少有效的 pubDate`);
		const year = localDate?.[1] ?? String(date.getUTCFullYear());
		const month = localDate?.[2] ?? String(date.getUTCMonth() + 1).padStart(2, '0');
		const day = localDate?.[3] ?? String(date.getUTCDate()).padStart(2, '0');
		return `${prefix}${year}/${month}/${day}/${slug}`;
	}

	if (contentType === 'note') return `${prefix}notes/${slug}`;
	if (contentType === 'answer') return `${prefix}answers/${slug}`;
	if (contentType === 'profile') return `${prefix}about`;
	if (contentType === 'page') return `${prefix}${slug}`;
	throw new Error(`${entry} 的 contentType 必须是 article、note、answer、profile 或 page`);
}

/** Series slugs come from the instance manifests; with none configured the field stays free-form. */
const seriesField = SERIES_IDS.length > 0 ? z.enum(SERIES_IDS) : z.string();

const publicDocFields = z
	.object({
		contentType: z.enum(['article', 'note', 'answer', 'profile', 'page']),
		pubDate: z.coerce.date().optional(),
		updatedDate: z.coerce.date().optional(),
		slug: z.string().min(1),
		series: seriesField.optional(),
		tags: z.array(z.string()).default([]),
		llmSummary: z.string().min(1),
		seoImage: z.union([z.string().startsWith('/'), z.url()]).optional(),
		question: z.string().min(1).optional(),
		shortAnswer: z.string().min(1).optional(),
		legacySource: z.string().optional(),
		legacyUrl: z.string().startsWith('/').optional(),
	})
	.superRefine((data, context) => {
		if ((data.contentType === 'article' || data.contentType === 'note') && !data.pubDate) {
			context.addIssue({ code: 'custom', path: ['pubDate'], message: 'article/note 必须提供 pubDate' });
		}
		if (data.contentType === 'profile' && data.slug !== 'about') {
			context.addIssue({ code: 'custom', path: ['slug'], message: 'profile 的 slug 必须是 about' });
		}
		if (data.contentType === 'answer' && (!data.question || !data.shortAnswer)) {
			context.addIssue({ code: 'custom', path: ['question'], message: 'answer 必须提供 question 与 shortAnswer' });
		}
	});

const profileSchema = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('person'),
		name: z.string(),
		aliases: z.array(z.string()).default([]),
		title: z.string().optional(),
		bio: z.string().optional(),
		stats: z.array(z.object({ value: z.string(), label: z.string() })).default([]),
		knowsAbout: z.array(z.string()).default([]),
		capabilities: z.array(z.object({ title: z.string(), description: z.string() })).default([]),
		timeline: z.array(z.object({ period: z.string(), role: z.string(), description: z.string() })).default([]),
		education: z.string().optional(),
		educationHistory: z
			.array(
				z.object({
					school: z.string(),
					degree: z.string(),
					major: z.string(),
					period: z.string(),
				}),
			)
			.default([]),
		location: z.string().optional(),
		qq: z.string().optional(),
		links: z.record(z.string(), z.url()).optional(),
	}),
	z.object({
		kind: z.literal('cooperation'),
		title: z.string(),
		description: z.string(),
		contact: z.string().optional(),
	}),
]);

const projectSchema = z.object({
	title: z.string(),
	description: z.string(),
	slug: z.string().min(1),
	status: z.enum(['active', 'maintained', 'archived', 'planned', 'unknown']).default('unknown'),
	url: z.union([z.string().url(), z.string().startsWith('/')]).optional(),
	repository: z.url().optional(),
	stars: z.number().int().min(0).default(0),
	tags: z.array(z.string()).default([]),
	category: z.enum(['project', 'course', 'snippet', 'oss']).default('project'),
	featured: z.boolean().default(false),
	sortRank: z.number().int().default(100),
	image: z.union([z.string().startsWith('/'), z.url()]).optional(),
	imageAlt: z.string().optional(),
	role: z.string().optional(),
	impact: z.string().optional(),
	proofPoints: z.array(z.string()).default([]),
});

const resumeSchema = z.object({
	title: z.string(),
	description: z.string(),
	contentType: z.literal('profile'),
	slug: z.literal('about'),
	tags: z.array(z.string()).default([]),
	llmSummary: z.string().min(1),
	legacySource: z.string().optional(),
	legacyUrl: z.string().startsWith('/').optional(),
});

const seriesSchema = z.object({
	title: z.string(),
	description: z.string(),
	intro: z.string().optional(),
	faq: z.array(z.object({
		question: z.string(),
		answer: z.string(),
	})).default([]),
	featured: z.array(z.string()).default([]),
});

/** Instance configures no series: the collection stays declared but yields no entries. */
const emptySeriesLoader = {
	name: 'refined-x-empty-loader',
	load: async ({ store }: { store: { clear: () => void } }) => {
		store.clear();
	},
};

export const collections = {
	docs: defineCollection({
		loader: glob({
			base: contentBase(),
			pattern: '{articles/**/*.md,notes/**/*.md,answers/**/*.md,pages/**/*.md}',
			generateId: generateDocId,
		}),
		schema: docsSchema({ extend: publicDocFields }),
	}),
	profile: defineCollection({
		loader: glob({
			base: contentBase(),
			pattern: 'profile/*/*.{yaml,yml}',
			generateId: generateLocaleId,
		}),
		schema: profileSchema,
	}),
	resume: defineCollection({
		loader: glob({
			base: contentBase(),
			pattern: 'profile/*/resume.md',
			generateId: generateLocaleId,
		}),
		schema: resumeSchema,
	}),
	projects: defineCollection({
		loader: glob({
			base: contentBase(),
			pattern: 'projects/*/*.{yaml,yml,json}',
			generateId: generateLocaleId,
		}),
		schema: projectSchema,
	}),
	series: defineCollection({
		/** With no configured series a glob would warn on every build, so the collection yields nothing instead. */
		loader:
			SERIES_IDS.length > 0
				? glob({
						base: contentBase('series'),
						pattern: '*/*.{yaml,yml}',
						/** Keep the locale segment verbatim — the default glob id slugifies `zh-CN` to `zh-cn`. */
						generateId: ({ entry }: { entry: string }) => entry.replace(/\.[^.]*$/, ''),
					})
				: emptySeriesLoader,
		schema: seriesSchema,
	}),
};
