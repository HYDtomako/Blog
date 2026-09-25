---
title: 面了两三家小厂：八道 Agent 与 LLM 的面试题
description: 从第一次面试的胆怯，到把八道题一条条补上：GQA、prompt 注入、并发下的显存与 CPU、子 agent 卡死、trace 观测、摘要压缩、高危审批和 checkpoint。
contentType: note
pubDate: 2026-08-21T21:00:00+08:00
slug: interview-questions
tags: [随笔, 面试, Agent, LLM]
llmSummary: 两三家小厂面试的复盘。项目一条是 agent、一条是 LLM，题目也落在这两处：GQA 为什么好（MHA 的维度表达、MQA 的 KV Cache、GQA 分 G 组的折中）、prompt 注入的三层防御（model / agent / 权限）、一百多用户并发时的显存与 CPU·内存争抢、多 agent 子任务卡死时的 timeout 与 scheduler、trace 观测字段与十个问题、摘要压缩丢信息的补法、高危审批要带哪些信息、checkpoint 按事件而非按 step 保存。
---

面了两三家小厂，项目一条线是 agent，一条线是 LLM，题基本都落在这两处。这篇是复盘：先记感受，再写我事后整理出来的答案方向。

第一次面试是怯的。对自己写的项目自以为掌握得不错，问题一往边上追就露底——那些"边界上会怎么坏"的地方，我确实没想过。面完把没答上的记下来，一条条补，面到后面就自然了。只有真的走出去，才会收到这种反馈，所以那句"唯有尝试走出象牙塔，你才能切身融入社会"放在这里最合适：去做，而不是想。

下面这些只能算方案参考。没有什么绝对优秀的设计，合适、便捷就够了。

## 1. GQA 是怎么优化模型的，为什么好

（G 是 KV 的组数。）把谱系摆出来就清楚了：

- **MHA**：Q-K-V 一对一，G = H。特征维度上的表达最丰富，但 KV Cache 随头数线性涨，显存带宽吃得多、解码慢。
- **MQA**：所有 Q 共用一份 K-V，G = 1。显存负载和推理速度改善明显，代价是模型性能损失，训练过程也更容易不稳定。
- **GQA**：把 Q 分成 G 组，每组共用一份 K-V。取中间值——留住一部分 KV Cache 的收益，又不像 MQA 那样伤质量。

一句话：GQA 是在 KV Cache 的显存与带宽、和注意力表达力之间找平衡，G 就是那个旋钮。

## 2. prompt 注入进来，怎么办

分三层：

- **model 层**：先把权限边界立住。OpenAI 那套 System / User / 外部内容严格分层是一路；Anthropic 在训练上用 XML 格式划定输出界限，再用恶意样本训练模型辨认外部干预。
- **agent 层**：不假设模型不犯错。输入侧用小模型过滤恶意信息，输出侧防止信息暴露，再过一道 schema 检查格式和调用权限。
- **权限层**：限制 agent 的 shell 能力，最高权限留在人手里审批。

## 3. Agent 服务一百多个用户，硬件上会撞到什么

两个瓶颈。

**显存。** 模型权重是固定开销，有请求没请求都占着，留给动态使用的空间一开始就被压掉一块；真正吃显存的是 KV Cache——每个并发请求都要一份独立的 KV Cache，不同用户的历史对话没法共享，上下文越长越占。

**CPU 和内存。** 沙箱要隔离到位：不限制 CPU 配额，一个用户的死循环就能拖住另外 99 个人，连模型推理的主进程、API 网关都可能被抢，所有请求一起超时。内存同理，每个沙箱都要占一份，再碰上读 1GB CSV 这类大分配或者内存泄漏，攒起来就能撞到物理内存上限；这时 Linux 的 OOM Killer 按评分杀进程，被杀的很可能是 API 服务或数据库，而不是那个越界的沙箱。

顺着往下走，答案就是配额（CPU / 内存 / 时间）、隔离（容器或进程级）、优先级（别让推理服务跟用户代码抢同一批核心）。

## 4. 多 agent 里子 agent 卡死了怎么办

先把卡死变成可观测的状态，再谈恢复：

- 工具层要有 timeout，结果里带上 `timed_out: bool`。
- State 里管住每个 node / task：`passed: bool`（任务是否完成）、`attempt: int`、`last_error: str`、`max_attempt: int`。
- 有了这些就能重试：`attempt` 到位之后，由 lead 判断这个子任务是不是必须的——必须就报任务失败，不必须就跳过继续。
- 再往上一步是把调度抽出来：scheduler 负责 task 的生命周期，调度、状态跟踪、超时检测、取消、失败处理、重试和结果回收都归它。卡死不再是一次异常，而是一种被管理的状态。

