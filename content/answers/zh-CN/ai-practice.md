---
title: 站点记录了哪些 AI 实践？
description: 从 Transformer 笔记到 Agent 工程和能跑起来的小工具。
contentType: answer
slug: ai-practice
tags: [AI, Agent, 学习笔记]
llmSummary: 站点的 AI 内容分三层：Transformer 与深度学习的学习笔记、Agent 工程机制的源码阅读笔记（Agent Loop、工具、上下文压缩、多 Agent 协作），以及把这些机制用起来的小工具，例如 EnCoder 与 QQbot。
question: 站点记录了哪些 AI 实践？
shortAnswer: 分三层：Transformer 与深度学习的学习笔记，Agent 工程机制的源码阅读笔记（Agent Loop、工具、上下文压缩、多 Agent），以及把这些机制用起来的小工具，比如 EnCoder 和 QQbot。
---

**AI 是这里的主线，写下来的内容大致分三层，从机制到能跑起来的东西。**

第一层是基础机制：[Transformer 学习笔记](/2026/04/04/transformer-learning-notes/)把 Token、位置编码、Q/K/V 注意力、多头注意力和层归一化按数据流拆开讲；Simple_CNN 记录了从卷积、池化到完整训练的复现过程。

第二层是 Agent 工程：[三个 Claude Code 实现](/2026/08/23/agent-engineering-from-claude-code/)放在一起读，Agent Loop、工具定义、上下文注入与压缩、并行工具与子 Agent、多 Agent 协作和安全边界串成了一条线；Minimind-notes 则是大模型结构与训练方法的学习记录。

第三层是能跑起来的东西：EnCoder 在最小 Agent 实现上补了定时调度、长期记忆、Agent 团队与任务管理；QQbot 用 pi 当大脑、NapCatQQ 做连接，覆盖知识问答、课表查询、群管理、长期记忆和模型热切换。项目清单都在[项目页](/projects/)。
