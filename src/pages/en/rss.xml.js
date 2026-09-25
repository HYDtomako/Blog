import { buildRssFeed } from '../../lib/public-feeds';

export function GET() {
	return buildRssFeed('en');
}
