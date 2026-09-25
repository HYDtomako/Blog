import { buildSearchIndexJson } from '../../lib/public-feeds';

export function GET() {
	return buildSearchIndexJson();
}
