---
title: 学习 Learn Claude Code：从 Agent Loop 到 Harness
description: 把工具调用、权限、任务状态、异步事件和多 Agent 协作的实现摊开之后，我才发现：难点不在功能多少，而在那些必须由宿主兜住的边界、时序和协议。
contentType: note
pubDate: 2026-10-14T12:00:00+08:00
slug: learn-claude-code-harness
tags: [学习笔记, Agent, Claude Code, Harness]
llmSummary: 基于 learn-claude-code 教学项目的模块笔记扩写（笔记写于 2026 年 6、7 月，2026 年 10 月整理成文）。内容沿最小工具调用循环展开：Agent Loop 的消息协议细节（tool_use_id 关联、单轮多工具调用、停止条件）；工具 schema/handler 分离与 safe_path 内层边界；权限三道闸门、拒绝即反馈；Hook 四事件与首个非 None 短路语义；Todo、Task System、Memory 三种状态对比及各自的校验与生命周期；任务文件持久化、锁内原子领取与依赖解锁；background/cron/team 事件统一在轮次边界作为新用户消息交付；队友状态机、IDLE 先处理消息再领任务、Task→Assignment→CWD 绑定与轮次边界释放；带 request_id 与 work_version 的审批、关机协议；worktree 的 fail-closed 与部分失败处理；MCP 命名与动态工具池、Skill 渐进式披露、Goal Loop 的验收缺口。明确标注哪些是教学实现、哪些尚未完成，文末附项目链接。
---

学习 Learn Claude Code 的时候，我把内容拆成了一组模块笔记：Agent Loop、Tools、Permission、Hook、Todo、Task System，再到 Background Tasks、MCP、Memory 和 Agent Teams。

刚开始看，每个模块都像是在给 Agent 加一个功能。工具多一点，记忆长一点，再多几个 Agent，似乎系统就会越来越强。

但把实现细节摊开之后，我现在更愿意沿着另一条线理解它们：**一个最小的工具调用循环，怎样逐渐长成一个能约束行动、保存状态、交付事件、协调工作的运行环境。** 这个运行环境，就是这里说的 Harness。

先说明两件事。时间上，这些是今年 6、7 月学习时记下的模块笔记，最近才整理成文；边界上，下面整理的是我的学习笔记和教学实现，不是 Claude Code 官方源码的还原。材料里有的部分是相对完整的代码（比如多 Agent 那一份），有的只是省略了依赖的片段，还有的（记忆、定时、验收）停在设计说明。我会尽量在每一处说清楚它走到了哪一步。对我来说，这次学习的价值不是记住产品有哪些功能，而是把这些功能背后的工程问题讲清楚。

## 一、Agent Loop 很小，关键是把反馈接回来

最小的 Agent Loop 只有几十行。把接口细节补上，大致是这样：

```python
while True:
    response = client.messages.create(
        model=MODEL, system=SYSTEM, messages=messages,
        tools=TOOLS, max_tokens=8000,
    )
    messages.append({"role": "assistant", "content": response.content})

    if response.stop_reason != "tool_use":
        return

    results = []
    for block in response.content:
        if block.type == "tool_use":
            output = run_tool(block)
            results.append({
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": output,
            })
    messages.append({"role": "user", "content": results})
```

看着简单，但几个细节一个都不能省：

- **assistant 的原始响应要原样保存。** 工具结果后面要引用里面的 `tool_use` 块，历史里少了它，模型就看不到自己刚才请求过什么。
- **一次响应可以有多个工具调用。** 循环要遍历所有 `tool_use` 块，把它们的输出合并成一条 user 消息放回去；不能只处理第一个，也不能拆成多条消息——协议要求每个请求都有对应结果。
- **`tool_use_id` 是唯一的关联关系。** 同一轮里模型可以连发两条 bash，结果靠 id 对上号；少了它，模型看到的就是一堆失去来源的文本。
- **工具的输出都是字符串。** 对象、异常、退出码，最后都要翻译成模型能读的文本——处理函数返回什么类型，模型并不关心。

