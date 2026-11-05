const TOP_OFFSET = 96;

function headingFor(id: string) {
	return document.getElementById(id);
}

/** Smooth-scroll the about rail. The current section picks up `is-active`. */
export function initAboutToc(root: ParentNode = document) {
	const scopes = Array.from(root.querySelectorAll<HTMLElement>('[data-about-toc]'));
	if (!scopes.length) return;

	const links = scopes.flatMap((scope) =>
		Array.from(scope.querySelectorAll<HTMLAnchorElement>('a[data-toc-slug]')),
	);
	const headings: HTMLElement[] = [];
	const seen = new Set<string>();
	for (const link of links) {
		const id = link.dataset.tocSlug ?? '';
		if (!id || seen.has(id)) continue;
		const heading = headingFor(id);
		if (!heading) continue;
		seen.add(id);
		headings.push(heading);
	}
	if (!headings.length) return;

	const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	for (const link of links) {
		link.addEventListener('click', (event) => {
			const id = link.dataset.tocSlug ?? '';
			const target = headingFor(id);
			if (!target) return;
			event.preventDefault();
			target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
			history.pushState(null, '', `#${id}`);
		});
	}

	const mark = (id: string) => {
		for (const link of links) link.classList.toggle('is-active', link.dataset.tocSlug === id);
	};
	const update = () => {
		let active = headings[0].id;
		for (const heading of headings) {
			if (heading.getBoundingClientRect().top <= TOP_OFFSET + 8) active = heading.id;
		}
		mark(active);
	};
	window.addEventListener('scroll', () => requestAnimationFrame(update), { passive: true });
	window.addEventListener('hashchange', update);
	update();
}
