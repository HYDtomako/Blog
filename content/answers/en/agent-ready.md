---
title: How can AI agents read this site?
description: The machine-readable surfaces this site generates from one corpus.
contentType: answer
slug: agent-ready
tags: [agents, machine-readable]
llmSummary: The build turns one corpus into machine-readable surfaces — llms.txt and llms-full.txt indexes, a Markdown mirror per page, JSON endpoints for articles, profile, and search, an OpenAPI description, and a sitemap — so an agent can cite material without parsing page layouts.
question: How can AI agents read this site?
shortAnswer: The build generates llms.txt and llms-full.txt indexes, a Markdown mirror per page, JSON endpoints for articles, profile, and search, plus an OpenAPI description — so agents can cite material without parsing page layouts.
---

**One corpus, two read paths: pages for people and interfaces for machines.** The index is [llms.txt](/en/llms.txt), and the full corpus sits at [llms-full.txt](/en/llms-full.txt).

Articles, notes, and answers each have a Markdown mirror and a JSON endpoint — /api/articles.json, /api/profile.json, /api/search-index.json — with field descriptions in [openapi.json](/openapi.json) and a sitemap at /sitemap-index.xml. The Markdown mirror is the source text that was published, so citations do not drift from the rendered page.

Asking on this site runs in three layers: curated answers, full-text retrieval, and live AI answers (see "How do search and asking work here?"). The live answers come from a same-origin worker that retrieves this site's public content before generating a source-cited, single-turn answer, without long-term memory.
