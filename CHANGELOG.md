# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Favicons generated from the avatar: `favicon.png` and `apple-touch-icon.png` are derived from `public/asset/avatar.jpg`, the same image the home hero and About page use
- `src/lib/public-surfaces.ts`: the single source of truth for the machine-readable endpoints the footer links (locale-scoped vs site-wide)
- Root `wrangler.jsonc`: the site deploys as a Cloudflare Worker with static assets (`npm run build`, then `npx wrangler deploy` uploading `./dist`)
- Header spark button: the ⌘K ask/search overlay now has a trigger on every page (reuses `ask.openAria` / `ask.openTitle`, previously unused copy)
- `ask.staticNote`, `askSearch.noResults`, and `askSearch.aiFallbackSearch` copy for builds without a remote Ask endpoint
- Site stats and per-article counters: the site Worker serves same-origin `/api/stats/page` and `/api/stats/total` from a new D1 database (`worker/`, binding `STATS_DB`); the home page shows post/note counts plus total views (`src/components/SiteStats.astro`) and every article/note shows views with a like button (`src/components/PageStats.astro`). Counts are IP-free (likes dedupe through a weekly HMAC pseudonym) and the widget hides itself when the API is unavailable
- `npm run deploy`, `npm run db:migrate`, `npm run db:migrate:local`, `npm run dev:worker`, and `npm run test:stats` scripts

### Changed

- `/ask` and its overlay stop promising a live answer when the build has no `ask.askUrl`: the page says it searches the published content, submit runs the static index only, and the overlay's fallback link points at that search instead of "live AI"
- `/api/search-index.json` also indexes notes (new `notes` array, `items[].type: 'note'`), so ⌘K and `/ask` search notes alongside articles and curated answers
- Disabled Pagefind (`pagefind: false`) — site search is the `/ask` index, so the unused ~850 KB index is no longer built
- Zero series is a supported state: `content/series/<locale>/series.json` may carry an empty `order`, and no `/writing/<series>/` page, `/writing/` series grid, llms.txt section, or footer link is emitted
- Footer link list is generated from `public-surfaces.ts` (adds `/llms-full.txt`, `/rss.xml`, `/api/profile.json`, `/api/articles.json`, `/api/topics.json`) and `npm run verify` fails when a listed path is missing from `dist`
- Footer brand shows `brand[locale].wordmark` (matching the header) and links home; series links carry a prefix so they no longer read as duplicates of the collection above them; the bottom badge moved into the locale copy

### Fixed

- `/openapi.json` no longer ships the NLWeb Ask/MCP schemas in static mode, and its `info.description` states that no remote endpoint is configured
- Curated-answer links inside `/ask` search results lost the locale prefix and deploy base (`/ask/?q=…` was hardcoded)
- Entries without a `series` no longer publish `专栏：Article` in `/llms-full.txt` or `seriesName: "Article"` in the search index
- Footer linked every English page at `/en/openapi.json` and `/en/.well-known/about.json`, which are site-wide files and were never generated under a locale prefix

## [2.0.0] - 2026-09-11

### Removed

