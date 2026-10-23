---
title: Live Ask 如何工作？
description: 可选的、以来源为依据的 Ask 服务及其能力边界。
contentType: answer
slug: live-ask
tags: [Ask, 检索, MCP, Cloudflare]
llmSummary: Live Ask 是一个可选的同源 Worker，它检索站点的公开内容，并可通过受限的浏览器与 MCP 接口生成有来源依据的摘要。
question: Live Ask 如何工作？
shortAnswer: Live Ask 是一个可选的 Worker，它检索本站的公开内容，并可通过受限的浏览器与 MCP 接口生成有来源依据的摘要。
---

站点默认从静态 Ask 起步：预置的策展问题与相关文章无需模型、数据库或常驻服务即可运行。**Live Ask** 是可选的同源 Worker，它会检索站点的公开内容，并生成以返回来源为依据的摘要。

它的浏览器界面带有验证、配额和速率限制；MCP 界面只暴露一个受限的 `ask` 工具。Live Ask 不提供长期记忆、任意外部操作或 elicitation，也不会冒充站点所有者。
