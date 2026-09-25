import { visit } from 'unist-util-visit';

/**
 * Link presentation for the public profile resume (`profile/<locale>/resume.md`):
 * a list whose items are single links renders as the bordered icon chips used under
 * Social Networks, and links pointing at an image file open in a new tab so a photo
 * never replaces the page. Scoped to the resume, so link lists in articles, notes,
 * and answers keep their plain list styling.
 */
const resumeFile = /[\\/]profile[\\/][^\\/]+[\\/]resume\.md$/;

/** Photo links are files, not pages: they open beside the resume instead of replacing it. */
const imageFile = /\.(?:avif|gif|jpe?g|png|svg|webp)(?:$|[?#])/i;

function strokeIcon(paths) {
	return `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

const linkIcon = strokeIcon(
	'<circle cx="12" cy="12" r="8.4" /><path d="M3.6 12h16.8" /><path d="M12 3.6c2.2 2.4 3.4 5.3 3.4 8.4S14.2 18 12 20.4C9.8 18 8.6 15.1 8.6 12S9.8 6 12 3.6z" />',
);

/** Host matches are suffix-based, so sub-domains of a network resolve to its mark. */
const networks = [
	{
		name: 'GitHub',
		hosts: ['github.com'],
		icon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2.17c-3.2.7-3.88-1.42-3.88-1.42-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z" /></svg>',
	},
	{
		name: 'B站',
		hosts: ['bilibili.com'],
		icon: strokeIcon(
			'<rect x="3" y="7.5" width="18" height="13" rx="3.2" /><path d="M7 3.5l2.4 3.4M17 3.5l-2.4 3.4" /><path d="M9.6 12.6v2.4M14.4 12.6v2.4" />',
		),
	},
	{
		name: '小红书',
		hosts: ['xiaohongshu.com'],
		icon: strokeIcon(
			'<rect x="3.5" y="3.5" width="17" height="17" rx="5" /><path d="M8 9.5h8M8 12.75h8M8 16h4.5" />',
		),
	},
	{
		name: 'X',
		hosts: ['x.com', 'twitter.com'],
		icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>',
	},
];

function networkFor(url) {
	let host;
	try {
		host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
	} catch {
		return undefined;
	}
	return networks.find((network) => network.hosts.some((known) => host === known || host.endsWith(`.${known}`)));
}

/** Plain text links only: anything richer keeps its own markdown rendering. */
function textLink(node) {
	if (node?.type !== 'link' || !node.children.every((child) => child.type === 'text')) return undefined;
	return { url: node.url, label: node.children.map((child) => child.value).join('').trim() };
}

/** The list item is exactly one link — `- [Label](url)` — otherwise it stays a plain list item. */
function singleLink(item) {
	if (item.type !== 'listItem' || item.children.length !== 1) return undefined;
	const [paragraph] = item.children;
	if (paragraph.type !== 'paragraph' || paragraph.children.length !== 1) return undefined;
	return textLink(paragraph.children[0]);
}

function escapeHtml(value) {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function chip(link) {
	const network = networkFor(link.url);
	const external = /^https?:\/\//i.test(link.url);
	const attrs = external ? ' target="_blank" rel="noreferrer"' : '';
	const label = escapeHtml(link.label || network?.name || link.url);
	return `<a class="social-link" href="${escapeHtml(link.url)}"${attrs}><span class="social-link-icon" aria-hidden="true">${network?.icon ?? linkIcon}</span><span class="social-link-label">${label}</span></a>`;
}

const photoIcon = strokeIcon(
	'<rect x="3" y="4.5" width="18" height="15" rx="2.5" /><circle cx="8.6" cy="10" r="1.6" /><path d="M4 16.6l5-4.6 4 3.6 3-2.6 4 3.6" />',
);

function photoChip(link) {
	return `<a class="photo-link" href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">${photoIcon}<span>${escapeHtml(link.label)}</span></a>`;
}

export function remarkProfileLinks() {
	return (tree, file) => {
		if (!resumeFile.test(file?.path ?? '')) return;

		visit(tree, 'list', (node, index, parent) => {
			if (index === undefined || !parent) return;
			const links = node.children.map(singleLink);
			if (links.some((link) => !link)) return;
			parent.children[index] = {
				type: 'html',
				value: `<div class="social-links">${links.map(chip).join('')}</div>`,
			};
		});

		visit(tree, 'link', (node, index, parent) => {
			if (!imageFile.test(node.url)) return;
			const link = textLink(node);
			if (link?.label && index !== undefined && parent) {
				parent.children[index] = { type: 'html', value: photoChip(link) };
				return;
			}
			node.data = {
				...node.data,
				hProperties: { ...node.data?.hProperties, target: '_blank', rel: 'noreferrer' },
			};
		});
	};
}