## 5. trace 要观测哪些字段

先问 trace 是给谁看的。除了让人看穿 agent 这个"黑盒"，它同样要让 agent 自己认识任务过程的变化，所以它得能回答这十个问题：

1. Agent 做了什么？
2. 为什么做这个动作？
3. 哪个 LLM 决定了这个动作？
4. 哪个 Tool 真正执行了？
5. 执行花了多久？
6. 为什么失败？
7. 修改了哪些文件？
8. 在哪个 Workspace / Sandbox？
9. 当时的 Agent State 是什么？
10. 能不能从当时的 Checkpoint 恢复？

字段从事件推出来，而不是先定表再往里塞：把 `run_start`、`graph_update`、`tool_call`、`tool_result`、`handoff`、`checkpoint_*`、`run_end` 按顺序落进 `events.jsonl`，结束时汇总一份带耗时、节点访问、工具调用、审批、检查点的 `summary.json`，再压一份人能读的 `timeline.md`——头 40 条加尾 80 条就够看；不想要这份开销，一个 `trace_mode` 开关就能关掉。Usage 上我常看的是 `node_visits`、`approval_count`、`tool_calls`、`errors`。

## 6. 压缩摘要的时候丢了信息怎么办

分两类字段处理：结构化的一定不动（State 里的 `todo`、`task`、`sources`、`attempts`、`next_node`），只裁摘要那一层。

再补一道检查：用 verifier 比对 history message 和 summary，看关键信息是不是真的没掉。一口气压平的 flat summarization 丢细节是常见病，Gemini CLI 有个公开提案就是冲着这个去的——用 union-find 加 embedding 相似度把 turn 并成 cluster，再对 cluster 做摘要。

## 7. 高危审批弹给用户什么

弹窗是一次"自证"的机会，信息要够人做判断，又不能多到没人看：

- `name`：当前是哪个 agent 在执行，以及当前的 task / todo / review
- `workspace`：执行环境——文件路径、git worktree 分支、sandbox
- `tool_name` / `input` / `output`
- `description`：这次动作在干什么
- `context`：附加的上下文，要有上限
- `start_time` / `end_time`
- 状态怎么变的（`pending → in progress → completed`）
- 执行后改了什么（文件 / 代码）
- 产生的 error
- 这次操作要不要 user-approval

## 8. checkpoint 回退到什么状态

先把定位说清楚：**checkpoint 是 agent 的可恢复状态，不是文件快照**——文件归 git 和 worktree 管，再自造一套文件快照，等于把 git 重写一遍。

保存是按整个流转的事件驱动的，不是每执行一步存一次。事件先无条件追加进日志（append-only，崩溃最多丢最后一行），要不要顺手落一份状态快照，交给策略层判：压缩前、等人审批、中断、阶段性完成这类是硬触发；写文件、todo 变化这类软触发还要过一道节流（攒够事件数或隔够时间），状态指纹没变就直接跳过。所以事件日志是事实源，快照只是它的一次物化视图，恢复时读快照就够了，不用重放。

回退这个动作本身很轻：只挪 `head` 指针，绝不回改历史文件（LangGraph 那条"time travel 永不 mutate 旧 checkpoint"），所以来回横跳是安全的。真正回退的是 agent 的脑子——messages、todos、context 游标，以及那个还没答复的 tool_call；文件状态交给 git，恢复时只比对环境指纹（HEAD / 分支 / dirty）**报告差异，不自动回滚**。要存的东西也就三层：Agent State、执行态（未答复的调用、待审批、还在跑的 teammate）、环境态。

再往深一层，是让"恢复"变成"续跑"：快照得回答在做什么、为什么停、下一步跑什么，而且那句"继续"的前缀要幂等——反复恢复不能越套越多。

这套思路来自 LangGraph Checkpointer、JSONL 会话日志和 Temporal 的事件溯源；同一份事件流顺便还能当 trace 用，字段是按 span 语义铺的，做观测时不用重新布点。落地在 EnCoder 的 [design_checkpoint.md](https://github.com/HYDtomako/EnCoder/blob/checkpoint/design_checkpoint.md)。

## 写在最后

回头看，这八道题几乎不问"你知不知道某个名词"，问的都是"你有没有想过自己的系统在边界上会怎么坏"。第一次面试把项目讲得太顺，恰恰说明我没进过那些角落。

面试像个外部检查器：它不问你学了什么，问你哪里还没想过。所以还是那句话——去做，而不是想。