这让我第一次明确地区分了两件事：**模型提出行动，宿主执行行动。** 模型输出一个 Bash 调用，不等于它自己运行了命令；真正改变文件、启动进程的，是宿主侧的处理函数。

因此，工具报错也不是闭环之外的意外：命令失败、工具不存在、权限被拒绝，都应该成为模型下一步能读到的反馈。落实现里就是这么做的——工具查不到，返回 `Unknown tool`；处理函数抛异常，捕获成 `Error: ...`；命令超时，返回 `Error: Timeout (120s)`。**Agent 的基本单位，不是一次漂亮的回答，而是一次行动，以及行动之后还能继续使用的结果。**

我也注意到这个循环的停止条件只有一个：模型不再请求工具。至于「活干完了没有」，循环本身不做判断——后面几节的 Hook、Goal Loop、验收，其实都在补这个缺口。

## 二、工具注册只是入口，权限和 Hook 决定边界

`Tools.py` 把三件事分开了：给模型看的工具定义（名字、描述、参数 schema）、真正执行的处理函数，以及两者之间的分发表。

```python
TOOL_HANDLERS = {
    "bash": run_bash, "read_file": run_read, "write_file": run_write,
    "edit_file": run_edit, "glob": run_glob,
}
```

模型给出工具名和参数，宿主查表调用。这样加一个工具不用重写循环，只加一条定义和一个 handler——「工具被注册」解决的是可调用性，不是它的能力边界。

真正决定边界的是工具内部的检查。所有文件工具都先过一遍路径解析：

```python
def safe_path(p: str) -> Path:
    path = (WORKDIR / p).resolve()
    if not path.is_relative_to(WORKDIR):
        raise ValueError(f"Path escapes workspace: {p}")
    return path
```

先 `resolve()` 再判断是否还在工作区里，`..` 和符号链接都绕不出去；glob 的每个匹配结果也单独再查一遍。这是内层边界，是最后一扇门。而具体到每个工具，边界也不只是路径：bash 有 120 秒超时、stdout/stderr 合并、5 万字符截断、空输出显式写成 `(no output)`；编辑工具要求匹配**恰好一处**才动手，匹配零处或多处都返回错误——在自动化的语境里，改错了地方比不改更贵。

外层是权限检查，笔记把它拆成三道闸门：危险命令硬拒绝、规则匹配、必要时问用户。最容易写错的其实是拒绝的写法：

```python
if not check_permission(block):
    results.append({"type": "tool_result", "tool_use_id": block.id,
                    "content": "Permission denied."})
    continue
```

**拒绝不会终止任务，它变成一条普通的工具结果。** 模型看到「被拒绝」，可以换一种做法继续做；这比让整轮失败温和得多，也更接近真实协作——被拒绝本来就是一个事实，而不是错误。

Hook 是把这类策略从循环里搬出去的地方。四个事件：`UserPromptSubmit`、`PreToolUse`、`PostToolUse`、`Stop`。注册的回调按顺序执行，**第一个返回非 None 的就短路**，返回值被当作「停下」的理由：

```python
def trigger_hooks(event, *args):
    for callback in HOOKS[event]:
        result = callback(*args)
        if result is not None:
            return result
    return None
```

这样循环本身保持稳定，权限、日志、大输出提醒都从外面注册。Todo 那版还利用 Stop 事件做「继续」：模型停下时如果 Stop hook 返回一条消息，循环就把这句话追加进对话再来一轮——同一个机制，既能拦，也能推。

而且「同一个策略在不同执行者身上形状不同」。多 Agent 代码里的队友没法弹窗问用户，于是权限检查以 `prompt_user=False` 的方式运行：越界时返回的不再是「拒绝」，而是「需要 Lead 来执行」。拒绝理由变成了转交理由。另一个容易踩的坑是内外层不一致：外层批准了某个路径，内层如果还固定拒绝，模型收到的是互相矛盾的规则。

最后是黑名单的限度。Bash 用字符串匹配拦危险命令（`rm -rf /`、`sudo`、`shutdown`……），这适合理解检查发生在哪里，却不能当作可靠的隔离方案：Shell 能做的事情远比几个模式多。**允许模型请求工具，与允许工具在机器上产生什么副作用，是两个不同的问题。**

