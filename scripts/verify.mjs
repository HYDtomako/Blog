import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { siteConfig } from '../site.config.mjs';
import { builtPageExists, builtResourceExists } from './dist-path.mjs';
import {
	awpPathsMustExist,
	awpPathsMustNotExist,
	requiredDiscoveryFilesForStage,
	discoveryPathsMustNotExist,
	verifyAwpManifestPair,
	verifyLlmsAgainstCapabilities,
	verifyLlmsHasNoAwpWhenDisabled,
	verifyOpenApiAgainstCapabilities,
} from './verify-capabilities.mjs';
import { isAwpDiscoveryEnabled } from '../src/lib/awp-manifest.ts';
import { resolvePublicCapabilities, siteConfigToCapabilitiesInput } from '../src/lib/public-capabilities.ts';
import { PUBLIC_SURFACES } from '../src/lib/public-surfaces.ts';

const distRoot = siteConfig.outDir;
const defaultLocale = siteConfig.locales.default;
const prefixedLocales = siteConfig.locales.list.filter((locale) => locale !== defaultLocale);
const localePrefixOf = (locale) => (locale === defaultLocale ? '' : `/${locale}`);
const hubPages = ['/', '/about/', '/projects/', '/writing/', '/notes/', '/ask/', '/answers/'];
const localeFiles = [
	'/api/profile.json',
	'/api/articles.json',
	'/api/search-index.json',
	'/llms.txt',
];
const requiredPages = siteConfig.locales.list.flatMap((locale) =>
	hubPages.map((page) => `${localePrefixOf(locale)}${page}`),
);
const requiredFiles = [
	'/.nojekyll',
	...siteConfig.locales.list.flatMap((locale) => localeFiles.map((file) => `${localePrefixOf(locale)}${file}`)),
	...requiredDiscoveryFilesForStage(),
];
const articlePattern = new RegExp(
	`^${prefixedLocales.length ? `(?:${prefixedLocales.join('|')})/` : ''}\\d{4}/\\d{2}/\\d{2}/.+/index\\.html$`,
);

const failures = [];

const caps = resolvePublicCapabilities(siteConfigToCapabilitiesInput(siteConfig));
const awpEnabled = isAwpDiscoveryEnabled(siteConfig);

async function listHtmlFiles(directory) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) files.push(...(await listHtmlFiles(entryPath)));
		else if (entry.name.endsWith('.html')) files.push(entryPath);
	}
	return files;
}

for (const page of requiredPages) {
	if (!(await builtPageExists(distRoot, page))) failures.push(`Missing page: ${page}`);
}
for (const file of requiredFiles) {
	if (!(await builtResourceExists(distRoot, file))) failures.push(`Missing file: ${file}`);
}
for (const locale of siteConfig.locales.list) {
	for (const surface of PUBLIC_SURFACES) {
		const path = surface.scope === 'locale' ? `${localePrefixOf(locale)}${surface.path}` : surface.path;
		if (!(await builtResourceExists(distRoot, path))) {
			failures.push(`Missing machine-readable surface linked in the footer: ${path}`);
		}
	}
}
for (const file of awpPathsMustNotExist(awpEnabled)) {
	if (await builtResourceExists(distRoot, file)) {
		failures.push(`File must not exist when discovery.awp is off: ${file}`);
	}
}
for (const file of discoveryPathsMustNotExist()) {
	if (await builtResourceExists(distRoot, file)) {
		failures.push(`Forbidden discovery file must not exist: ${file}`);
	}
}
for (const file of awpPathsMustExist(awpEnabled)) {
	if (!(await builtResourceExists(distRoot, file))) {
		failures.push(`Missing AWP file when discovery.awp is on: ${file}`);
	}
}

try {
	const profile = JSON.parse(await readFile(path.join(distRoot, 'api/profile.json'), 'utf8'));
	if (!profile?.name) failures.push('api/profile.json missing name');
} catch (error) {
	failures.push(`api/profile.json unreadable: ${error.message}`);
}

try {
	const llms = await readFile(path.join(distRoot, 'llms.txt'), 'utf8');
	failures.push(...verifyLlmsAgainstCapabilities(caps, llms));
	failures.push(...verifyLlmsHasNoAwpWhenDisabled(llms, awpEnabled));
} catch (error) {
	failures.push(`llms.txt unreadable: ${error.message}`);
}

