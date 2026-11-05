/** Blur-fade delay for the Nth about-page photo, in seconds. Matches Magic UI's 0.25 + index * 0.05. */
export function blurFadeDelaySeconds(index: number): number {
	return 0.25 + index * 0.05;
}

export function lensPoint(
	clientX: number,
	clientY: number,
	rect: { left: number; top: number },
): { x: number; y: number } {
	return { x: clientX - rect.left, y: clientY - rect.top };
}

function motionReduced(): boolean {
	return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function placeLens(frame: HTMLElement, x: number, y: number) {
	frame.style.setProperty('--lx', `${x}px`);
	frame.style.setProperty('--ly', `${y}px`);
	frame.classList.add('is-lens');
}

function bindLens(frame: HTMLElement) {
	const show = (clientX: number, clientY: number) => {
		const rect = frame.getBoundingClientRect();
		const point = lensPoint(clientX, clientY, rect);
		placeLens(frame, point.x, point.y);
	};
	frame.addEventListener('pointerenter', (event) => show(event.clientX, event.clientY));
	frame.addEventListener('pointermove', (event) => show(event.clientX, event.clientY));
	frame.addEventListener('pointerleave', () => frame.classList.remove('is-lens'));

	const link = frame.closest('a');
	link?.addEventListener('focus', () => {
		const rect = frame.getBoundingClientRect();
		placeLens(frame, rect.width / 2, rect.height / 2);
	});
	link?.addEventListener('blur', () => frame.classList.remove('is-lens'));
	link?.addEventListener('keydown', (event) => {
		if (event.key === 'Escape') frame.classList.remove('is-lens');
	});
}

/**
 * Blur-fade each about-page photo as it enters, and follow the pointer with a lens.
 * Without script, or with reduced motion, the photos stay fully visible.
 */
export function initPhotoCards(doc: Document = document) {
	const frames = [...doc.querySelectorAll<HTMLElement>('[data-blur-fade]')];
	if (frames.length === 0) return;
	const canObserve = !motionReduced() && typeof IntersectionObserver === 'function';
	frames.forEach((frame, index) => {
		frame.style.setProperty('--bf-delay', `${blurFadeDelaySeconds(index)}s`);
		if (!canObserve) frame.classList.add('is-visible');
		else frame.classList.add('is-pending');
		bindLens(frame);
	});
	if (!canObserve) return;
	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting || !(entry.target instanceof HTMLElement)) continue;
				entry.target.classList.remove('is-pending');
				entry.target.classList.add('is-visible');
				observer.unobserve(entry.target);
			}
		},
		{ rootMargin: '-50px', threshold: 0 },
	);
	for (const frame of frames) observer.observe(frame);
}
