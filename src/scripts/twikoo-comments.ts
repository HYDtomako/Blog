export const TWIKOO_SCRIPT = 'https://cdn.jsdelivr.net/npm/twikoo@1.6.44/dist/twikoo.min.js';

export type TwikooPublicConfig = {
	envId: string;
	el: string;
	path: string;
	lang: string;
};

type TwikooClient = {
	init: (options: TwikooPublicConfig) => Promise<unknown> | unknown;
};

export function twikooLang(locale: string) {
	return locale.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

/** The four fields Twikoo's browser client needs. Nothing else is forwarded. */
export function twikooInitOptions(config: TwikooPublicConfig): TwikooPublicConfig {
	return {
		envId: config.envId,
		el: config.el,
		path: config.path,
		lang: twikooLang(config.lang),
	};
}

function loadTwikoo(doc: Document): Promise<TwikooClient> {
	const view = doc.defaultView as (Window & { twikoo?: TwikooClient }) | null;
	if (view?.twikoo?.init) return Promise.resolve(view.twikoo);

	return new Promise((resolve, reject) => {
		const finish = () => {
			const client = (doc.defaultView as (Window & { twikoo?: TwikooClient }) | null)?.twikoo;
			if (client?.init) resolve(client);
			else reject(new Error('twikoo missing'));
		};
		const existing = doc.querySelector<HTMLScriptElement>('script[data-twikoo-client]');
		if (existing) {
			existing.addEventListener('load', finish, { once: true });
			existing.addEventListener('error', () => reject(new Error('twikoo script')), { once: true });
			return;
		}
		const script = doc.createElement('script');
		script.src = TWIKOO_SCRIPT;
		script.async = true;
		script.dataset.twikooClient = 'true';
		script.addEventListener('load', finish, { once: true });
		script.addEventListener('error', () => reject(new Error('twikoo script')), { once: true });
		doc.head.append(script);
	});
}

export function initTwikooComments(root: HTMLElement, load: typeof loadTwikoo = loadTwikoo) {
	if (root.dataset.twikooInitialized === 'true') return;
	const envId = root.dataset.envId ?? '';
	const path = root.dataset.path ?? '';
	const lang = root.dataset.lang ?? '';
	const mount = root.querySelector<HTMLElement>('[data-twikoo-mount]');
	const status = root.querySelector<HTMLElement>('[data-twikoo-status]');
	if (!envId || !path || !lang || !mount) return;

	const elId = mount.id || 'twikoo-comments';
	mount.id = elId;
	root.dataset.twikooInitialized = 'true';

	const markUnavailable = () => {
		root.classList.add('is-unavailable');
		if (status) status.textContent = root.dataset.unavailableLabel ?? '';
	};

	load(root.ownerDocument)
		.then((twikoo) => twikoo.init(twikooInitOptions({ envId, el: `#${elId}`, path, lang })))
		.then(() => {
			root.classList.add('is-ready');
			if (status) status.hidden = true;
		})
		.catch(markUnavailable);
}