## 三、长任务需要状态，但不是所有状态都叫记忆

当任务从「改一行」变成「读代码、设计、实现、验证」，仅靠消息历史就开始吃力。Todo、Task System、Memory 都在补状态，但它们补的不是同一种东西。

| 模块 | 主要回答的问题 | 生命周期 |
| --- | --- | --- |
| Todo | 我现在打算做什么，做到哪一步了？ | 当前任务的计划与进度 |
| Task System | 哪项工作可以开始，由谁负责，依赖是否满足？ | 可持久化的工作单元 |
| Memory | 下次会话还值得知道什么？ | 跨会话的背景信息 |

### Todo：可见性，不是控制

Todo 是一份摆在对话里的计划，更新通过一个 `todo_write` 工具完成。它的写法有两个讲究：一是**先校验、再整体替换**——内容不能为空、进行中的任务只能有一个、收尾时应当全部完成，验证不过就不动现有列表，而不是往数组里追加一条；二是还有个小机制：如果连续三轮都没碰过 Todo，运行时会往工具结果后面追加一句 `<reminder>Update your todos.</reminder>`。

它不强制模型做什么，只是提醒。因为 Todo 的本质是让进度可见，而不是让运行时替模型做计划——模型写下「完成」，和代码真的通过验证，也还是两回事。

### Task System：任务图解决「能不能开始」

Task System 把工作变成了可持久化的对象：一个任务一个文件，字段里除了状态和负责人，还有依赖。

```python
@dataclass
class Task:
    id: str
    subject: str
    status: str          # pending | in_progress | completed
    owner: str | None    # 负责当前任务的 Agent
    blockedBy: list[str] # 依赖的任务 ID 列表
```

「数据库做完之后，哪些任务可以继续」由此变成一次计算：`can_start` 检查所有依赖是否已完成，缺文件也算未完成；完成的动作还会筛出**这次完成新解锁**的任务，把「下一步能做什么」一并推回给模型。领取和完成都带条件：只有 `pending` 且无人认领的任务能被领取；只有负责人本人才能标记完成——别人干到一半的活，哪怕你有权限改文件，也不能替它结账。

### Memory：记忆首先是信息治理

Memory 最接近我们平时说的「记住」，但它要回答的其实是四个问题。

存什么：候选必须带 scope，只有 `persistent` 的才保留；带「本次会话」「当前任务」这类临时含义的会被词表拦掉——「这次不要创建文件」只约束当前任务，不该在下次会话继续生效。存成什么：一个记忆一个 Markdown 文件，前面是 name / description / type 元信息，另有索引文件逐行登记。怎么取：先让模型基于索引做语义匹配，匹配失败就退回关键词排序——允许「记不清」，但不允许取错就当没有。怎么维护：到一定规模后合并重复、更新矛盾、删除过期，**替换前先保存快照**，写失败时恢复原文件并重建索引。

有一条原则我觉得比实现更重要：**召回的记忆是背景，不是命令。** 与当前请求冲突时，以当前请求为准；不然旧信息就获得了替用户发号施令的权限。

我的记忆笔记写到设计为止，没有实现。但这句话值得先留下：把所有历史都存下来，不等于拥有了可靠的记忆；也可能只是把旧误解保存得更久。

## 四、后台任务、定时任务和队友消息，共享同一个问题

Background Tasks、Cron 和 Agent Teams 表面上差别很大：一个运行耗时命令，一个等待时间到达，一个等待其他 Agent 回信。但站在 Agent Loop 的入口看，它们都在问同一件事：**模型没有在看这件事的时候，宿主侧发生了变化，怎么把变化交给下一轮模型？**

后台任务的第一个决定是「不等」。耗时的 Bash 显式带上 `run_in_background`，工具立刻返回一个 id，真正的进程在另一个线程里跑：

```python
with self._lock:
    self.tasks[task_id]["status"] = status
    self.results[task_id] = _format_bash_result(output, exit_code)
    # 完成并不立刻给 agent，而是进入 ready 列表，
    # 等到下一轮 Agent Loop 再交付
    self._ready.append(task_id)
```

