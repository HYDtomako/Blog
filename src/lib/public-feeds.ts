import rss from '@astrojs/rss';
import { getCollection, type CollectionEntry } from 'astro:content';
import { formatArticleDate, seriesName, seriesOrder } from './articles';
import { DEFAULT_LOCALE, localePath } from './locale';
import { getPublicCapabilities } from './mcp-discovery';
import { sitePath } from './paths';
import {
	absoluteUrl,
	docPath,
	entryLocale,
	getAnswers,
	getArticles,
	getNotes,
	getPublicProfile,
	getTopics,
	jsonResponse,
	serializeArticle,
	type PublicDocEntry,
} from './public-data';
import { SITE_BRAND, getSiteCopy } from './site-copy';

type FeedLabels = {
	corpusTitle: string;
	name: string;
	bio: string;
	author: string;
	source: string;
	summary: string;
	published: string;
	updated: string;
	series: string;
	contactHeading: string;
	resumeHeading: string;
	website: string;
	email: string;
	qq: string;
	separator: string;
};

const FEED_LABELS: Record<string, FeedLabels> = {
	[DEFAULT_LOCALE]: {
		corpusTitle: '完整公开语料',
		name: '姓名',
		bio: '简介',
		author: '作者',
		source: '来源',
		summary: '摘要',
		published: '发布日期',
		updated: '更新时间',
		series: '专栏',
		contactHeading: '联系与链接',
		resumeHeading: '简历',
		website: '网站',
		email: '邮箱',
		qq: 'QQ',
		separator: '：',
	},
	en: {
		corpusTitle: 'Full public corpus',
		name: 'Name',
		bio: 'Bio',
		author: 'Author',
		source: 'Source',
		summary: 'Summary',
		published: 'Published',
		updated: 'Updated',
		series: 'Series',
		contactHeading: 'Contact & links',
		resumeHeading: 'Resume',
		website: 'Website',
		email: 'Email',
		qq: 'QQ',
		separator: ': ',
	},
};

function feedLabels(locale: string) {
	return FEED_LABELS[locale] ?? FEED_LABELS[DEFAULT_LOCALE];
}

function field(labels: FeedLabels, label: string, value: string) {
	return `${label}${labels.separator}${value}`;
}

