---
title: 排版示例：把版式一次看全
description: 一篇把站点支持的排版元素都摆出来的示例文章。照它的结构写，换成你自己的内容即可。
contentType: article
pubDate: 2026-01-02
slug: typography-sample
tags: [示例, 排版]
llmSummary: 占位排版示例，用一份正文把标题层级、行内格式、列表、引用、代码块、表格、图片、分隔线以及 frontmatter 约定逐项示范一遍，供模板使用者照结构填写自己的内容。
---

这是一篇排版示例。它不准备讲什么道理，只是把本站正文支持的版式从头到尾摆一遍，方便你写第一篇时挑着用。看完可以整篇删掉，或者直接把它当骨架，把每节的内容换成你的。

## 标题与目录

正文标题用 `##`（二级）、`###`（三级）、`####`（四级）。文章右侧的目录只收这三档，且整篇至少要有两个标题才会显示。`#` 一级标题留给页面标题本身，正文里别用。

### 三级标题

三级标题会在目录里缩进一层显示。

#### 四级标题

四级标题更深一层。再往下（`#####`）不进目录，也不建议用。

## 行内格式

常用的行内格式都能写：**加粗**、*斜体*、`行内代码`、[超链接](https://example.com)、~~删除线~~。

## 列表

无序列表：

- 第一项
- 第二项
  - 嵌套一层，用于细分
  - 再来一条
- 第三项

有序列表：

1. 第一步
2. 第二步
3. 第三步

任务清单（GFM 语法）：

- [x] 已经完成的事项
- [ ] 还没做的事项

## 引用

> 引用块适合放原文摘录、旁注或一句题记。
> 多行会连成同一个块。

## 代码

行内写 `npm run dev`。独立代码块可以标语言，渲染时按语言高亮：

```sh
npm run dev
```

```ts
type Post = { title: string; slug: string };

const post: Post = { title: '排版示例', slug: 'typography-sample' };
console.log(post);
```

## 表格

| 字段 | 用途 | 谁在看 |
| --- | --- | --- |
| `description` | 文章摘要 | 读者与搜索引擎 |
| `llmSummary` | 给 Agent 的摘要 | `/llms.txt`、Markdown 镜像、JSON 接口 |
| `tags` | 生成标签页 | 站内导航 |

## 图片

把图片放进 `public/asset/`，正文里用标准写法引用：

![示例图片](/asset/og-default.png)

如果你习惯 Obsidian 的写法，`![[og-default.png]]` 会解析到同一个地址。

## 分隔线

三个连字符就是一条分隔线，用来切分大段：

---

## frontmatter 与几个约定

- 文章的 URL 由 `pubDate` 和 `slug` 决定：`/YYYY/MM/DD/<slug>/`，改这两个字段会改地址。
- `description` 给人看，`llmSummary` 给 Agent 看（会出现在 `/llms.txt`、Markdown 镜像与 JSON 接口里）。
- `tags` 会自动生成标签页；想归入系列，得先在 `content/series/<locale>/series.json` 里登记 `series`。
- 中英文分别放 `content/articles/zh-CN/` 与 `content/articles/en/`，同一篇文章建议保持 `slug` 一致。
