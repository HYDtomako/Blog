---
title: Agent 或 AI 怎么读取本站内容？
description: 站点为 AI Agent 与阅读器准备的可读接口。
contentType: answer
slug: agent-ready
tags: [Agent, 可读性, 接口]
llmSummary: 站点用同一份内容生成多种机器可读接口：llms.txt 与 llms-full.txt 目录、每页的 Markdown 镜像、articles/profile/search-index 等 JSON 接口、OpenAPI 描述和站点地图，Agent 不必解析页面布局就能取到可引用的材料。
question: Agent 或 AI 怎么读取本站内容？
shortAnswer: 从同一份内容生成 llms.txt、llms-full.txt、Markdown 镜像、JSON 接口和 OpenAPI 描述，Agent 不用解析页面布局就能拿到可引用的材料。
---

**同一份内容，既有给人看的页面，也有给机器读的接口。** 入口目录是 [llms.txt](/llms.txt)，完整语料在 [llms-full.txt](/llms-full.txt)。

文章、随笔和问答都有对应的 Markdown 镜像与 JSON 接口，例如 /api/articles.json、/api/profile.json、/api/search-index.json；接口字段说明在 [openapi.json](/openapi.json)，站点地图在 /sitemap-index.xml。Markdown 镜像就是发布时用的原文，引用时不会和页面渲染产生出入。

站内提问走三层：策展答案、全文检索，以及实时 AI 问答（见「本站的搜索和提问是怎么工作的？」）。实时回答由同源的 Worker 提供——它先检索本站公开内容，再生成带来源引用的答案，保持单轮、不做长期记忆。
