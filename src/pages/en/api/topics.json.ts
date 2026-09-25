import { buildTopicsJson } from '../../../lib/public-feeds';

export function GET() {
	return buildTopicsJson('en');
}
