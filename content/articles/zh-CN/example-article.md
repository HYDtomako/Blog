---
title: 示例文章：换成你的第一篇
description: 一篇占位文章，顺便演示文章 frontmatter 该怎么写、URL 是怎么生成的。
contentType: article
pubDate: 2026-01-01
slug: example-article
tags: [示例, 写作]
llmSummary: 占位示例文章，用来演示文章的 frontmatter 字段、URL 生成规则和正文写法，可以整篇删掉换成自己的内容。
---

这是示例文章占位。可以先用它检查排版，然后删掉换成你自己的第一篇。

## 正文怎么写

正常写 Markdown：标题、列表、代码块、引用、表格都支持。

```sh
npm run dev
```

## 图片放哪里

把图片放进 `public/asset/`，正文里写 `![说明](/asset/your-image.png)`；如果你习惯 Obsidian 的写法，`![[your-image.png]]` 也会解析到同一个地址。

## 几个约定

- 文章的 URL 由 `pubDate` 和 `slug` 决定：`/YYYY/MM/DD/<slug>/`
- `description` 给读者和搜索引擎看，`llmSummary` 给 Agent 看，会出现在 `/llms.txt`、Markdown 镜像与 JSON 接口里
- `tags` 会生成标签页；`series` 需要先在 `content/series/<locale>/series.json` 里登记
