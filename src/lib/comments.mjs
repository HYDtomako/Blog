/** Page path Twikoo uses to keep one thread per article. */
export function articleCommentPath(entryId) {
	const id = String(entryId ?? '').replace(/^\/+|\/+$/g, '');
	return `/${id}/`;
}

/**
 * Twikoo is on only when `envId` is an absolute URL.
 * Empty stays off. `https://` is the public form; `http://127.0.0.1` and
 * `http://localhost` are accepted so a local `wrangler dev` URL can be used.
 */
export function resolveCommentsConfig(input = {}) {
	const raw = String(input.envId ?? '').trim();
	if (!raw) return { envId: '', enabled: false };

	let url;
	try {
		url = new URL(raw);
	} catch {
		throw new Error('comments.envId 必须是包含协议的完整 URL');
	}

	const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
	const allowed = url.protocol === 'https:' || (url.protocol === 'http:' && local);
	if (!allowed) {
		throw new Error(
			'comments.envId 必须是 https:// 开头的完整 URL；本地 wrangler dev 可以用 http://127.0.0.1 或 http://localhost',
		);
	}

	const path = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '');
	return { envId: `${url.origin}${path}${url.search}`, enabled: true };
}
