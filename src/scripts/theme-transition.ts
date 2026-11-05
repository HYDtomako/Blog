/**
 * Circle clip-path pair for the header theme toggle.
 * Percentages stay correct under fractional display scales: the view-transition
 * snapshot box is the layout viewport, matching Magic UI's circle variant.
 */

export type RevealRect = { left: number; top: number; width: number; height: number };

export function revealOrigin(
	rect: RevealRect,
	viewportWidth: number,
	viewportHeight: number,
	fromCenter = false,
): { x: number; y: number } {
	if (fromCenter) return { x: viewportWidth / 2, y: viewportHeight / 2 };
	return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

export function maxRevealRadius(
	x: number,
	y: number,
	viewportWidth: number,
	viewportHeight: number,
): number {
	return Math.hypot(Math.max(x, viewportWidth - x), Math.max(y, viewportHeight - y));
}

/** `[collapsed, expanded]` circle clip paths, both in percentages of the snapshot box. */
export function circleRevealClipPaths(
	x: number,
	y: number,
	maxRadius: number,
	viewportWidth: number,
	viewportHeight: number,
): [string, string] {
	const point = `${(x / viewportWidth) * 100}% ${(y / viewportHeight) * 100}%`;
	const radius = (maxRadius / (Math.hypot(viewportWidth, viewportHeight) / Math.SQRT2)) * 100;
	return [`circle(0% at ${point})`, `circle(${radius}% at ${point})`];
}
