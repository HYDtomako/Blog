English | [简体中文](README.md)

# Blog — an Astro + Starlight personal site you can make your own

A personal publishing site that serves people and agents from one source: Markdown and YAML go in,
an editorial website plus machine-readable surfaces (`llms.txt`, Markdown mirrors, JSON APIs,
OpenAPI, RSS) come out.

This repository is meant to be used as a **template**. Clone it, then work through
[Make it yours](#make-it-yours) and replace every piece of the sample identity with your own.

- Live example: <https://hydblog.xyz/>
- Upstream project: [Refined-X](https://github.com/tower1229/Refined-X) — [demo](https://demo.refined-x.com/)
- Design references: [joyehuang.me](https://www.joyehuang.me/), [demo.refined-x.com](https://demo.refined-x.com/), Astra (the WordPress theme)

## What you get

| Area            | Ships with                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Reading         | Blog (`/writing/`), notes (`/notes/`), projects (`/projects/`), curated answers (`/answers/`), about (`/about/`), topics, light/dark theme, two locales — `zh-CN` at `/` and `en` at `/en/` |
| Asking          | `⌘K` overlay and the `/ask` page, searching curated answers, articles and notes; optional live AI answers               |
| Machine-readable| `/llms.txt`, `/llms-full.txt`, a Markdown mirror for every page, `/api/*.json`, `/openapi.json`, `/.well-known/about.json`, `/rss.xml`, `/robots.txt`, sitemap |
| Counters        | Optional site totals on the home page and per-page views + likes, served same-origin by a Cloudflare Worker with D1     |
| Comments        | Optional giscus discussion on articles                                                                                  |

## Stack

Astro 7 + Starlight with overridden theme components, Markdown/YAML content collections, TypeScript
tooling, optional Cloudflare Workers (site with static assets, counters, Live Ask) and D1, GitHub
Actions for CI. Node.js 24+ is required.

## Quick start

```sh
git clone https://github.com/HYDtomako/Blog.git my-blog
# or: npx degit HYDtomako/Blog my-blog
cd my-blog
npm install
npm run dev
```

Checks before you ship:

```sh
npm run check           # astro check (types and content schema)
npm run test:public-ask
npm run test:related
npm run test:stats
npm run build
npm run verify          # fails when a public surface is missing or off-contract
```

`npm run verify` expects `/ask` to ship its Turnstile widget as soon as `ask.askUrl` is configured,
so a release build needs `PUBLIC_TURNSTILE_SITE_KEY` in the environment — see
[Live Ask](#optional-live-ask).

## Make it yours

No sample identity is hard-coded in the components: identity, copy and content all live in the files
below. Work through the table, then delete what you do not need.

| #  | Change                                                                     | File(s)                                                                                   |
| -- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1  | Site URL, title, locales, per-locale copy, social link, feature switches    | `site.config.mjs`                                                                          |
| 2  | Name, bio, skills, timeline, links, cooperation, résumé/about page          | `content/profile/<locale>/person.yaml`, `cooperation.yaml`, `resume.md`                    |
| 3  | Articles, notes, curated answers, standalone pages                          | `content/{articles,notes,answers,pages}/<locale>/*.md`                                     |
| 4  | Projects                                                                    | `content/projects/<locale>/*.yaml`                                                         |
| 5  | Series — optional grouping for articles                                     | `content/series/<locale>/series.json` + `<slug>.yaml`                                      |
| 6  | Avatar, hero image, share image, favicons, project covers                   | `public/asset/avatar.jpg`, `public/asset/hero-home.jpg`, `public/asset/og-default.png`, `public/favicon.png`, `public/apple-touch-icon.png`, `public/projects/**` |
| 7  | Navigation and UI wording                                                   | `src/i18n/zh-CN.ts`, `src/i18n/en.ts`                                                      |
| 8  | Counters — optional                                                         | `wrangler.jsonc`, `package.json` (`db:migrate*` scripts)                                    |
| 9  | Live Ask — optional                                                         | `site.config.mjs` (`ask`), `.env`, `examples/public-ask-worker/`                            |
| 10 | Repository metadata                                                         | `package.json`, `README.md`, `LICENSE`                                                      |
| 11 | Sample content and upstream-only files                                      | [Delete what you do not need](#8-delete-what-you-do-not-need)                               |

### 1. Site identity — `site.config.mjs`

The single configuration entrypoint. Edit the defaults here, or keep your identity out of the
template with an overlay file `instance.config.mjs` (git-ignored) or the
`REFINED_X_INSTANCE_CONFIG` environment variable — overlay keys are merged over the defaults.

| Field                              | What it controls                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------- |
| `title`                            | Site name used by the header, feeds and machine-readable identity                        |
| `site`                             | Canonical URL; also decides `base` for project-style deploys such as `user.github.io/repo` |
| `locales.default`                  | The locale served at `/`                                                                 |
| `locales.list`                     | Every locale with a content tree; each needs a `brand.<locale>` entry                    |
| `locales.labels`                   | Compact labels for the header language switch                                            |
| `brand.<locale>.*`                 | Public identity and page copy: `description`, `persona`, `wordmark`, `alternateNames`, `homeHeading`, `homeTitle`, `homeLede`, `writingLede`, `askChips`, `projects.*`, `about.*` |
| `social.github`                    | GitHub link; its owner drives `npm run sync:github` (contribution snapshot + project stars) |
| `ask.askUrl` / `mcpUrl` / `healthUrl` | Optional Live Ask endpoints; leave empty for the static-only site                      |
| `comments.repo` / `repoId` / `category` / `categoryId` | Optional giscus identifiers; all four empty = comments off         |
| `stats.enabled` / `stats.url`      | Counters on/off; `url` empty means same-origin                                            |
| `redirects`                        | Old path → new path map; delete the sample entries                                        |
| `contentRoot`, `publicDir`, `outDir`, `assetSource` | Where content, assets and build output live; keep a vault outside the template if you like |
| `discovery.awp`                    | Optional AWP experiment, off by default                                                    |

### 2. Profile — `content/profile/<locale>/`

| File              | Contents                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| `person.yaml`     | `name`, `aliases`, `title`, `bio`, `stats`, `knowsAbout`, `capabilities`, `timeline`, `location`, `qq`, `links` — the structured identity behind the home hero, the about page and `/api/profile.json` |
| `cooperation.yaml`| `title`, `description`, `contact` for the "how to work with me" block                                      |
| `resume.md`       | Frontmatter (`title`, `description`, `tags`, `llmSummary`) plus the body of the about page. Social link lists render as icon chips, links to image files open in a new tab |

Keep one folder per locale (`content/profile/zh-CN/…`, `content/profile/en/…`). Properties you do not
use — for example `education` / `educationHistory` — can simply be omitted.

### 3. Content — `content/<collection>/<locale>/`

Every locale folder is a separate corpus, and the URL follows the content type:

| Collection | Frontmatter `contentType` | URL                                          |
| ---------- | ------------------------- | -------------------------------------------- |
| `articles` | `article`                 | `/YYYY/MM/DD/<slug>/` (date comes from `pubDate`) |
| `notes`    | `note`                    | `/notes/<slug>/`                              |
| `answers`  | `answer`                  | `/answers/<slug>/`                            |
| `pages`    | `page`                    | `/<slug>/`                                    |

```yaml
---
title: Building for humans and agents
description: One sentence for readers and search engines.
contentType: article
pubDate: 2026-07-01
slug: humans-and-agents
series: notes            # optional, must be a slug listed in series.json
tags: [publishing, agents]
llmSummary: A concise summary used by the machine-readable surfaces.
---
```

`slug`, `llmSummary` and a `pubDate` (articles and notes only) are required; curated answers
additionally need `question` and `shortAnswer`, and pages may set `seoImage`. The schema is enforced
at build time by `src/content.config.ts`, so a broken entry fails the build instead of shipping.

Images referenced from Markdown resolve to `/asset/<file name>` — write either a normal Markdown
image or an Obsidian-style embed (`![[figure.png]]`) and put the file in `public/asset/`.

### 4. Projects — `content/projects/<locale>/*.yaml`

```yaml
title: My project
description: What it does and for whom.
slug: my-project
status: active           # active | maintained | archived | planned | unknown
url: https://example.com # or a path such as /projects/my-project/
repository: https://github.com/you/my-project
tags: [TypeScript, Agent]
category: oss            # project | course | snippet | oss
featured: true
sortRank: 10             # lower sorts first
image: /projects/my-project/cover.png
imageAlt: Cover
role: Author
impact: One line on the outcome
proofPoints: [Shipped to 2k users]
```

`stars` is refreshed automatically on every build by `npm run sync:github` for entries whose
`repository` belongs to the GitHub owner in `social.github`. Project images live under
`public/projects/`.

### 5. Series — optional

`content/series/<locale>/series.json` lists published series in order:

```json
{ "order": ["notes"] }
```

Each slug in `order` may have a `<slug>.yaml` with `title`, `description`, `intro`, `faq` and
`featured`. With an empty `order` — or no `series/<locale>/` directory at all — that locale
publishes no series pages, no series grid and no series links, and the `series` frontmatter field
stays free-form.

### 6. Images and icons

| File                            | Use                                                        | Suggested                  |
| ------------------------------- | ---------------------------------------------------------- | -------------------------- |
| `public/asset/avatar.jpg`       | Home hero portrait, about page portrait, and the image in `/api/profile.json` | Square, 512×512 |
| `public/asset/hero-home.jpg`    | Home page background, preloaded by the document head        | Wide, ~2247×1268 or larger |
| `public/asset/og-default.png`   | Default social share image when a page sets no `seoImage`   | 1200×1200                  |
| `public/favicon.png`            | Browser tab icon                                            | 32×32                      |
| `public/apple-touch-icon.png`   | iOS home screen icon                                        | 180×180                    |
| `public/projects/**`            | Project covers referenced from project YAML                 | As needed                  |

Keep the file names: they are referenced directly by the components.

### 7. UI wording — `src/i18n/`

`zh-CN.ts` and `en.ts` hold navigation labels, ask/overlay copy, home section titles, footer labels
and runtime strings. Both must stay structurally identical — `src/i18n/types.ts` is the shared
contract. This is optional tuning; the identity copy in `site.config.mjs` is the part you usually
want to change.

### 8. Delete what you do not need

| Item                                                             | Why                                                                                             |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `content/articles`, `content/notes`, `content/answers`, `content/projects` sample entries | Replace with your own writing and projects                                                       |
| `redirects` in `site.config.mjs`                                  | Redirects for renamed sample answers                                                              |
| `.github/workflows/deploy-pages.yml`                              | Upstream maintainer workflow that publishes the Refined-X demo; manual-only. Replace it with `deploy/user-github-pages.yml` if you deploy to GitHub Pages |
| `deploy/`                                                         | Sample-demo deployment configs. Keep `user-github-pages.yml` if you deploy to GitHub Pages; drop `github-pages.config.mjs`, which publishes the upstream demo |
| `docs/community-cover/`, `docs/screenshots/`                      | Upstream promo assets                                                                             |
| `PRODUCT.md`, `DESIGN.md`, `ROADMAP.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, `.github/ISSUE_TEMPLATE/`, `docs/` | Upstream project docs. Keep the deploy guides you still need, drop the rest             |
| `examples/public-ask-worker/`                                     | Only needed for live AI answers                                                                   |

## Deploy

| Mode                            | Use when                                                       | How                                                                                 |
| ------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Static host                     | You only want the site, the Markdown mirrors and the JSON APIs | `npm run build`, publish `dist/`                                                     |
| Cloudflare Worker + static assets | You also want counters (or one deploy for everything)          | `npm run deploy` — builds, verifies, migrates D1 and uploads `dist/` as Worker assets |
| Static site + Live Ask Worker   | You want live AI answers and the MCP endpoint                  | Static host plus [`examples/public-ask-worker`](examples/public-ask-worker/README.md) |

**Cloudflare Pages**: build command `npm run build`, output directory `dist`, Node.js `24`.

**GitHub Pages**: copy [`deploy/user-github-pages.yml`](deploy/user-github-pages.yml) to
`.github/workflows/`, set **Settings → Pages → Source** to *GitHub Actions*, and make sure `site` in
`site.config.mjs` is your real URL (a custom domain or `https://<user>.github.io/<repo>`).

Step-by-step notes: [`docs/deploy-static.md`](docs/deploy-static.md).

### Cloudflare Worker with counters

`wrangler.jsonc` ships the sample values; change them before you deploy:

| Field                                | Change to                                                    |
| ------------------------------------ | ------------------------------------------------------------ |
| `name`                               | Your Worker name                                             |
| `d1_databases[0].database_name` / `database_id` | The D1 database you create (`npx wrangler d1 create <name>`, then paste the id) |
| `routes[0].pattern`                  | Your custom domain, or drop the `routes` block to stay on `*.workers.dev` |
| `ratelimits[0].namespace_id`         | A namespace id of your own for the stats rate limiter         |

```sh
npx wrangler login
npx wrangler d1 create my-blog-stats     # paste database_id into wrangler.jsonc
npm run db:migrate                       # apply worker/migrations to the remote D1
npm run deploy                           # build + verify + migrate + wrangler deploy
```

The D1 name also appears in the `db:migrate` / `db:migrate:local` scripts in `package.json` — keep
the two in sync. `npm run dev:worker` runs `wrangler dev` against the built `dist/` for local API
work, and `npm run db:migrate:local` applies the migrations to the local database.

Counters are optional at runtime: when the API is unreachable the widgets hide themselves and the
rest of the page is unaffected. Likes are stored against a weekly HMAC pseudonym; no IP addresses
are kept. The template ships with `stats.enabled: false`; set it to `true` once the Worker is deployed.

### Optional: Live Ask

Live answers, the NLWeb-compatible `POST /ask` and the MCP endpoint come from a separate Cloudflare
Worker. Deploy [`examples/public-ask-worker`](examples/public-ask-worker/README.md), then point the
site at it and provide the Turnstile **site** key (public) at build time:

```js
export default {
  ask: {
    askUrl: 'https://ask.example.com/ask',
    mcpUrl: 'https://ask.example.com/mcp',
    healthUrl: 'https://ask.example.com/health',
    persistInteractions: false,
  },
};
```

```sh
PUBLIC_TURNSTILE_SITE_KEY=your_site_key npm run build
```

Full checklist and troubleshooting: [`docs/deploy-live-ask.md`](docs/deploy-live-ask.md).

## Commands

| Command                     | Does                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------- |
| `npm run dev`               | Astro dev server (also refreshes `public/asset` when `assetSource` is set)               |
| `npm run build`             | Refreshes the GitHub snapshot, then builds to `dist/`                                    |
| `npm run preview`           | Serves the built site locally                                                           |
| `npm run check`             | `astro check` — types, content schema, template diagnostics                              |
| `npm run verify`            | Verifies the built output: required pages, machine-readable surfaces, capabilities       |
| `npm run test:public-ask`   | Unit tests for the ask/discovery/contract layer                                          |
| `npm run test:related`      | Related-articles selection tests                                                         |
| `npm run test:comments`     | giscus configuration tests                                                               |
| `npm run test:stats`        | Counter Worker and client tests                                                          |
| `npm run sync:github`       | Refreshes `content/github-activity.json` and project `stars` from GitHub                 |
| `npm run collect-assets`    | Copies an external image library into `public/asset` (no-op unless `assetSource` is set)  |
| `npm run dev:worker`        | `wrangler dev` — built assets plus the counters API                                      |
| `npm run db:migrate:local` / `db:migrate` | Applies `worker/migrations` to the local / remote D1                    |
| `npm run deploy`            | `build` → `verify` → `db:migrate` → `wrangler deploy`                                    |

## Project structure

```text
site.config.mjs         # identity, locales, feature switches
astro.config.mjs        # Astro/Starlight wiring (reads site.config.mjs)
content/                # your corpus, grouped by collection and locale
  articles|notes|answers|pages/<locale>/*.md
  profile/<locale>/{person.yaml,cooperation.yaml,resume.md}
  projects/<locale>/*.yaml
  series/<locale>/{series.json,<slug>.yaml}
public/
  asset/                # avatar, hero, share image, article figures
  projects/             # project covers
  favicon.png, apple-touch-icon.png
src/
  components/           # Starlight overrides and page sections
  i18n/                 # UI copy per locale
  lib/                  # config, locale, capability and SEO helpers
  pages/                # routes plus machine-readable endpoints (/llms.txt, /api/*, ...)
  content.config.ts     # content collections and frontmatter schemas
worker/                 # counters Worker (D1) and its migrations
wrangler.jsonc          # Worker name, D1 binding, routes
examples/public-ask-worker/  # optional Live Ask Worker
scripts/                # build-time helpers (verify, sync, sitemaps, asset collection)
docs/                   # deploy guides and upstream design notes
```

## Machine-readable surfaces

| Endpoint                     | Purpose                                             |
| ---------------------------- | --------------------------------------------------- |
| `/llms.txt`, `/llms-full.txt` | Compact site map / full public text corpus for agents |
| `/<page>.md`                 | Markdown mirror of every public page                 |
| `/api/profile.json`          | Structured public identity                           |
| `/api/articles.json`         | Article catalog                                      |
| `/api/topics.json`           | Topic catalog                                        |
| `/api/search-index.json`     | Corpus behind `⌘K` and `/ask`                        |
| `/openapi.json`              | API contract plus any configured Ask/MCP remotes     |
| `/.well-known/about.json`    | Capability summary                                   |
| `/rss.xml`, `/robots.txt`, sitemap | Syndication and discovery                      |

Locale-scoped files are generated per locale: the default locale keeps the paths above, other
locales mirror them under their prefix (`/en/llms.txt`, `/en/api/articles.json`, `/en/rss.xml`).
Site-wide discovery files (`/openapi.json`, `/.well-known/about.json`, `/robots.txt`,
`sitemap-index.xml`) stay single and describe every locale.

## Credits and license

Built on [Refined-X](https://github.com/tower1229/Refined-X) (MIT) with
[Astro](https://astro.build/) and [Starlight](https://starlight.astro.build/). The reading
experience takes cues from [joyehuang.me](https://www.joyehuang.me/), the
[Refined-X demo](https://demo.refined-x.com/) and the Astra WordPress theme. See
[`DESIGN.md`](DESIGN.md) for the design system and [`CHANGELOG.md`](CHANGELOG.md) for notable
changes.

[MIT](LICENSE)
