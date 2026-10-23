---
title: 内容可以放在外部知识库吗？
description: Refined-X 如何发布存放在模板之外的内容。
contentType: answer
slug: external-content-vault
tags: [内容, 知识库, 配置]
llmSummary: Refined-X 支持配置外部 contentRoot，内容可以继续留在独立仓库、monorepo 或知识库中。
question: 内容可以放在外部知识库吗？
shortAnswer: 可以。通过 instance 配置把 Refined-X 指向外部 contentRoot，就能让发布模板与源仓库或知识库保持分离。
---

**可以。** 在 `instance.config.mjs` 覆盖层里配置 `contentRoot`，或者用 `REFINED_X_INSTANCE_CONFIG` 指定该覆盖层。内容可以留在独立仓库、monorepo 或知识库中，Refined-X 只承担发布层的角色。

你还可以配置 `publicDir`、`outDir` 以及可选的资源来源。把实例相关的路径和身份留在模板之外，就能在不搬移、不覆盖源内容的前提下升级 Refined-X。
