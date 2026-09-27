/**
 * Link metadata shared by the site build, `npm run sync:links`, and the site Worker:
 * URL normalization for submitted signals plus the head tags a signal card shows.
 * No env secrets, DB bindings, Astro modules, or Worker entry imports.
 */

export type LinkMetadata = {
  title?: string;
  description?: string;
  icon?: string;
};

/** One entry of `content/links.json`: only `url` is required, the rest is fetched or authored. */
export type LinkEntry = {
  url: string;
  name?: string;
  description?: string;
  icon?: string;
};

export const MIN_SIGNAL_DEPTH = 60;
export const MAX_SIGNAL_DEPTH = 900;

const MAX_URL_LENGTH = 2048;
const MAX_HTML_LENGTH = 400_000;
const MAX_TEXT_LENGTH = 300;
const FALLBACK_ICON_PATH = "/favicon.ico";
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const HOSTNAME_PATTERN = /^[a-z0-9.-]+$/;
const BLOCKED_HOST_SUFFIXES = [".local", ".internal", ".localhost", ".home.arpa"];
const TITLE_TAG_PATTERN = /<title[^>]*>([\s\S]*?)<\/title>/i;
const META_TAG_PATTERN = /<meta\b[^>]*>/gi;
const LINK_TAG_PATTERN = /<link\b[^>]*>/gi;
const ATTRIBUTE_PATTERN =
  /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;

/** Icon rel values in the order the brief prefers them; anything else ranking after these. */
const ICON_REL_PRIORITY: Record<string, number> = {
  icon: 1,
  "shortcut icon": 2,
  "apple-touch-icon": 3,
  "apple-touch-icon-precomposed": 4,
};

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** FNV-1a over the UTF-8 bytes of `value`; the seed of every stable signal parameter. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * The virtual depth every signal is anchored at. It is a world-building parameter keyed to
 * the URL alone, never a ranking: deeper simply means further from the sonar's centre.
 */
export function signalDepth(url: string): number {
  const span = MAX_SIGNAL_DEPTH - MIN_SIGNAL_DEPTH + 1;
  return MIN_SIGNAL_DEPTH + (hashString(url) % span);
}

export function formatDepth(depth: number): string {
  return `${String(depth).padStart(3, "0")}m`;
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

/**
 * Submissions carry nothing but a URL, so the only gate is a public http(s) address:
 * no credentials, no single-label or private hosts, no fragment.
 */
export function normalizeSubmittedUrl(raw: unknown): URL | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed.length > MAX_URL_LENGTH) return null;
  const candidate = SCHEME_PATTERN.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username !== "" || url.password !== "") return null;
  if (!isPublicHostname(url.hostname)) return null;
  url.hash = "";
  return url;
}

function isPublicHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "" || host.length > 253) return false;
  // Bracket-prefixed literals and anything with a port leftover is an address, not a site.
  if (host.startsWith("[") || host.includes(":")) return false;
  if (host === "localhost") return false;
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return false;
  if (IPV4_PATTERN.test(host)) return false;
  if (!host.includes(".")) return false;
  return HOSTNAME_PATTERN.test(host);
}

/** Head tags of one page: `og:title` → `<title>`, `og:description` → description, icon rel chain. */
export function parseHtmlMetadata(html: string, base: string | URL): LinkMetadata {
  const source = html.length > MAX_HTML_LENGTH ? html.slice(0, MAX_HTML_LENGTH) : html;
  const meta = new Map<string, string>();
  for (const tag of source.matchAll(META_TAG_PATTERN)) {
    const attributes = parseAttributes(tag[0]);
    const key = (attributes.property ?? attributes.name ?? "").trim().toLowerCase();
    const content = attributes.content;
    if (key === "" || content === undefined || meta.has(key)) continue;
    meta.set(key, content);
  }

  const iconHref = readIconHref(source);
  const metadata: LinkMetadata = {};
  const title = clean(meta.get("og:title")) ?? clean(TITLE_TAG_PATTERN.exec(source)?.[1]);
  const description = clean(meta.get("og:description")) ?? clean(meta.get("description"));
  const icon = resolveIcon(iconHref, base);
  if (title !== undefined) metadata.title = title;
  if (description !== undefined) metadata.description = description;
  if (icon !== undefined) metadata.icon = icon;
  return metadata;
}

function readIconHref(source: string): string | undefined {
  let best: { priority: number; href: string } | null = null;
  for (const tag of source.matchAll(LINK_TAG_PATTERN)) {
    const attributes = parseAttributes(tag[0]);
    const rel = (attributes.rel ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean).join(" ");
    const href = attributes.href?.trim();
    if (href === undefined || href === "" || !rel.includes("icon")) continue;
    const priority = ICON_REL_PRIORITY[rel] ?? 9;
    if (best === null || priority < best.priority) best = { priority, href };
  }
  return best?.href;
}

/** Absolute http(s) icon for `href`, falling back to the site's own `/favicon.ico`. */
export function resolveIcon(href: string | undefined, base: string | URL): string | undefined {
  const fallback = (() => {
    try {
      return `${new URL(base).origin}${FALLBACK_ICON_PATH}`;
    } catch {
      return undefined;
    }
  })();
  if (href === undefined || href.trim() === "") return fallback;
  try {
    const resolved = new URL(href.trim(), base);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return fallback;
    return resolved.href;
  } catch {
    return fallback;
  }
}

/** Authored values always win: a sync only ever fills the fields still missing. */
export function mergeLinkMetadata(entry: LinkEntry, metadata: LinkMetadata): LinkEntry {
  const merged: LinkEntry = { url: entry.url };
  const name = firstText(entry.name, metadata.title);
  const description = firstText(entry.description, metadata.description);
  const icon = firstText(entry.icon, metadata.icon);
  if (name !== undefined) merged.name = name;
  if (description !== undefined) merged.description = description;
  if (icon !== undefined) merged.icon = icon;
  return merged;
}

function firstText(...values: (string | undefined)[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return undefined;
}

function parseAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of tag.matchAll(ATTRIBUTE_PATTERN)) {
    const name = match[1].toLowerCase();
    if (name in attributes) continue;
    attributes[name] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attributes;
}

function clean(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const text = decodeEntities(value).replace(/\s+/g, " ").trim();
  if (text === "") return undefined;
  if (text.length <= MAX_TEXT_LENGTH) return text;
  return `${text.slice(0, MAX_TEXT_LENGTH - 1).trimEnd()}…`;
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#")) {
      const hexadecimal = entity[1]?.toLowerCase() === "x";
      const code = Number.parseInt(hexadecimal ? entity.slice(2) : entity.slice(1), hexadecimal ? 16 : 10);
      if (!Number.isSafeInteger(code) || code <= 0 || code > 0x10ffff) return match;
      return String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}
