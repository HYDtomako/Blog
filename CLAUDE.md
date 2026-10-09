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

Page-view and like counts are served by the site Worker itself (`worker/`, D1 `hydblog-stats`) on
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

## Admin console

`/admin` (`worker/admin.ts`, presentation in `worker/admin-page.ts`) is a dependency-free,
light HTML console served straight from the Worker; every `/api/admin/*` route needs
`Authorization: Bearer <ADMIN_TOKEN>` (a `wrangler secret`). Its Chinese navigation covers
site overview, traffic statistics, link submissions, and guestbook moderation. A separate login
form reuses the saved token, tolerates unavailable storage, and clears it on logout or HTTP 401.
Overview shows lifetime/today/30-day page views (PV, not unique visitors), pending links and
recent activity. Traffic combines a 30-day chart, UTC daily table and searchable page ranking.
Daily views come from `daily_views` (`worker/migrations/0004_daily_views.sql`); likes,
messages and submissions use their creation dates. Views only reach back to that table's
deployment. Lists are limited to 200 rows; page ranking is the top 200 by views, and moderation
filters/counts cover loaded records only. Link approval does not publish a front-page link:
`content/links.json` still needs manual maintenance. Guestbook deletion confirms removal of
a main message, its replies and related likes. Requests have loading/retry states, mutation
buttons are disabled while processing, and stale responses cannot replace a newer view.

## Guestbook

`/guestbook/` and `/en/guestbook/` render `src/components/pages/GuestbookPage.astro`, which mounts
`src/components/GuestbookBoard.astro`: an anonymous message board served by the same site Worker
(`worker/guestbook-service.ts`, `worker/guestbook-store.ts`, D1 `hydblog-stats`) on the same-origin
`/api/guestbook/*` paths, gated by `guestbook.enabled` in `site.config.mjs`. Messages are plain text,
two levels deep (a top-level message plus its replies), with per-visitor likes and retraction of your
own fresh messages; the board stays hidden when the API is unreachable.

Identity and abuse control reuse the stats machinery: `worker/actor.ts` derives a weekly IP pseudonym
from `STATS_ACTOR_SECRET` (without that secret every guestbook route answers 503
`guestbook_unavailable`), `GUESTBOOK_RATE_LIMITER` throttles each visitor, and the store enforces a
10 second cooldown plus per-minute and per-day caps. The actor hash never leaves the server — the API
returns only `mine`, `liked`, and a 4-character `handle`.

```sh
npm run db:migrate:local   # applies worker/migrations, including 0002_guestbook.sql
npm run dev:worker         # ./dist assets plus /api/stats/* and /api/guestbook/*
npm run test:guestbook     # board tests; the worker tests run under npm run test:stats
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
the public wave below: `GET /api/links` renders the newest submissions (a row per link, `waiting` or
`on the sonar` when its URL is already in `content/links.json`), and `POST /api/links` adds one. The
route (`worker/links-service.ts`, `worker/links-store.ts`, D1 table from
`worker/migrations/0003_links.sql`) reuses the guestbook's weekly actor pseudonym and
`LINKS_RATE_LIMITER`, fetches the target site (6 s timeout, HTML only, ≤256 KB, public http(s) hosts
only) and stores the link. The wall is public the moment it is sent — nobody has to approve a row —
but a row is never a sonar signal: publishing stays a hand edit of `content/links.json`. Wall links
carry `rel="nofollow ugc"`, and the API never returns the actor pseudonym. `links.enabled` in
`site.config.mjs` hides the composer and the wall together. `npm run test:links` covers the metadata
parser, the layout maths, the wall and the page behaviour.

## Reading progress ball

Articles (every entry rendered by `src/components/MarkdownContent.astro`), `/projects/`, and `/about/`
mount `src/components/ScrollWaterBall.astro`: a fixed bottom-right ball that fills with ink as the page
is scrolled. `src/scripts/scroll-water-ball.ts` computes `scrollY / (scrollHeight - innerHeight)` and
writes it to the `--ball-progress` custom property, recomputing on resize and whenever the document
height changes. It is decorative apart from the button, which scrolls back to the top (instantly under
`prefers-reduced-motion`). `site.config.mjs` gates it with `readingProgress.enabled` and
`npm run test:ui` covers the ratio maths and the click.

## Documentation

- Product positioning: `PRODUCT.md`
- Design system: `DESIGN.md`
- User README: `README.md`
- Astro: https://docs.astro.build

Config entrypoint: `site.config.mjs` (optional overlay `../instance.config.mjs`).

## Deep-sea intro

`src/components/DeepSeaIntro.astro` renders a full-screen deep-sea diving instrument on the home
page only (`/` and `/en/`, gated by `intro.enabled` in `site.config.mjs`). It is fully
self-contained: no other page ships its markup, its stylesheet, or its script.

- `src/scripts/deep-sea-intro.ts` holds the whole timeline as pure functions —
  `introFrameAt(elapsed)` returns the phase, label, depth, pressure, temperature, the start-up
  ratio and the needle angle for any millisecond — plus `initDeepSeaIntro(doc, win)`, which writes
  `--ds-boot` / `--ds-depth` / `--ds-needle`, the `data-ds-phase` / `data-ds-label` beats and the
  three readouts on one rAF loop, then removes the node. Total run is 7500 ms in six beats:
  a 1.2 s instrument start-up, a 3.5 s descent through the brief's sixteen checkpoints
  (000 → 2000 m in stages of 260/340/100 ms), the 0.5 s breath at DEPTH REACHED, 0.8 s of HYD and
  a 1.5 s hand-off. Pressure is exactly `1 + depth / 10` and temperature falls through a
  300 m thermocline from 18.0 °C to 4.2 °C, both by construction.
- `src/styles/deep-sea-intro.css` is linked from `Head.astro` only when the intro renders, so
  article and hub pages pay nothing for it. Every layer carries its own start-up ramp
  (`--ds-in-*`, derived from `--ds-boot`), which is what makes the case ring, the scale, the
  pointer and the halo appear one after another; the descent itself is driven by `--ds-depth`.
- The overlay is `display: none` unless the document root carries `data-intro="play"`, which is set
  by `introBootScript()` — an inline head script emitted by `Head.astro`. Without JavaScript the
  intro never appears; when the intro bundle fails to load, the same script's `INTRO_FAILSAFE_MS`
  timer removes the overlay and frees the scroll lock.
- Seen state lives in `localStorage` under `refined-x-intro-seen`; `?intro=1` replays the intro,
  `prefers-reduced-motion: reduce` skips it without marking it seen, and `SKIP INTRO` (or `Esc`)
  exits through a compressed reveal.
- `npm run test:intro` covers the curve, the beats, the hold at 2000 m, the skip path, storage
  failures, and the no-JavaScript and bundle-failure paths.

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
