import { buildArticlesJson } from '../../lib/public-feeds';

export function GET() {
	return buildArticlesJson();
}
