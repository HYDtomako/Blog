---
title: "Two or three small-company interviews: eight questions on agents and LLMs"
description: From first-interview nerves to patching the gaps one by one — GQA, prompt injection, memory and CPU limits under concurrency, stuck sub-agents, trace fields, summary compression, approvals, and checkpoints.
contentType: note
pubDate: 2026-08-21T21:00:00+08:00
slug: interview-questions
tags: [notes, interviews, Agent, LLM]
llmSummary: A debrief of two or three interviews at small companies. The projects were one agent and one LLM, and the questions landed in the same two places — why GQA works (MHA's dimensional expressiveness, MQA's KV cache, GQA as the middle ground), three layers of prompt-injection defence (model / agent / permissions), VRAM and CPU-and-memory contention with a hundred-plus concurrent users, what to do when a sub-agent gets stuck (timeouts and a scheduler), which fields a trace should observe and the ten questions it must answer, recovering information lost in summary compression, what a high-risk approval prompt has to show, and saving checkpoints by event rather than per step.
---

Two or three small companies, one project on the agent side and one on the LLM side, and the questions landed almost entirely in those two places. This is the debrief: the experience first, then the answer directions I sorted out afterwards.

The first interview was timid. I thought I had a solid grip on my own project, and the moment a question walked one step sideways I was exposed — the places where a system breaks at its edges were exactly the places I had never thought about. So I wrote down what I could not answer, patched the gaps one by one, and by the later interviews it felt natural. That kind of feedback only reaches you if you actually step out, which is why "you have to leave the ivory tower to take part in society" fits here: do it, rather than think about it.

What follows is only a rough reference. There is no absolutely superior design — fitting and convenient is enough.

## 1. How does GQA optimize a model, and why is it good

(G is the number of KV groups.) The lineage makes it clear:

- **MHA**: Q-K-V paired one to one, G = H. The richest expression along the feature dimension, but the KV cache grows linearly with the head count — heavy on memory bandwidth, slow to decode.
- **MQA**: every Q shares one K-V, G = 1. Memory load and inference speed improve markedly; the price is model quality and less stable training.
- **GQA**: split the Qs into G groups, each group sharing one K-V. The middle ground — keeping part of the KV cache win without damaging quality the way MQA does.

In one line: GQA balances the KV cache's memory and bandwidth against attention's expressiveness, and G is the dial.

## 2. What do you do when a prompt injection arrives

Three layers:

- **Model layer**: establish the permission boundary first. OpenAI's strict System / User / external-content split is one route; Anthropic delimits output with XML tags during training and uses malicious samples to teach the model to recognise outside interference.
- **Agent layer**: never assume the model won't make mistakes. A small model filters malicious input on the way in and guards against information exposure on the way out, before the output is checked against a schema for format and call permissions.
- **Permission layer**: limit the agent's shell capability and keep the highest privileges behind human approval.

## 3. An agent serving a hundred-plus users: what breaks in hardware

Two bottlenecks.

**VRAM.** Model weights are fixed overhead — they occupy memory whether or not a request is in flight, so the space left for dynamic use is squeezed from the start. What really eats VRAM is the KV cache: every concurrent request needs its own copy, because different users' conversation histories cannot be shared, and the longer the context the more it takes.

**CPU and memory.** Sandbox isolation has to hold: without CPU quotas, one user's infinite loop drags down the other ninety-nine, and the model-inference process and API gateway can be starved until every request times out. Memory is the same story — every sandbox takes a share, and a large allocation like reading a 1GB CSV, or a leak, adds up to the physical memory ceiling. Then Linux's OOM killer scores and kills processes, and the likely victim is an API service or the database rather than the sandbox that overran.

