---
title: "Sample article: make this your first post"
description: A placeholder article that also shows what the frontmatter looks like and how URLs are generated.
contentType: article
pubDate: 2026-01-01
slug: example-article
tags: [sample, writing]
llmSummary: A placeholder article demonstrating the article frontmatter fields, the URL rule, and how to write the body. Delete it and replace it with your own writing.
---

This is a placeholder article. Use it to check the typography, then delete it and write your own.

## How to write the body

Plain Markdown works: headings, lists, code blocks, quotes, and tables.

```sh
npm run dev
```

## Where images live

Put images in `public/asset/` and reference them as `![caption](/asset/your-image.png)`. Obsidian-style embeds (`![[your-image.png]]`) resolve to the same path.

## Conventions

- The URL comes from `pubDate` and `slug`: `/YYYY/MM/DD/<slug>/`
- `description` is for readers and search engines; `llmSummary` is for agents and shows up in `/llms.txt`, the Markdown mirror, and the JSON APIs
- `tags` generate topic pages; `series` must be registered in `content/series/<locale>/series.json` first
