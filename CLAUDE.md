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
