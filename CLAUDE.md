## Development

```sh
npm install
npm run dev
```

Build and verify:

```sh
npm run build
npm run verify
```

`npm run verify` fails when `/ask` ships without its Turnstile widget, so the build needs the public
site key (`PUBLIC_TURNSTILE_SITE_KEY` in the environment, or a gitignored `.env.production`).

`npm run build` starts with `npm run sync:github`, which refreshes the GitHub contribution
snapshot (`content/github-activity.json`, rendered by `src/components/GitHubActivity.astro`) and
the `stars` field of matching `content/projects/<locale>/*.yaml` entries from
`siteConfig.social.github`. It keeps the previous snapshot and warns when GitHub is unreachable.

## Stats counters

Page-view and like counts are served by the site Worker itself (`worker/`, D1 `your-blog-stats`) on
the same-origin `/api/stats/*` paths; articles and notes render `src/components/PageStats.astro`,
the home page renders `src/components/SiteStats.astro`, both gated by `stats.enabled` in
`site.config.mjs`. The API is optional at runtime: when it is unreachable the counters stay hidden
and the rest of the page is unaffected.

```sh
npm run db:migrate:local   # apply worker/migrations to the local D1
npm run dev:worker         # wrangler dev: ./dist assets plus the stats API
npm run db:migrate         # apply migrations to the remote D1
npm run deploy             # build + verify + migrate + wrangler deploy
```

## Links

`/links/` and `/en/links/` render `src/components/pages/LinksPage.astro`, which mounts
`src/components/LinksSonar.astro`: every entry of `content/links.json` is a signal on one deep-sea
sonar. Placement is a pure function of the URL (`src/lib/links.ts`) — `signalDepth(url)` (60–900 m)
decides the radius, the URL hash the angle, and a deterministic relaxation pass keeps dots at least
0.155 sonar-radii apart — so a site keeps its spot on every build, and the dots ship in the SSR
markup, which is why the page works without JavaScript. The 18 s sweep, the pulse and ripple it
triggers when it crosses a dot, the start-up beats (node → rings → sweep → signals) and the entry
animation are CSS-only: `--ls-turn` delays each ripple by that dot's fraction of the revolution, and
the sweep itself is a rotating conic gradient with a 60° tail, so the browser composites one layer
instead of repainting a beam. Dots differ by a few percent in size and about one in eight is hollow;
that variation is drawn from the same URL hash and means nothing.

`content/links.json` is the only source of truth: `{ url, name?, description?, icon? }`. `npm run
sync:links` (`scripts/sync-links.mjs`, wired into `prebuild`) fills the three optional fields from
the site's own head tags, never overwrites an authored field, keeps the previous values when a site
is unreachable, and never fails the build; the parser lives in `shared/link-metadata.ts`, so the
Worker reads a submitted site exactly the way the build reads an authored one.

`src/scripts/links-sonar.ts` is the only client code on the page. It places the HUD card inside the
stage (hover/focus on fine pointers, first tap on coarse ones), dims the rest of the field, and drives
the public wall below: `GET /api/links` renders the newest submissions (a row per link, `waiting` or
`on the sonar` when its URL is already in `content/links.json`), and `POST /api/links` adds one. The
route (`worker/links-service.ts`, `worker/links-store.ts`, D1 table from
`worker/migrations/0003_links.sql`) reuses the weekly actor pseudonym and `LINKS_RATE_LIMITER`, fetches
the target site (6 s timeout, HTML only, ≤256 KB, public http(s) hosts only) and stores the link. The
wall is public the moment it is sent — nobody has to approve a row — but a row is never a sonar signal:
publishing stays a hand edit of `content/links.json`. Wall links carry `rel="nofollow ugc"`, and the API
never returns the actor pseudonym. `links.enabled` in `site.config.mjs` hides the composer and the wall
together, and `npm run test:links` covers the metadata parser, the layout maths, the wall and the page
behaviour.

## Documentation

- Product positioning: `PRODUCT.md`
- Design system: `DESIGN.md`
- User README: `README.md`
- Astro: https://docs.astro.build

Config entrypoint: `site.config.mjs` (optional overlay `../instance.config.mjs`).

## Locales

Two locales ship by default: `zh-CN` (default, served at `/`) and `en` (served at `/en/`).

- Locales and per-locale brand copy live in `site.config.mjs` under `locales` and `brand`.
- Content is grouped per locale: `content/<collection>/<locale>/…`. `generateDocId` in
  `src/content.config.ts` turns the locale folder into the URL prefix (`en/…`) that
  Starlight routes to `/<locale>/…`.
- `src/lib/locale.ts` resolves a locale from a request path; `src/lib/site-copy.ts` exposes
  `getSiteCopy(locale)` for chrome and brand copy; `src/lib/locale-routes.ts` lists what each
  locale publishes and resolves the header language switch target.
- Hub pages are locale-agnostic components in `src/components/pages/`, rendered by thin route
  files at `src/pages/…` (default locale) and `src/pages/en/…` (English). Machine-readable
  endpoints follow the same pattern, e.g. `src/pages/llms.txt.ts` and `src/pages/en/llms.txt.ts`.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues (`gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.
