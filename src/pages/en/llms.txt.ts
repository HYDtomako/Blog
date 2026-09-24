import { buildLlmsText } from '../../lib/public-feeds';

export function GET() {
	return buildLlmsText('en');
}
