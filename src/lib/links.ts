import {
	MAX_SIGNAL_DEPTH,
	MIN_SIGNAL_DEPTH,
	domainOf,
	formatDepth,
	hashString,
	normalizeSubmittedUrl,
	signalDepth,
	type LinkEntry,
} from '../../shared/link-metadata.ts';

/** One signal as it lands on the sonar: stable placement plus what its card shows. */
export type PlacedSignal = {
	url: string;
	name: string;
	description?: string;
	icon?: string;
	domain: string;
	depth: number;
	depthLabel: string;
	/** Catalogue number, numbered by depth so deeper signals were detected later. */
	signal: number;
	signalLabel: string;
	/** Radians from the sonar centre. */
	angle: number;
	/** Fraction of the sonar radius, plus the unit-square position of the dot. */
	radius: number;
	x: number;
	y: number;
	/** Fraction of a full turn, so CSS can delay each ripple by `var(--turn) * sweep`. */
	turn: number;
	/** Position in depth order, used to stagger the entry animation. */
	index: number;
	/** Micro-variation of the dot, drawn from the same hash; it never means anything. */
	scale: number;
	variant: SignalVariant;
};

/** `ring` reads as ◉, `solid` as ●: the brief allows a tiny difference, nothing more. */
export type SignalVariant = 'solid' | 'ring';

export type SignalSummary = { count: number; minDepth: number; maxDepth: number };

/** Dots stay between these fractions of the sonar radius: never in the centre, never on the rim. */
export const SIGNAL_RADIUS_FLOOR = 0.25;
export const SIGNAL_RADIUS_CEILING = 0.85;
/** Closest two dots may sit, again as a fraction of the sonar radius. */
export const SIGNAL_MIN_SEPARATION = 0.155;
/** The sonar circle inscribed in the square stage: its radius as a fraction of the stage side. */
export const SONAR_RADIUS_STAGE = 0.5;
/** Dots differ by a few percent in size, and roughly one in eight is drawn hollow. */
export const DOT_SCALE_MIN = 0.86;
export const DOT_SCALE_MAX = 1.12;
export const RING_VARIANT_SHARE = 0.125;

const SIGNAL_BAND_MIN = 0.35;
const SIGNAL_BAND_MAX = 0.8;
const ANGLE_JITTER = 0.14;
const RADIUS_JITTER = 0.035;
const RELAXATION_PASSES = 80;
const TWO_PI = Math.PI * 2;

type SignalPoint = { x: number; y: number; pinned: boolean };
type Placement = { angle: number; radius: number; depth: number; scale: number; variant: SignalVariant };

