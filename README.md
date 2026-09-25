[English](README.en.md) | 简体中文

# Blog —— 一个可以直接改成自己站点的 Astro + Starlight 个人博客

一份内容，同时服务人和 Agent：写 Markdown 与 YAML，产出给人阅读的站点，以及给搜索引擎和 AI Agent
读取的机器可读接口（`llms.txt`、Markdown 镜像、JSON API、OpenAPI、RSS）。

这个仓库是当**模板**用的：克隆下来，照着 [改成你自己的站点](#改成你自己的站点) 走一遍，把所有示例身份
换成你自己的信息即可。

- 在线示例：<https://hydblog.xyz/>
- 上游项目：[Refined-X](https://github.com/tower1229/Refined-X) —— [官方演示](https://demo.refined-x.com/)
- 设计参考：[joyehuang.me](https://www.joyehuang.me/)、[demo.refined-x.com](https://demo.refined-x.com/)、Astra（WordPress 主题）

## 有什么

| 模块       | 内容                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| 阅读       | 博客（`/writing/`）、随笔（`/notes/`）、项目（`/projects/`）、常见问题（`/answers/`）、关于（`/about/`）、标签聚合、明暗主题、默认双语（`zh-CN` 在 `/`，`en` 在 `/en/`） |
| 提问       | `⌘K` 浮层与 `/ask` 页面，在常见问题、文章与随笔里检索；可选接入实时 AI 回答                                                |
| 机器可读   | `/llms.txt`、`/llms-full.txt`、每个页面的 Markdown 镜像、`/api/*.json`、`/openapi.json`、`/.well-known/about.json`、`/rss.xml`、`/robots.txt`、站点地图 |
| 统计       | 可选：首页显示站点总量，文章/随笔显示浏览量并支持点赞，由同源的 Cloudflare Worker + D1 提供                              |
| 评论       | 可选：文章页接入 giscus                                                                                                   |

## 技术栈

Astro 7 + Starlight（覆盖了部分主题组件）、Markdown/YAML 内容集合、TypeScript 工具链；可选 Cloudflare
Workers（站点静态资源、统计接口、Live Ask）与 D1；GitHub Actions 跑 CI。需要 Node.js 24+。

## 快速开始

```sh
git clone https://github.com/HYDtomako/Blog.git my-blog
# 或者：npx degit HYDtomako/Blog my-blog
cd my-blog
npm install
npm run dev
```

发布前的检查：

```sh
npm run check           # astro check：类型与内容 schema
npm run test:public-ask
npm run test:related
npm run test:stats
npm run build
npm run verify          # 缺页面或接口不符合约定时会失败
```

只要配置了 `ask.askUrl`，`npm run verify` 就要求 `/ask` 页面带上 Turnstile 组件，因此正式构建需要
在环境变量里提供 `PUBLIC_TURNSTILE_SITE_KEY`，见 [Live Ask](#可选live-ask)。

## 改成你自己的站点

示例身份没有写死在组件里——身份、文案和内容都在下面这些文件里。照着表格过一遍，再删掉不需要的东西。

| #  | 改什么                                                     | 文件                                                                                        |
| -- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1  | 站点域名、站点名、语言、各语言文案、社交链接、功能开关      | `site.config.mjs`                                                                            |
| 2  | 昵称、简介、技能、时间线、联系方式、合作说明、关于页正文    | `content/profile/<locale>/person.yaml`、`cooperation.yaml`、`resume.md`                       |
| 3  | 文章、随笔、常见问题、独立页面                              | `content/{articles,notes,answers,pages}/<locale>/*.md`                                       |
| 4  | 项目                                                        | `content/projects/<locale>/*.yaml`                                                           |
| 5  | 专题（可选，用来给文章分组）                                | `content/series/<locale>/series.json` + `<slug>.yaml`                                         |
| 6  | 头像、首页大图、分享图、favicon、项目封面                   | `public/asset/avatar.jpg`、`public/asset/hero-home.jpg`、`public/asset/og-default.png`、`public/favicon.png`、`public/apple-touch-icon.png`、`public/projects/**` |
| 7  | 导航与界面文案                                              | `src/i18n/zh-CN.ts`、`src/i18n/en.ts`                                                        |
| 8  | 统计（可选）                                                | `wrangler.jsonc`、`package.json`（`db:migrate*` 脚本）                                        |
| 9  | Live Ask（可选）                                            | `site.config.mjs`（`ask`）、`.env`、`examples/public-ask-worker/`                              |
| 10 | 仓库信息                                                    | `package.json`、`README.md`、`LICENSE`                                                        |
| 11 | 示例内容与上游专用文件                                      | [删掉不需要的东西](#8-删掉不需要的东西)                                                          |

### 1. 站点身份 —— `site.config.mjs`

唯一的配置入口。可以直接改这里的默认值；如果想把个人身份留在模板之外，也可以写一个
`instance.config.mjs`（已加入 `.gitignore`），或用环境变量 `REFINED_X_INSTANCE_CONFIG` 指定路径——
overlay 的字段会覆盖默认值。

| 字段                                 | 作用                                                                                           |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `title`                              | 站点名，出现在页头、订阅源和机器可读身份里                                                       |
| `site`                               | 站点正式地址；同时决定 `base`，例如部署到 `user.github.io/repo` 这类子路径时用得上                |
| `locales.default`                    | 挂在 `/` 的语言                                                                                |
| `locales.list`                       | 所有有内容目录的语言，每个都要有对应的 `brand.<locale>`                                          |
| `locales.labels`                     | 页头语言切换按钮上的简称                                                                        |
| `brand.<locale>.*`                   | 公开身份与页面文案：`description`、`persona`、`wordmark`、`alternateNames`、`homeHeading`、`homeTitle`、`homeLede`、`writingLede`、`askChips`、`projects.*`、`about.*` |
| `social.github`                      | GitHub 链接；`npm run sync:github` 按这个账号拉取贡献图与项目 star 数                            |
| `ask.askUrl` / `mcpUrl` / `healthUrl` | 可选的 Live Ask 接口；留空就是纯静态站点                                                        |
| `comments.repo` / `repoId` / `category` / `categoryId` | 可选的 giscus 配置；四项都空 = 关闭评论                                       |
| `stats.enabled` / `stats.url`        | 统计开关，模板默认关闭（`false`）；部署好 `worker/` 后改成 `true`；`url` 留空表示同源接口             |
| `redirects`                          | 旧路径到新路径的跳转表，示例条目可以删掉                                                        |
| `contentRoot`、`publicDir`、`outDir`、`assetSource` | 内容、静态资源、构建产物的位置；也可以把内容仓库放在模板之外                     |
| `discovery.awp`                      | 可选的 AWP 实验开关，默认关闭                                                                   |

### 2. 个人资料 —— `content/profile/<locale>/`

| 文件               | 内容                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| `person.yaml`      | `name`、`aliases`、`title`、`bio`、`stats`、`knowsAbout`、`capabilities`、`timeline`、`location`、`qq`、`links`——首页首屏、关于页和 `/api/profile.json` 背后的结构化资料 |
| `cooperation.yaml` | 合作说明的 `title`、`description`、`contact`                                                                 |
| `resume.md`        | Frontmatter（`title`、`description`、`tags`、`llmSummary`）加正文，构成关于页正文。社交链接列表会渲染成图标按钮，指向图片的链接会在新标签页打开 |

每种语言一个目录（`content/profile/zh-CN/…`、`content/profile/en/…`）。用不到的字段——比如
`education`、`educationHistory`——直接不写就行。

### 3. 内容 —— `content/<集合>/<locale>/`

每种语言是独立的一套内容，URL 由 frontmatter 里的 `contentType` 决定：

| 集合       | `contentType` | URL                                              |
| ---------- | ------------- | ------------------------------------------------ |
| `articles` | `article`     | `/YYYY/MM/DD/<slug>/`（日期取自 `pubDate`）        |
| `notes`    | `note`        | `/notes/<slug>/`                                  |
| `answers`  | `answer`      | `/answers/<slug>/`                                |
| `pages`    | `page`        | `/<slug>/`                                        |

```yaml
---
title: 写给人和 Agent 的站点
description: 一句话说明，给读者和搜索引擎看。
contentType: article
pubDate: 2026-07-01
slug: humans-and-agents
series: notes            # 可选，必须是 series.json 里列出的专题 slug
tags: [写作, agents]
llmSummary: 给机器可读接口用的一段摘要。
---
```

`slug`、`llmSummary` 是必填的，文章和随笔还必须有 `pubDate`；常见问题额外需要 `question` 与
`shortAnswer`，独立页面可以设置 `seoImage`。校验在构建时由 `src/content.config.ts` 执行：写错了会直接
构建失败，而不是把坏数据发布出去。

Markdown 里引用图片会解析到 `/asset/<文件名>`——正常写 Markdown 图片语法，或者用 Obsidian 风格的
`![[figure.png]]` 都行，把文件放进 `public/asset/` 即可。

### 4. 项目 —— `content/projects/<locale>/*.yaml`

```yaml
title: 我的项目
description: 它做什么，为谁做。
slug: my-project
status: active           # active | maintained | archived | planned | unknown
url: https://example.com # 也可以写站内路径，比如 /projects/my-project/
repository: https://github.com/you/my-project
tags: [TypeScript, Agent]
category: oss            # project | course | snippet | oss
featured: true
sortRank: 10             # 数字越小越靠前
image: /projects/my-project/cover.png
imageAlt: 封面
role: 作者
impact: 一句话说明结果
proofPoints: [已有 2000 位用户在用]
```

`repository` 属于 `social.github` 那个账号的项目，其 `stars` 会在每次构建时由 `npm run sync:github`
自动刷新。项目封面放在 `public/projects/` 下。

### 5. 专题（可选）

`content/series/<locale>/series.json` 按顺序列出已发布的专题：

```json
{ "order": ["notes"] }
```

`order` 里的每个 slug 可以配一个 `<slug>.yaml`，字段有 `title`、`description`、`intro`、`faq`、
`featured`。如果 `order` 为空，或者干脆没有 `series/<locale>/` 目录，那么这个语言就不会生成专题页、
专题栅格和专题链接，frontmatter 里的 `series` 也恢复成自由填写。

### 6. 图片与图标

| 文件                          | 用在哪里                                                        | 建议尺寸              |
| ----------------------------- | --------------------------------------------------------------- | --------------------- |
| `public/asset/avatar.jpg`     | 首页首屏头像、关于页头像、`/api/profile.json` 里的头像            | 正方形，512×512        |
| `public/asset/hero-home.jpg`  | 首页背景图，由页面头部预加载                                      | 横向，2247×1268 或更大 |
| `public/asset/og-default.png` | 页面没设 `seoImage` 时的默认分享图                                | 1200×1200             |
| `public/favicon.png`          | 浏览器标签页图标                                                  | 32×32                 |
| `public/apple-touch-icon.png` | iOS 添加到主屏幕的图标                                            | 180×180               |
| `public/projects/**`          | 项目 YAML 里引用的封面                                            | 按需                  |

文件名请保持不变，组件是按这些名字直接引用的。

### 7. 界面文案 —— `src/i18n/`

`zh-CN.ts` 与 `en.ts` 里是导航标签、提问浮层文案、首页分节标题、页脚标签和运行时提示。两份文件结构必须
保持一致——`src/i18n/types.ts` 是共同的约定。这一步是可选的微调；通常你更想改的是 `site.config.mjs` 里
的身份文案。

### 8. 删掉不需要的东西

| 项目                                                              | 原因                                                                                              |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `content/articles`、`content/notes`、`content/answers`、`content/projects` 里的示例条目 | 换成你自己的文章与项目                                                                             |
| `site.config.mjs` 里的 `redirects`                                 | 示例站改名遗留的跳转                                                                                |
| `.github/workflows/deploy-pages.yml`                               | 上游维护者用来发布 Refined-X 演示站的工作流（仅手动触发）。你要部署 GitHub Pages 就换成 `deploy/user-github-pages.yml` |
| `deploy/`                                                          | 演示站部署配置。用 GitHub Pages 就保留 `user-github-pages.yml`，发布上游演示的 `github-pages.config.mjs` 可以删掉 |
| `docs/community-cover/`、`docs/screenshots/`                        | 上游宣传素材                                                                                        |
| `PRODUCT.md`、`DESIGN.md`、`ROADMAP.md`、`CHANGELOG.md`、`CONTRIBUTING.md`、`SECURITY.md`、`.github/ISSUE_TEMPLATE/`、`docs/` | 上游项目文档。部署指南留着自己用，其余随你删            |
| `examples/public-ask-worker/`                                      | 只有要接实时 AI 回答时才需要                                                                         |

## 部署

| 方式                              | 什么时候用                                              | 怎么做                                                                          |
| --------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 纯静态托管                        | 只要站点、Markdown 镜像和 JSON 接口                      | `npm run build`，把 `dist/` 发布出去                                             |
| Cloudflare Worker + 静态资源      | 还想要浏览量统计（或者想一次部署全部）                    | `npm run deploy`：构建、校验、迁移 D1，并把 `dist/` 作为 Worker 静态资源上传       |
| 静态站 + Live Ask Worker          | 要实时 AI 回答和 MCP 入口                                | 静态托管，外加 [`examples/public-ask-worker`](examples/public-ask-worker/README.md) |

**Cloudflare Pages**：构建命令 `npm run build`，输出目录 `dist`，Node.js 版本 `24`。

**GitHub Pages**：把 [`deploy/user-github-pages.yml`](deploy/user-github-pages.yml) 复制到
`.github/workflows/`，在 **Settings → Pages → Source** 选 *GitHub Actions*，并确认 `site.config.mjs`
里的 `site` 是真实地址（自定义域名，或 `https://<用户名>.github.io/<仓库名>`）。

分步说明见 [`docs/deploy-static.md`](docs/deploy-static.md)。

### Cloudflare Worker 与统计

`wrangler.jsonc` 里是示例值，部署前要改：

| 字段                                           | 改成                                                       |
| ---------------------------------------------- | ---------------------------------------------------------- |
| `name`                                         | 你的 Worker 名字                                            |
| `d1_databases[0].database_name` / `database_id` | 你创建的 D1 数据库（`npx wrangler d1 create <名字>`，把 id 填回来） |
| `routes[0].pattern`                            | 你的自定义域名；不想绑定域名就删掉整个 `routes` 段，用 `*.workers.dev` |
| `ratelimits[0].namespace_id`                   | 你自己的限流命名空间 id                                      |

```sh
npx wrangler login
npx wrangler d1 create my-blog-stats     # 把 database_id 填进 wrangler.jsonc
npm run db:migrate                       # 把 worker/migrations 应用到线上 D1
npm run deploy                           # 构建 + 校验 + 迁移 + wrangler deploy
```

D1 数据库名也出现在 `package.json` 的 `db:migrate` / `db:migrate:local` 脚本里，两处要保持一致。
`npm run dev:worker` 会用 `wrangler dev` 把构建好的 `dist/` 和统计接口一起跑起来，`npm run db:migrate:local`
则把迁移应用到本地数据库。

统计是运行时可选的：接口不可用时组件会自己隐藏，页面其余部分不受影响。点赞只按每周轮换的 HMAC 假名去重，
不保存 IP。模板默认 `stats.enabled: false`，构建里不会出现统计组件；部署好 Worker 后把它改成 `true` 即可。

### 可选：Live Ask

实时回答、NLWeb 兼容的 `POST /ask` 和 MCP 入口来自另一个 Cloudflare Worker。先部署
[`examples/public-ask-worker`](examples/public-ask-worker/README.md)，再把站点指过去，并在构建时提供
Turnstile 的 **site** key（公开的）：

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

完整清单与排错见 [`docs/deploy-live-ask.md`](docs/deploy-live-ask.md)。

## 常用命令

| 命令                        | 作用                                                                              |
| --------------------------- | --------------------------------------------------------------------------------- |
| `npm run dev`               | 启动 Astro 开发服务器（配置了 `assetSource` 时会先刷新 `public/asset`）             |
| `npm run build`             | 刷新 GitHub 快照后构建到 `dist/`                                                   |
| `npm run preview`           | 本地预览构建产物                                                                   |
| `npm run check`             | `astro check`：类型、内容 schema 与模板诊断                                         |
| `npm run verify`            | 校验构建产物：必需页面、机器可读接口、能力声明是否齐全                               |
| `npm run test:public-ask`   | 提问/发现/契约层的单元测试                                                          |
| `npm run test:related`      | 相关文章选取的测试                                                                  |
| `npm run test:comments`     | giscus 配置测试                                                                    |
| `npm run test:stats`        | 统计 Worker 与前端组件测试                                                          |
| `npm run sync:github`       | 从 GitHub 刷新 `content/github-activity.json` 和项目 star 数                        |
| `npm run collect-assets`    | 把外部图库同步进 `public/asset`（没配 `assetSource` 时什么都不做）                   |
| `npm run dev:worker`        | `wrangler dev`：同时跑构建产物和统计接口                                             |
| `npm run db:migrate:local` / `db:migrate` | 把 `worker/migrations` 应用到本地 / 线上 D1                            |
| `npm run deploy`            | `build` → `verify` → `db:migrate` → `wrangler deploy`                              |

## 目录结构

```text
site.config.mjs         # 身份、语言、功能开关
astro.config.mjs        # Astro/Starlight 装配（读取 site.config.mjs）
content/                # 你的内容，按集合与语言分组
  articles|notes|answers|pages/<locale>/*.md
  profile/<locale>/{person.yaml,cooperation.yaml,resume.md}
  projects/<locale>/*.yaml
  series/<locale>/{series.json,<slug>.yaml}
public/
  asset/                # 头像、首屏大图、分享图、文章配图
  projects/             # 项目封面
  favicon.png, apple-touch-icon.png
src/
  components/           # Starlight 组件覆盖与页面区块
  i18n/                 # 各语言的界面文案
  lib/                  # 配置、语言、能力声明与 SEO 工具
  pages/                # 路由与机器可读接口（/llms.txt、/api/* 等）
  content.config.ts     # 内容集合与 frontmatter schema
worker/                 # 统计 Worker（D1）及其迁移
wrangler.jsonc          # Worker 名称、D1 绑定、路由
examples/public-ask-worker/  # 可选的 Live Ask Worker
scripts/                # 构建期脚本（校验、同步、站点地图、图库收集）
docs/                   # 部署指南与上游设计笔记
```

## 机器可读接口

| 接口                          | 用途                                          |
| ----------------------------- | --------------------------------------------- |
| `/llms.txt`、`/llms-full.txt`  | 给 Agent 的精简站点目录 / 全量公开文本          |
| `/<页面>.md`                   | 每个公开页面的 Markdown 镜像                   |
| `/api/profile.json`           | 结构化的公开身份                               |
| `/api/articles.json`          | 文章目录                                       |
| `/api/topics.json`            | 标签目录                                       |
| `/api/search-index.json`      | `⌘K` 与 `/ask` 使用的检索语料                   |
| `/openapi.json`               | 接口契约，以及配置过的 Ask/MCP 远端             |
| `/.well-known/about.json`     | 能力概览                                       |
| `/rss.xml`、`/robots.txt`、站点地图 | 订阅与发现                                |

按语言生成的接口：默认语言保持上面的路径，其他语言加前缀镜像一份（如 `/en/llms.txt`、
`/en/api/articles.json`、`/en/rss.xml`）。站点级发现文件（`/openapi.json`、`/.well-known/about.json`、
`/robots.txt`、`sitemap-index.xml`）只有一份，覆盖所有语言。

## 致谢与许可

基于 [Refined-X](https://github.com/tower1229/Refined-X)（MIT）构建，使用
[Astro](https://astro.build/) 与 [Starlight](https://starlight.astro.build/)。阅读体验参考了
[joyehuang.me](https://www.joyehuang.me/)、[Refined-X 演示站](https://demo.refined-x.com/) 和
Astra WordPress 主题。设计系统见 [`DESIGN.md`](DESIGN.md)，变更记录见 [`CHANGELOG.md`](CHANGELOG.md)。

[MIT](LICENSE)