交付的形式同样讲究：任务真正结束时，结果不是插进当前对话中间，而是等这一轮结束，作为一条新事件追加进去：

```
<task_notification>
Background task bg_0001 completed.

npm install finished successfully.
</task_notification>
```

**「已启动」和「已完成」是两条不同的消息。** 模型不会把启动确认误读成结果，完成通知也不必打断正在进行的推理。

Cron 的思路一致：每秒检查有没有到期任务，但到点只入队，不抢占当前正在执行的模型调用；用 `last_fired` 防止同一分钟重复入队，用 `pending_delivery` 标记「还没交付」。9 点的任务如果 9 点 03 分才轮到，也照样交付——宁可晚，不要挤。

团队消息走同一条路，只是入口在 CLI：运行时同时等用户输入和 Lead 的收件箱，一旦有队友消息，就把它们格式化成一段 `[Team events] ...` 追加为新的 user 消息，唤醒 Lead 进入新一轮。

把这些放在一起看，规律就清楚了：**异步事件都要在轮次边界进入消息历史，并且统一伪装成「用户消息」**——因为它们对模型来说，确实就是新的输入。模型不需要理解线程、队列和定时器，它只要在下一次被调用时看到发生了什么。

这套机制的代价也要说清楚。文件邮箱是「读完即删」的：取走消息和模型真正读到之间如果崩溃，消息就丢了，没有 ack 和重试。后台任务的 ready 队列在内存里，进程重启同样会丢。定时任务的 `durable` 字段许诺了跨会话保留，但落到实现还有距离。**「能跑」和「能恢复」之间隔着的，就是这一层。**

## 五、多 Agent 最难的不是启动线程，是把工作边界绑定好

这组材料里，`agent_team_code.py` 是相对完整的一份实现：任务存储、邮箱、队友线程、计划审批，以及任务与 worktree 的绑定，都能在同一个程序里看到。它开头那张图（Lead 生成任务 → 队友 WORK/IDLE → 事件回到消息总线）看着很整洁；实际复杂度全在状态的边上。

### 队友不是「多一个模型」，是一段带状态的运行时

每个队友是一个持有自己消息历史、system prompt 和工具集的线程，在四个状态之间走：working、waiting_approval、idle、stopping。它空闲时的行为顺序值得抄下来：

```python
def wait_for_work(self):
    while True:
        inbox = BUS.wait_for_messages(self.name, IDLE_SCAN_INTERVAL)
        if inbox:
            ...            # 先处理 Lead 的消息
        task = claim_next_task(self.name)
        if task:
            ...            # 没有消息，再去找 ready 任务
```

**先处理消息、再领任务**；没有活就等两秒再看一圈。任务做完了也不退出，回到 idle——这就是「持久队友」的含义：身份和上下文在进程内一直保留。

但它和「跨会话恢复」不是一回事：任务文件留在磁盘上，消息历史、审批状态和运行时绑定都只在内存里，进程重启就没了。这一点我在笔记里标了两次，因为它太容易被一句「持久化」含糊过去。

Lead 一侧的规则正好相反：生成队友之后就应该结束这一轮，不再轮询状态。真正把 Lead「叫醒」的是运行时——CLI 检测到收件箱里有东西，把事件追加成消息，再触发一次 model 调用。减少的是模型层的轮询，不是全部轮询：CLI 每 0.25 秒看一眼输入和邮箱，空闲队友每 2 秒扫一次任务。

### 看见任务可做，不等于已经领到任务

多个队友可能同时看到同一个 ready task。「先扫描，再改状态」不够，领取必须是一个原子操作：

```python
def claim_task(task_id, owner):
    with task_store_lock():            # 线程锁 + 文件锁
        task = load_task(task_id)
        if task.status != "pending": ...
        if task.owner: ...             # 已被别人领走
        if not can_start(task_id): ... # 依赖没完成
        task.owner = owner
        task.status = "in_progress"
        save_task(task)                # 临时文件 + os.replace
        teammate_assignments[owner] = {"task_id": task.id, "cwd": cwd}
```