try {
	const openapi = JSON.parse(await readFile(path.join(distRoot, 'openapi.json'), 'utf8'));
	failures.push(...verifyOpenApiAgainstCapabilities(caps, openapi));
} catch (error) {
	failures.push(`openapi.json integration verification failed: ${error.message}`);
}

if (awpEnabled) {
	try {
		const rootBody = await readFile(path.join(distRoot, 'agent.json'), 'utf8');
		const wellKnownBody = await readFile(path.join(distRoot, '.well-known/agent.json'), 'utf8');
		failures.push(...verifyAwpManifestPair(rootBody, wellKnownBody));
	} catch (error) {
		failures.push(`AWP manifest verification failed: ${error.message}`);
	}
}

if (caps.ask) {
	try {
		const askHtml = await readFile(path.join(distRoot, 'ask', 'index.html'), 'utf8');
		if (!askHtml.includes('challenges.cloudflare.com/turnstile/')) {
			failures.push('Ask page missing Turnstile script');
		}
		if (!askHtml.includes('data-sitekey=') || !askHtml.includes('data-action="public-ask"')) {
			failures.push('Ask page missing configured Turnstile widget');
		}
	} catch (error) {
		failures.push(`Ask integration verification failed: ${error.message}`);
	}
}

try {
	const statsEnabled = siteConfig.stats?.enabled === true;
	const htmlFiles = await listHtmlFiles(distRoot);
	let commentPages = 0;
	let statsPages = 0;
	let statsHome = false;
	for (const htmlPath of htmlFiles) {
		const html = await readFile(htmlPath, 'utf8');
		const relativePath = path.relative(distRoot, htmlPath).replaceAll('\\', '/');
		const isArticle = articlePattern.test(relativePath);
		const hasComments = html.includes('data-giscus-comments');
		const hasStats = html.includes('data-page-stats');

		if (hasComments) commentPages += 1;
		if (hasStats) statsPages += 1;
		if (relativePath === 'index.html' && html.includes('data-site-stats')) statsHome = true;
		if (siteConfig.comments.enabled && isArticle && !hasComments) {
			failures.push(`${relativePath} is an article but is missing the comments surface`);
		}
		if (hasComments && !isArticle) {
			failures.push(`${relativePath} is not an article but includes the comments surface`);
		}
		if (hasComments && !/data-term="article:[^"]+"/.test(html)) {
			failures.push(`${relativePath} is missing its stable article comment term`);
		}
		if (statsEnabled && isArticle && !hasStats) {
			failures.push(`${relativePath} is an article but is missing the stats surface`);
		}
		if (!statsEnabled && hasStats) {
			failures.push(`${relativePath} includes the stats surface while stats are disabled`);
		}

		const expectedLocale = prefixedLocales.includes(relativePath.split('/')[0])
			? relativePath.split('/')[0]
			: defaultLocale;
		for (const match of html.matchAll(/"inLanguage":"([^"]+)"/g)) {
			const language = match[1];
			if (language !== expectedLocale) {
				failures.push(
					`${path.relative(distRoot, htmlPath)} uses inLanguage=${language}; expected ${expectedLocale}`,
				);
			}
		}
	}
	if (siteConfig.comments.enabled && commentPages === 0) {
		failures.push('Comments are enabled but no article comment surfaces were generated');
	}
	if (!siteConfig.comments.enabled && commentPages > 0) {
		failures.push('Comments are disabled but comment surfaces were generated');
	}
	if (statsEnabled && statsPages === 0) {
		failures.push('Stats are enabled but no article stats surfaces were generated');
	}
	if (statsEnabled && !statsHome) {
		failures.push('Stats are enabled but the home page has no site stats block');
	}
} catch (error) {
	failures.push(`HTML integration verification failed: ${error.message}`);
}

if (failures.length > 0) {
	console.error('verify failed:\n' + failures.map((line) => `- ${line}`).join('\n'));
	process.exit(1);
}

console.log(
	`verify ok (dist=${distRoot}, mode=${caps.mode}, protocolProfile=${caps.protocolProfile.id}, awp=${awpEnabled})`,
);