function localeRelativeId(id: string, locale: string) {
	const prefix = `${locale}/`;
	return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

export async function buildArticlesJson(locale: string = DEFAULT_LOCALE) {
	const articles = await getArticles(locale);
	return jsonResponse({ count: articles.length, articles: articles.map(serializeArticle) });
}

export async function buildProfileJson(locale: string = DEFAULT_LOCALE) {
	return jsonResponse(await getPublicProfile(locale));
}

export async function buildTopicsJson(locale: string = DEFAULT_LOCALE) {
	const topics = await getTopics(locale);
	return jsonResponse({
		count: topics.length,
		topics: topics.map((topic) => ({
			name: topic.name,
			slug: topic.slug,
			url: absoluteUrl(localePath(locale, sitePath(`/topics/${topic.slug}`))),
			articleCount: topic.articles.length,
			articles: topic.articles.map(serializeArticle),
		})),
	});
}

export async function buildSearchIndexJson(locale: string = DEFAULT_LOCALE) {
	const [articles, notes, answers] = await Promise.all([
		getArticles(locale),
		getNotes(locale),
		getAnswers(locale),
	]);
	const docItem = (entry: PublicDocEntry) => ({
		url: docPath(entry),
		title: entry.data.title || entry.id,
		excerpt: entry.data.llmSummary || entry.data.description || '',
		tags: entry.data.tags,
		series: entry.data.series || '',
		seriesName: entry.data.series ? seriesName(entry.data.series, locale) : '',
		date: formatArticleDate(entry.data.pubDate!),
	});
	/** Notes are separate here but read like articles in search results. */
	const articleItems = articles.map(docItem);
	const noteItems = notes.map(docItem);
	const answerItems = answers.map((entry) => ({
		url: docPath(entry),
		q: entry.data.question || entry.data.title,
		a: entry.data.shortAnswer || entry.data.description || '',
		full: entry.body || '',
	}));
	return jsonResponse({
		articles: articleItems,
		notes: noteItems,
		answers: answerItems,
		items: [
			...articleItems.map((item) => ({ type: 'article', ...item })),
			...noteItems.map((item) => ({ type: 'note', ...item })),
			...answerItems.map((item) => ({ type: 'answer', title: item.q, excerpt: item.a, url: item.url })),
		],
	});
}

export async function buildRssFeed(locale: string = DEFAULT_LOCALE) {
	const articles = await getArticles(locale);
	return rss({
		title: SITE_BRAND,
		description: getSiteCopy(locale).brand.description,
		site: absoluteUrl(localePath(locale, '/')),
		items: articles.map((article) => ({
			title: article.data.title,
			description: article.data.llmSummary,
			pubDate: article.data.pubDate!,
			link: absoluteUrl(docPath(article)),
		})),
	});
}

export async function buildLlmsText(locale: string = DEFAULT_LOCALE) {
	const [profile, articles, answers] = await Promise.all([
		getPublicProfile(locale),
		getArticles(locale),
		getAnswers(locale),
	]);
	const caps = getPublicCapabilities();
	const localizedUrl = (path: string) => absoluteUrl(localePath(locale, path));
	const featured = articles.slice(0, 12).map((entry) =>
		`- [${entry.data.title}](${absoluteUrl(`/${entry.id}.md`)}): ${entry.data.llmSummary}`,
	);
	const answerLinks = answers.map((entry) =>
		`- [${entry.data.question}](${absoluteUrl(docPath(entry))}): ${entry.data.shortAnswer}`,
	);
	const seriesLinks = seriesOrder(locale).map((slug: string) =>
		`- [${seriesName(slug, locale)}](${localizedUrl(sitePath(`/writing/${slug}`))})`,
	);

	const askLines: string[] = [];
	if (caps.ask) {
		askLines.push(`- ${caps.capability}: POST ${caps.ask.href}`);
	}
	if (caps.mcp) {
		askLines.push(`- MCP ask: POST ${caps.mcp.href} (tool: ask, Streamable HTTP)`);
	}
	if (caps.ask || caps.mcp) {
		askLines.push(`- Capability boundary: ${caps.supportedNotes} ${caps.unsupportedNotes}`);
		askLines.push(`- Protocol profile: ${caps.protocolProfile.id}`);
	} else {
		askLines.push(`- Public Ask worker not configured (static search / curated answers only)`);
	}

	const discoveryLines = [
		`- [OpenAPI](${absoluteUrl('/openapi.json')})`,
		`- [About index](${absoluteUrl('/.well-known/about.json')})`,
	];
	if (caps.mcp) {
		discoveryLines.push(`- MCP endpoint (primary): POST ${caps.mcp.href}`);
	}

	const seriesSection = seriesLinks.length > 0 ? `\n## Series\n\n${seriesLinks.join('\n')}\n` : '';
	const body = `# ${SITE_BRAND}

> Public articles, projects, and profile for ${profile.name}.

## Core

- [About ${profile.name}](${localizedUrl('/about.md')})
- [Projects](${localizedUrl('/projects/')})
- [Answers](${localizedUrl('/answers/')})
- [Profile JSON](${localizedUrl('/api/profile.json')})
- [Full corpus](${localizedUrl('/llms-full.txt')})
${discoveryLines.join('\n')}
${askLines.join('\n')}
${seriesSection}
## Answers

${answerLinks.join('\n')}

## Recent articles

${featured.join('\n')}
`;
	return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

export async function buildLlmsFullText(locale: string = DEFAULT_LOCALE) {
	const [profile, articles, answers] = await Promise.all([
		getPublicProfile(locale),
		getArticles(locale),
		getAnswers(locale),
	]);
	const labels = feedLabels(locale);
	const sections = [
		`# ${SITE_BRAND} ${labels.corpusTitle}\n\n${field(labels, labels.name, profile.name)}\n\n${field(labels, labels.bio, profile.description ?? '')}`,
		...answers.map((entry) =>
			`# ${entry.data.question}\n\n${field(labels, labels.author, profile.name)}\n\n${field(labels, labels.source, absoluteUrl(docPath(entry)))}\n\n${field(labels, labels.summary, entry.data.shortAnswer ?? '')}\n\n${entry.body ?? ''}`,
		),
		...articles.map((entry) => {
			const seriesLine = entry.data.series
				? `${field(labels, labels.series, seriesName(entry.data.series, locale))}\n\n`
				: '';
			return `# ${entry.data.title}\n\n${field(labels, labels.author, profile.name)}\n\n${field(labels, labels.source, absoluteUrl(docPath(entry)))}\n\n${field(labels, labels.published, entry.data.pubDate!.toISOString())}\n\n${field(labels, labels.updated, (entry.data.updatedDate ?? entry.data.pubDate)!.toISOString())}\n\n${seriesLine}${field(labels, labels.summary, entry.data.llmSummary)}\n\n${entry.body ?? ''}`;
		}),
	];
	return new Response(`${sections.join('\n\n---\n\n')}\n`, {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
}

async function getResume(locale: string) {
	const [resume] = (await getCollection('resume')).filter((entry) => entryLocale(entry.id) === locale);
	if (!resume) throw new Error(`about.md 缺少 ${locale} 的 resume 内容`);
	return resume;
}

export async function buildAboutMarkdown(locale: string = DEFAULT_LOCALE) {
	const [profile, resume] = await Promise.all([getPublicProfile(locale), getResume(locale)]);
	const labels = feedLabels(locale);
	const body = `# ${resume.data.title}\n\n${profile.description ?? ''}\n\n## ${labels.contactHeading}\n\n- ${field(labels, labels.website, profile.url)}\n${profile.sameAs.map((url) => `- ${url}`).join('\n')}\n${profile.email ? `- ${field(labels, labels.email, profile.email)}` : ''}\n${profile.qq ? `- ${field(labels, labels.qq, profile.qq)}` : ''}\n\n## ${labels.resumeHeading}\n\n${resume.body ?? ''}\n`;
	return new Response(body, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
}

export async function articleMarkdownPaths(locale: string = DEFAULT_LOCALE) {
	return (await getArticles(locale)).map((article) => {
		const [year, month, day, ...slugParts] = localeRelativeId(article.id, locale).split('/');
		return {
			params: { year, month, day, slug: slugParts.join('/') },
			props: { article },
		};
	});
}

export function buildArticleMarkdown(article: CollectionEntry<'docs'>) {
	const frontmatter = [
		'---',
		`title: ${JSON.stringify(article.data.title)}`,
		`description: ${JSON.stringify(article.data.description)}`,
		`pubDate: ${article.data.pubDate!.toISOString()}`,
		`tags: ${JSON.stringify(article.data.tags)}`,
		'---',
	].join('\n');
	return new Response(`${frontmatter}\n\n${article.body ?? ''}\n`, {
		headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
	});
}