检查、修改、保存都在同一把锁里。锁有两层：线程内的 `RLock`，和建立在任务目录上的文件锁（fcntl.flock），后者让同一台机器上多个宿主进程也不会抢到同一个任务。写入用临时文件加 `os.replace` 原子替换，避免留下写坏一半的任务文件。还额外限制了「一个队友同时只有一件事」：已有 assignment 或已有进行中任务时，领取直接拒绝。

任务图解决的是「能不能开始」，原子领取解决的是「谁可以开始」。前者不能替代后者。

### 任务边界，也要变成文件操作边界

不同 Agent 放进不同 worktree，只是准备好了不同的工作目录。真正重要的是，后续工具调用到底在哪个目录里执行。

这份实现维护了一张注册表：Task → Assignment → CWD。队友的每个文件工具都不直接用工作区根目录，而是通过 assignment 换取目录：

```python
def assignment_cwd(owner):
    ...
    if task.status not in {"in_progress", "completed"} or task.owner != owner:
        raise ValueError(f"Assignment for {owner} is no longer active")
    ...
    if cwd.resolve() != Path(assignment["cwd"]).resolve():
        raise ValueError(f"Assignment cwd changed for task {task.id}")
```

绑定坏掉时拒绝执行，而不是悄悄退回主目录——**fail closed，而不是 fail open**。任务已经不属于自己、工作目录和记录对不上，工具宁可报错也不动手。

里面还预判了一个很细的时序问题：同一次模型响应可能先调用「完成任务」，随后又调用文件工具。如果完成任务时立刻释放目录绑定，后面的操作就可能落到错误目录。所以释放被推迟到轮次边界——模型这一轮不再调用任何工具时才执行，而且只释放「已完成且确实属于自己」的 assignment。一个看起来只是「删掉一个字典项」的动作，实际是状态机的一部分。

worktree 的创建和移除也全都围着「一致性」设计：创建前校验任务状态、分支名和 Git 注册表；Git 成功但任务绑定失败时，返回的不是简单报错，而是一段说明残留物的「部分成功」，让人手动收尾；移除要求任务已完成、没有队友还租着这个目录、工作区是干净的（除非显式要求丢弃改动），而且分支永远保留。这些处理看着啰嗦，指向的却是同一件事：**在多个写者之间，最贵的不是创建，是不知道现在到底什么状态。**

### 审批要批准一份具体的工作，而不是一个名字

计划审批也不能只有「同意这个队友」这么简单。队友可能已经换了任务，计划也可能已经变了。

代码把审批做成一个有编号的请求协议：消息带 `request_id`，请求里记着 `work_version`（assignment 版本）和 `task_id`。队友提交计划时生成请求、把门禁置为 pending；Lead 批准时要检查这份请求是否还指向该队友**当前**的工作；队友收到批准时也要反过来核对，request_id、task_id、版本号全部匹配才生效：

```python
valid = (
    msg["from"] == "lead" and msg["to"] == name
    and request_id == expected_id
    and state.work_version == work_version
    and state.task_id == task_id
    ...
)
```

任务一变，版本号加一，旧审批自动失效。这样批准的才是「这份任务的这个版本」，而不是给某个 Agent 一张可以一直使用的通行证。

审批还连着执行权限：计划未批准时，队友的 bash / write / edit 被门禁拦住，返回 `Blocked: plan status is ...`；读文件、看任务不受影响。**有些消息只是信息，有些消息会改变执行权限；后者需要明确的协议和状态检查。** 关机同理：Lead 发出带 request_id 的关机请求，队友核对通过后回 ack，在轮次边界退出；退出时把没做完的任务退回 pending——放弃的工作要回到任务板，而不是烂在某个线程里。

### 这里没有解决的问题

要说清楚的是，这些机制仍然建立在「同一进程」的假设上。队友是守护线程，进程退出，消息历史、审批状态、租约全部消失；邮箱读完即删，没有 ack 和重试；「生成队友前先问用户」写在 system prompt 里，靠模型遵守，不是代码强制；队友的工具权限也只覆盖 bash / write / edit，其它调用是绕过的。

