# hydblog-twikoo

文章评论的独立 Worker，不走站点根目录的 `wrangler.jsonc`，也不使用 `hydblog-stats`。

入口 `src/index.js` 是 [twikoojs/twikoo-cloudflare](https://github.com/twikoojs/twikoo-cloudflare) `64c0048671e1a483d6a056968f08f08407b5bf8a` 的官方适配器，依赖 `twikoo-func`。D1 表结构与上游 `schema.sql` 一致。首期不绑 R2，只做文字评论；官方入口在没有 `env.R2` 时会跳过 R2 上传。

资源名：

| 项 | 值 |
| --- | --- |
| Worker | `hydblog-twikoo` |
| D1 | `hydblog-twikoo`，binding `DB` |
| `database_id` | 仓库里是占位 UUID，只够本地 D1 |

## 本地

在本目录：

```sh
npm install
npm run db:migrate:local
npm run dev
```

`wrangler dev` 默认听 `http://127.0.0.1:8787`。浏览器打开这个地址，正常时应看到：

```json
{"code":100,"message":"Twikoo 云函数运行正常，请参考 https://twikoo.js.org/frontend.html 完成前端的配置"}
```

站点 `site.config.mjs` 的 `comments.envId` 留空时文章页不挂评论。要对着本地 Worker 看评论框，把它设成 `http://127.0.0.1:8787`（含协议，不要末尾斜杠）。线上环境再用 `https://` 的 Worker 地址。

## 不要擅自部署

不要在这里执行 `wrangler deploy`，不要 `d1 execute --remote`，不要绑自定义域名，也不要改 hydblog.xyz 的路由。

真要上线时，先由账号主人执行 `npx wrangler d1 create hydblog-twikoo`，把返回的 `database_id` 写进 `wrangler.jsonc`，再对远程库执行 `schema.sql`。这些步骤不在本次脚手架里自动跑。
