import type { CollectionEntry } from 'astro:content';
import { articleMarkdownPaths, buildArticleMarkdown } from '../../../../lib/public-feeds';

interface Props {
	article: CollectionEntry<'docs'>;
}

export function getStaticPaths() {
	return articleMarkdownPaths();
}

export function GET({ props }: { props: Props }) {
	return buildArticleMarkdown(props.article);
}
