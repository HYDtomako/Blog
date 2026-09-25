import { buildProfileJson } from '../../lib/public-feeds';

export function GET() {
	return buildProfileJson();
}
