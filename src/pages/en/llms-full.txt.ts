import { buildLlmsFullText } from '../../lib/public-feeds';

export function GET() {
	return buildLlmsFullText('en');
}