一个能长期无人值守的多 Agent 系统，还要在这里继续补可靠性。这也是这组笔记最诚实的地方：**教学实现把问题摆出来，但不会假装它们已经解决。**

## 六、扩展能力不是终点，验收才是闭环的另一半

剩下几个模块，我现在会放在两个方向上理解。

一个方向是扩展模型能使用的能力。Skill 用渐进式披露：系统提示词里只放每个技能的 name 和 description，合适的时候再加载正文——因为每一次组装提示词，都是在争抢有限的上下文。MCP 让外部工具进入工具池：server 提供工具和调用入口，harness 负责连接、命名、权限和分发。

```python
# mcp__{server}__{tool}
# 不同 server 可能有同名工具：docs.search() / github.search()
```

两个细节值得记：工具池是**每轮重新组装**的，因为会话中途可能连上新的 server；`mcp__server__tool` 这个前缀是给模型看的名字，真正的调用入口由 harness 分发。材料里的 MCP 还是 mock 示例，不能等同于已经接通了真实协议。

另一个方向是控制任务怎样推进。Workflow 把已知步骤组合起来，例如先并行跑三项检查，再串行验证，然后作为一个工具注册出去——它强调的是「组合」，把多个动作打包成一个更大的动作。

Goal Loop 处理的则是另一类问题：模型停下了，但事情没办成。笔记里那个例子很典型：修复 → 跑 pytest → 发现 error → 这一轮结束了。设计意图是在模型停止后分析结果，如果还有 error / block，就再推一轮。

但「发现错误就再叫模型一次」不是完整的答案。基础循环本来就会把工具错误喂回去；真正缺的是：**模型停止以后，谁来判断目标是否已经达成**。只扫描消息里有没有 `error` 太粗糙——没有错误文本，不代表用户要的场景能工作；有错误文本，也不一定代表整项任务失败。要继续推进，至少需要明确的验收标准、可读取的验证结果，以及重试和停止的边界。

这份材料最后留了一组自测题，有一条我印象最深：上下文压缩、429 / 529 恢复，为什么属于 Agent Runtime 而不是 LLM 本身？因为它们都发生在**回合之间**——模型看不见的间隙里，宿主负责收拾状态。整理下来，运行时的职责其实是一张清单：

```
USER
  ↓
UserPromptSubmit Hook
  ↓
Agent Runtime
  Memory / Skills / MCP State /
  Cron Queue / Background Notifications / Team Messages
  ↓
assemble_system_prompt → LLM → tool_use?
```

运行环境不仅要让 Agent 知道「发生了什么」，还要给它一个可检查的「什么算完成」。

## 记下来的主线

回头看，我不再把这些模块理解成一串并列功能，而是同一个循环在不断遇到新的工程问题：

- 行动需要反馈，于是有工具结果回填；连拒绝和报错也要回填。
- 行动会产生副作用，于是有权限、路径检查和 Hook；但拒绝是反馈，不是终止。
- 工作跨越很多轮，于是要区分计划、任务和长期记忆；三者的生命周期完全不同。
- 结果可能晚到，于是有队列和事件交付；所有异步事件都在轮次边界变成新的用户消息。
- 多个 Agent 同时工作，于是需要原子领取、目录绑定、带版本的审批协议。
- 模型可能提前停下，于是还需要独立的验收依据。

这次学习带给我的变化，是注意力从「模型下一步会怎么想」，转到了「宿主怎样让这一步安全地发生，并让下一步有据可依」。

**Agent Loop 负责把行动接起来，Harness 负责让这些行动有边界、有状态、有反馈；而是否真的做成了，还要交给验证。**

这份材料的开头有一句话我一直记着：Agency 来自模型训练本身，agent 产品等于「模型 + Harness」——模型是司机，Harness 是车。这组笔记摊开的就是造车的零件：每一个都不难理解，难的是让它们同时成立。

这比记住十几个模块名，更值得留下来。

（原始材料：[shareAI-lab/learn-claude-code](https://github.com/shareAI-lab/learn-claude-code)，一个从 0 到 1 实现 nano claude-code 风格 agent harness 的教学项目；文中代码片段来自该项目与我的模块笔记。）
