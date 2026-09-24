---
title: Refined-X 如何做到 Agent 友好？
description: Refined-X 如何把同一份公开内容开放给 AI Agent。
contentType: answer
slug: agent-ready
tags: [Agent, 大模型, MCP, OpenAPI]
llmSummary: Refined-X 从同一份公开内容生成 Markdown 镜像、llms.txt 文件、结构化 JSON、OpenAPI、MCP 发现元数据，以及可选的 Ask 入口。
question: Refined-X 如何做到 Agent 友好？
shortAnswer: Refined-X 从同一份公开内容生成可预期的 Markdown、llms.txt、JSON、OpenAPI、MCP 发现信息与可选的 Ask 入口，供 Agent 使用。
---

Refined-X 通过一组可预期的接口发布同一份公开内容：每页的 Markdown 镜像、`llms.txt`、`llms-full.txt`、结构化 JSON API、OpenAPI 以及 MCP 发现元数据。这样一来，Agent 在找到可引用的材料之前，需要理解的导航和页面布局就少了很多。

可选的 Ask 服务在不改动源内容的前提下，提供有来源依据的检索与摘要。“Agent 友好”意味着站点更容易被读取和接入；它并不承诺每个 Agent 都会自动发现或调用这些接口。