- Legacy draft MCP discovery paths `/.well-known/mcp.json`, `/.well-known/mcp/catalog.json`, and `/.well-known/mcp/server-card.json` (builders, fixtures, verify must-exist rules, and llms/about pointers) — **breaking** for clients that still probed those URLs ([#18](https://github.com/tower1229/Refined-X/issues/18); time-boxed early-retirement exception recorded on the issue)
- Site config keys used only by those shapes: `mcp.serverName`, `mcp.packageIdentifier`, `mcp.airIdentifier`, `mcp.discoveryMetaKey` (and the whole `mcp` config object). Static identity for remaining surfaces is `title` / brand only

### Migration

- Prefer configured `ask.mcpUrl` (primary), `/openapi.json`, and `/.well-known/about.json`
- Last **tagged** release that still emitted the legacy discovery files: **1.1.0**
- #14 marked them `legacy-draft-compatibility` on Unreleased/dev only (never tagged); this change removes them under the time-boxed exception on [#18](https://github.com/tower1229/Refined-X/issues/18)
- No `/.well-known/ai-catalog.json` / SEP-2127 path is added in this change
- Core dual-era Worker `POST /mcp` and NLWeb `POST /ask` remain; upgrade the Worker alongside the site when Live Ask is enabled
- Instance overlays that still set retired `mcp` keys are ignored with a console warning
- Do not set `ask.protocolProfile: dual-era` until that instance’s deployment acceptance is recorded; default stays `undeclared`

### Added

- Build-time `public-capabilities` model and `ask.protocolProfile` (`undeclared` default; opt-in `dual-era` after deployment acceptance)
- Capability-aware OpenAPI (conditional Ask/MCP POSTs, full URL reconstruction including path prefixes) and verify helpers (including AWP must-not-exist checks and retired legacy MCP must-not-exist checks)
- Dual-era MCP adapter on Public Ask Worker `POST /mcp` via pinned `@modelcontextprotocol/server@2.0.0` (modern + legacy on one handler / one `ask` tool)
- Worker `PUBLIC_MCP_ORIGIN` Host allowlist for `/mcp`, offline workerd protocol integration (`npm run test:mcp-protocol`)
- MCP request body stream-capped at 16 KiB; final HTTP body bound with cancel/timeout and §6.2/§7.1 protocol coverage in unit + workerd tests
- Product-client support matrix and acceptance records ([#16](https://github.com/tower1229/Refined-X/issues/16)): Claude Code modern + Codex CLI legacy on synthetic mock; extended clients stay `not_run`
- Optional AWP discovery experiment ([#17](https://github.com/tower1229/Refined-X/issues/17)): `discovery.awp` (default off) builds byte-identical `/agent.json` and `/.well-known/agent.json` from shared capabilities (static read actions only; MCP via `protocols.mcp` when dual-era profile is set)

### Changed

- Product-client acceptance final gates: expected protocol path (`modern`/`legacy`) must match all successful business calls; summarize requires `askMode=summarize` + `SearchSummary`; error handling requires `tools/call` 401/403; incomplete/`input_required` results are not success; success phases require CLI exit `0` with no kill signal or spawn error (`null` status fails); truncated SSE bodies are not keyword-guessed as final success
- Site-relative navigation, Ask search (`/api/search-index.json`), and page links use `withBase()` / Astro `BASE_URL` so subpath deploys stay under the configured prefix; SEO canonical/`og:url` strip the deploy base before `absoluteUrl` so the prefix is not doubled
- Product-client acceptance harness hardened: bind gates to `tools/call` + `toolIsError`, require HTTP 401/403 for error handling (no CLI-text false positives), record `gitSha`, run `test:mcp-protocol` for `offlineIntegration`, fail the script on core gate failure; stop defaulting Claude acceptance to a third-party Anthropic-compatible base URL
- OpenAPI Ask documents buffered SSE (`text/event-stream`) alongside JSON; MCP documents conditional protocol headers and `202`/`401` without making modern headers globally required
- Site absolute URLs and Astro `base` derive from `site` pathname so subpath deployments keep Profile / Markdown / OpenAPI / AWP prefixes consistent
- AWP #17 follow-up: plan/README sync for `discovery.awp`, shared phase-1 action allowlist, drop unused `search_index` entity, and tighten static-API output-key fixture contract
- Verify forbids `/.well-known/ai-catalog.json` in dist alongside retired legacy MCP discovery paths
- `/.well-known/about.json` no longer exposes retired catalog/server-card/`mcp.json` URL fields
- Illegal `ask.*` URLs, unknown `protocolProfile`, and Ask/MCP pathnames that collide with static OpenAPI paths fail during site config load
- Hand-rolled MCP initialize/tools dispatcher removed; domain auth/quota codes live in tool error content with HTTP status remapping (no string JSON-RPC business codes)
- README ZH/EN and deploy docs distinguish CI-verified dual-era MCP from product-client matrix statuses (`passed` vs `not_run`)
- Ask UI treats incomplete NLWeb SSE (stream ended without a complete event) as an explicit `incomplete_stream` error with locale copy

### Dependencies

- Site: Astro 7.3.x / Starlight 0.42.x and related lockfile bumps merged on `main` before this tag
- Worker: wrangler / undici / sharp lockfile bumps for `examples/public-ask-worker`

## [1.1.0] - 2026-09-01

### Added

- Optional giscus comments on article pages through four public instance configuration fields
- Stable per-article discussion mapping, locale-aware copy, lazy loading, and synchronized light/dark themes
- Build-time validation for partial comment configuration and generated-surface verification

### Changed

- Article footers now reserve a restrained editorial discussion area when comments are configured

## [1.0.0] - 2026-07-31

First stable release of Refined-X as an agent-ready personal publishing starter.

### Added

- Editorial static site from Markdown/YAML (`content/`) with articles, series, projects, answers, and profile surfaces
- Machine-readable outputs: per-page Markdown mirrors, `llms.txt` / `llms-full.txt`, JSON APIs, OpenAPI, and well-known discovery documents
- Optional Live Ask via the reference Cloudflare Worker (`examples/public-ask-worker`): NLWeb-compatible `POST /ask`, Streamable HTTP MCP `ask`, and `/health`
- Content independence: `contentRoot`, `publicDir`, `outDir`, and `instance.config.mjs` / `REFINED_X_INSTANCE_CONFIG` overlays
- Locale packs (`en`, `zh-CN`), light/dark themes, and static Ask search without a backend
- Quality gates: `astro check`, Node test suites, post-build `verify`, and GitHub Actions CI
- End-user static deploy guides (GitHub Pages workflow template, Cloudflare Pages settings) and Live Ask troubleshooting docs
- Trust assets: Changelog, Contributing, Security policy, Issue/PR templates, and a public product roadmap

### Known limitations

- The MCP catalog under `/.well-known/mcp/` remains marked **draft**; treat discovery metadata as advisory, not a guarantee of automatic client pickup
- Live Ask is an optional sibling deploy (Cloudflare AI Search, Gateway, D1, Turnstile); it is not required for the static site
- Live Ask does not provide long-term memory, arbitrary tool actions, elicitation, or impersonation of the site owner

[1.0.0]: https://github.com/tower1229/Refined-X/releases/tag/v1.0.0
[1.1.0]: https://github.com/tower1229/Refined-X/releases/tag/v1.1.0
[2.0.0]: https://github.com/tower1229/Refined-X/releases/tag/v2.0.0
