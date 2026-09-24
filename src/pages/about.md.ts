import { buildAboutMarkdown } from '../lib/public-feeds';

export function GET() {
	return buildAboutMarkdown();
}