/** mulberry32: small, fast, and identical on every runtime that runs this module. */
function mulberry32(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

/** `radius` is a fraction of the sonar radius; dots live in the square stage's unit space. */
function toPoint(radius: number, angle: number): SignalPoint {
	const offset = radius * SONAR_RADIUS_STAGE;
	return { x: 0.5 + offset * Math.cos(angle), y: 0.5 + offset * Math.sin(angle), pinned: false };
}

const MIN_SEPARATION_STAGE = SIGNAL_MIN_SEPARATION * SONAR_RADIUS_STAGE;

function clampToBand(point: SignalPoint): void {
	const dx = point.x - 0.5;
	const dy = point.y - 0.5;
	const radius = Math.hypot(dx, dy);
	if (radius === 0) {
		point.x = 0.5 + SIGNAL_RADIUS_FLOOR * SONAR_RADIUS_STAGE;
		return;
	}
	const clamped = clamp(
		radius,
		SIGNAL_RADIUS_FLOOR * SONAR_RADIUS_STAGE,
		SIGNAL_RADIUS_CEILING * SONAR_RADIUS_STAGE,
	);
	if (clamped === radius) return;
	point.x = 0.5 + (dx / radius) * clamped;
	point.y = 0.5 + (dy / radius) * clamped;
}

/**
 * Depth decides how far out a signal sits, the URL hash decides where around the circle.
 * Both jitters are drawn from the same seed, so a URL keeps its spot between builds;
 * the dot's size and variant come from that same seed and carry no meaning at all.
 */
export function signalPlacement(url: string): Placement {
	const random = mulberry32(hashString(url));
	const turn = random() * TWO_PI + (random() - 0.5) * 2 * ANGLE_JITTER;
	const angle = ((turn % TWO_PI) + TWO_PI) % TWO_PI;
	const depth = signalDepth(url);
	const band = (depth - MIN_SIGNAL_DEPTH) / (MAX_SIGNAL_DEPTH - MIN_SIGNAL_DEPTH);
	const radius = clamp(
		SIGNAL_BAND_MIN + band * (SIGNAL_BAND_MAX - SIGNAL_BAND_MIN) + (random() - 0.5) * 2 * RADIUS_JITTER,
		SIGNAL_RADIUS_FLOOR,
		SIGNAL_RADIUS_CEILING,
	);
	const scale = DOT_SCALE_MIN + random() * (DOT_SCALE_MAX - DOT_SCALE_MIN);
	const variant: SignalVariant = random() < RING_VARIANT_SHARE ? 'ring' : 'solid';
	return { angle, radius, depth, scale, variant };
}

/**
 * Pushes dots apart until none sits closer than `SIGNAL_MIN_SEPARATION`, in a fixed
 * pair order so the result is deterministic. Dots are kept inside the radius band,
 * and pinned dots (already rendered) never move.
 */
function separatePoints(points: SignalPoint[]): void {
	for (let pass = 0; pass < RELAXATION_PASSES; pass += 1) {
		let moved = false;
		for (let i = 0; i < points.length; i += 1) {
			for (let j = i + 1; j < points.length; j += 1) {
				const a = points[i];
				const b = points[j];
				let dx = b.x - a.x;
				let dy = b.y - a.y;
				let distance = Math.hypot(dx, dy);
				if (distance >= MIN_SEPARATION_STAGE) continue;
				const movable = (a.pinned ? 0 : 1) + (b.pinned ? 0 : 1);
				if (movable === 0) continue;
				moved = true;
				if (distance < 1e-6) {
					dx = Math.cos(i + j);
					dy = Math.sin(i + j);
					distance = 1;
				}
				const push = (MIN_SEPARATION_STAGE - distance) / movable;
				const ux = (dx / distance) * push;
				const uy = (dy / distance) * push;
				if (!a.pinned) {
					a.x -= ux;
					a.y -= uy;
					clampToBand(a);
				}
				if (!b.pinned) {
					b.x += ux;
					b.y += uy;
					clampToBand(b);
				}
			}
		}
		if (!moved) break;
	}
}

function toTurn(angle: number): number {
	return angle < 0 ? angle / TWO_PI + 1 : angle / TWO_PI;
}

/** The whole link list, placed and numbered: the sonar is a pure function of `content/links.json`. */
export function layoutSignals(entries: LinkEntry[]): PlacedSignal[] {
	const placements = entries.map((entry) => signalPlacement(entry.url));
	const points = placements.map(({ radius, angle }) => toPoint(radius, angle));
	separatePoints(points);

	return entries
		.map((entry, at) => ({ entry, placement: placements[at], point: points[at] }))
		.sort((a, b) => a.placement.depth - b.placement.depth || a.entry.url.localeCompare(b.entry.url))
		.map(({ entry, placement, point }, index) => {
			const angle = Math.atan2(point.y - 0.5, point.x - 0.5);
			const signal = index + 1;
			return {
				url: entry.url,
				name: entry.name?.trim() || domainOf(entry.url),
				description: entry.description?.trim() || undefined,
				icon: entry.icon?.trim() || undefined,
				domain: domainOf(entry.url),
				depth: placement.depth,
				depthLabel: formatDepth(placement.depth),
				signal,
				signalLabel: `#${String(signal).padStart(3, '0')}`,
				angle,
				radius: Math.hypot(point.x - 0.5, point.y - 0.5) / SONAR_RADIUS_STAGE,
				x: point.x,
				y: point.y,
				turn: toTurn(angle),
				index,
				scale: placement.scale,
				variant: placement.variant,
			};
		});
}

/** A signal waiting for review: placed among the live ones, but never moving them. */
export function placePendingSignal(
	placed: readonly { x: number; y: number }[],
	url: string,
): Pick<
	PlacedSignal,
	'depth' | 'depthLabel' | 'x' | 'y' | 'radius' | 'angle' | 'turn' | 'scale' | 'variant'
> {
	const placement = signalPlacement(url);
	const points = placed.map((signal) => ({ x: signal.x, y: signal.y, pinned: true }));
	points.push(toPoint(placement.radius, placement.angle));
	separatePoints(points);
	const point = points[points.length - 1];
	const angle = Math.atan2(point.y - 0.5, point.x - 0.5);
	return {
		depth: placement.depth,
		depthLabel: formatDepth(placement.depth),
		x: point.x,
		y: point.y,
		radius: Math.hypot(point.x - 0.5, point.y - 0.5) / SONAR_RADIUS_STAGE,
		angle,
		turn: toTurn(angle),
		scale: placement.scale,
		variant: placement.variant,
	};
}

export function summarizeSignals(placed: PlacedSignal[]): SignalSummary {
	if (placed.length === 0) return { count: 0, minDepth: 0, maxDepth: 0 };
	const depths = placed.map((signal) => signal.depth);
	return { count: placed.length, minDepth: Math.min(...depths), maxDepth: Math.max(...depths) };
}

/**
 * Validates the authored list: rows without a public http(s) url are skipped and a
 * repeated url keeps its first appearance, so a typo never takes the page down.
 */
export function readLinkEntries(value: unknown): LinkEntry[] {
	if (!Array.isArray(value)) return [];
	const seen = new Set<string>();
	const entries: LinkEntry[] = [];
	for (const item of value) {
		if (typeof item !== 'object' || item === null) continue;
		const record = item as Record<string, unknown>;
		const url = normalizeSubmittedUrl(record.url);
		if (url === null || seen.has(url.href)) continue;
		seen.add(url.href);
		const entry: LinkEntry = { url: url.href };
		if (typeof record.name === 'string') entry.name = record.name;
		if (typeof record.description === 'string') entry.description = record.description;
		if (typeof record.icon === 'string') entry.icon = record.icon;
		entries.push(entry);
	}
	return entries;
}
