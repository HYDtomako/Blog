---
title: "Typography sample: see every layout in one place"
description: An example article that lays out all the typography the site supports. Copy its structure and swap in your own content.
contentType: article
pubDate: 2026-01-02
slug: typography-sample
tags: [sample, typography]
llmSummary: A placeholder typography sample that walks through heading levels, inline styles, lists, quotes, code blocks, tables, images, dividers, and the frontmatter conventions, so template users can copy the structure and fill in their own content.
---

This is a typography sample. It has no argument to make — it just puts every kind of block the site supports on one page, so you can pick what you need when writing your first post. Delete the whole thing afterward, or keep it as a skeleton and replace each section with your own.

## Headings and the table of contents

Body headings use `##` (level 2), `###` (level 3), and `####` (level 4). The table of contents on the right only collects these three levels, and only appears once the page has at least two headings. The `#` level-1 heading is reserved for the page title — don't use it in the body.

### Level-three heading

A level-three heading appears indented one step in the table of contents.

#### Level-four heading

One step deeper. Anything below this (`#####`) is not collected and is best avoided.

## Inline styles

The usual inline styles all work: **bold**, *italic*, `inline code`, [a link](https://example.com), and ~~strikethrough~~.

## Lists

Unordered list:

- First item
- Second item
  - One level of nesting for detail
  - And another
- Third item

Ordered list:

1. Step one
2. Step two
3. Step three

Task list (GFM syntax):

- [x] Something already done
- [ ] Something still to do

## Quotes

> A blockquote suits an excerpt, a side note, or an epigraph.
> Consecutive lines join into the same block.

## Code

Inline, write `npm run dev`. A fenced block can name a language and gets highlighted accordingly:

```sh
npm run dev
```

```ts
type Post = { title: string; slug: string };

const post: Post = { title: 'Typography sample', slug: 'typography-sample' };
console.log(post);
```

## Tables

| Field | Purpose | Who reads it |
| --- | --- | --- |
| `description` | Article summary | Readers and search engines |
| `llmSummary` | Summary for agents | `/llms.txt`, the Markdown mirror, and the JSON APIs |
| `tags` | Generates topic pages | In-site navigation |

## Images

Put images in `public/asset/` and reference them in the usual way:

![Sample image](/asset/og-default.png)

If you prefer the Obsidian style, `![[og-default.png]]` resolves to the same path.

## Dividers

Three hyphens make a divider for splitting up long sections:

---

## Frontmatter and a few conventions

- The article URL comes from `pubDate` and `slug`: `/YYYY/MM/DD/<slug>/`. Changing either changes the address.
- `description` is for readers; `llmSummary` is for agents (it shows up in `/llms.txt`, the Markdown mirror, and the JSON APIs).
- `tags` generate topic pages automatically; to join a series, register the `series` in `content/series/<locale>/series.json` first.
- Chinese and English live in `content/articles/zh-CN/` and `content/articles/en/` respectively; it's best to keep the same `slug` across both.