Following that upward, the answer is quotas (CPU / memory / time), isolation (container or process level), and priority (don't let inference services compete for the same cores as user code).

## 4. What do you do when a sub-agent in a multi-agent run is stuck

First make the stuck state observable, then talk about recovery:

- The tool layer needs a timeout, with `timed_out: bool` in the result.
- State keeps each node / task honest: `passed: bool` (did it finish), `attempt: int`, `last_error: str`, `max_attempt: int`.
- With those in place, retry: once `attempt` is exhausted, the lead decides whether the subtask is required — required means report the task failed, not required means skip it and move on.
- One step further is to extract scheduling: a scheduler owns the task lifecycle, covering dispatch, state tracking, timeout detection, cancellation, failure handling, retry, and result collection. A stuck task stops being an exception and becomes a managed state.

## 5. Which fields should a trace observe

Ask first who the trace is for. Beyond letting a person see through the agent's "black box", it should let the agent understand how the task changed over time, so it has to answer ten questions:

1. What did the agent do?
2. Why did it take that action?
3. Which LLM decided on the action?
4. Which tool actually executed it?
5. How long did the execution take?
6. Why did it fail?
7. Which files were modified?
8. In which workspace / sandbox?
9. What was the agent state at that moment?
10. Can it be recovered from the checkpoint taken then?

Derive the fields from events rather than defining a table and filling it in: write `run_start`, `graph_update`, `tool_call`, `tool_result`, `handoff`, `checkpoint_*`, and `run_end` into `events.jsonl` in order, produce a `summary.json` at the end with duration, node visits, tool calls, approvals, and checkpoints, then compress a human-readable `timeline.md` — the first 40 entries plus the last 80 are enough; when the overhead isn't wanted, a `trace_mode` switch turns it off. In usage I watch `node_visits`, `approval_count`, `tool_calls`, and `errors`.

## 6. What do you do when a compressed summary loses information

Split the fields in two: structured ones never move (the `todo`, `task`, `sources`, `attempts`, `next_node` in state), and only the summary layer gets trimmed.

Then add a check: a verifier compares the history messages against the summary to see whether key information really survived. Flat summarization that compresses everything in one pass losing detail is a common failure, and a public proposal in Gemini CLI is aimed exactly at it — union-find plus embedding similarity to merge turns into clusters, and summarise the clusters instead of flattening the whole conversation.

## 7. What does a high-risk approval show the user

The prompt is a chance to justify itself: enough information for a person to decide, not so much that nobody reads it.

- `name`: which agent is running, plus the current task / todo / review
- `workspace`: the execution environment — file paths, git worktree branch, sandbox
- `tool_name` / `input` / `output`
- `description`: what this action does
- `context`: additional context, with a limit
- `start_time` / `end_time`
- how the state changed (`pending → in progress → completed`)
- what changed after execution (files / code)
- errors produced
- whether this operation needs user approval

## 8. What state does a checkpoint roll back to

Start with the positioning: **a checkpoint is the agent's recoverable state, not a file snapshot** — files belong to git and worktrees, and a second file-snapshot layer would just be rewriting git.

Saving is driven by the events of the whole flow, not once per step. An event is appended to the log unconditionally first (append-only, so a crash loses at most the last line); whether to also write a state snapshot is up to a policy layer — compression, waiting for approval, an interrupt, or a stage finishing are hard triggers; file writes and todo changes are soft triggers that still pass a throttle (enough events, or enough time), and an unchanged state fingerprint skips it outright. So the event log is the source of truth and a snapshot is only its materialized view: a restore reads the snapshot and needs no replay engine.

The rollback itself is light: it moves the `head` pointer and never rewrites history (LangGraph's "time travel never mutates an old checkpoint"), so jumping back and forth is safe. What actually rolls back is the agent's mind — messages, todos, the context cursor, and the tool call that was never answered; file state stays with git, and a restore only compares environment fingerprints (HEAD / branch / dirty) and **reports the difference rather than rolling files back**. That is why a snapshot carries three layers: agent state, execution state (the unanswered call, the pending approval, teammates still running), and environment state.

One step further turns a restore into a resume: the snapshot has to answer what it was doing, why it stopped, and what to run next, and the "continue" prefix has to be idempotent — repeated restores must not stack it up.

The thinking comes from LangGraph's checkpointer, JSONL session logs, and Temporal's event sourcing; the same event stream doubles as a trace, since the fields were laid out with span semantics in mind, so observability needs no new instrumentation. The design landed in EnCoder ([design_checkpoint.md](https://github.com/HYDtomako/EnCoder/blob/checkpoint/design_checkpoint.md)).

## After the interviews

Looking back, these eight questions almost never ask "do you know some term" — they ask "have you thought about how your system breaks at its edges". Telling the project's story too smoothly in that first interview was the very sign that I had never been in those corners.

An interview is an external checker: it doesn't ask what you learned, it asks where you haven't thought yet. Which is the same line — do it, rather than think about it.
