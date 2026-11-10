---
title: "A close reading of the Anthropic blog: three statements on building effective agents"
description: A close reading of three Anthropic engineering posts, watching the focus move from "whether to use an agent at all" onto "the context of the system itself".
contentType: article
slug: anthropic-agent-engineering-three-essays
pubDate: 2026-10-03T10:20:00+08:00
tags: [Agent, Anthropic, context engineering, multi-agent]
llmSummary: 'A close reading of three Anthropic engineering posts: "Building effective agents", "How we built our multi-agent research system", and "Effective context engineering for AI agents". Arranged along a line of evolution — the first essay on tools and orchestration patterns, the middle essay on the engineering of a multi-agent system, the last essay on context engineering — and the ending sums up the three statements.'
---

I read these three together because, spread across the better part of a year, they happen to be a complete record of one "shift of attention":

- At the end of 2024, Anthropic was answering "whether to build an agent, and what blocks an agent is built from".
- In the middle of 2025, an agent was actually running and doing research, and the question became "how to let a whole system hold up".
- In the autumn of 2025, the focus went down one level further, to the scarcest resource — the context itself.

One thing to say first. Every point recorded below is a design and a judgment from the time each of these three pieces was written. The technology iterates fast. Looking back today, quite a few of the concrete practices are already past tense, and some have even been revised by the authors' later writing. The value of rereading them is not in the conclusions themselves. It is in the problems they were facing then, the process of the tradeoffs, and the engineering ideas behind them — those hold up better over time. And the discussion and the additions carried along in this piece are only one person's view, for reference only.

The evolution of the formula along this line, in one block:

```
First essay (2024-12): agent = LLM + tools (+ a loop)
Middle essay (2025-06): agent = a whole system that runs, goes wrong, and recovers
Last essay (2025-09): the system's core tension is context, and the harness's main work is curating context
```

---

## The first essay · Building effective agents: first get clear on whether to use an agent at all

> Source: https://www.anthropic.com/engineering/building-effective-agents

**The point.** After working on agents with dozens of teams, Anthropic found that the most successful implementations use simple, composable patterns, not complex frameworks.

### A definition: a workflow and an agent are two different things

- A workflow: the LLM and the tools are orchestrated along a code path set in advance, and a person wrote the flow.
- An agent: the LLM itself dynamically decides the flow and which tools to use.

This distinction matters. A real scene with a fixed flow (the kind of orchestration on coze, for example) uses a workflow. Only a complex application where the model has to make up its own mind at runtime gets an agent.

### When to use an agent

Start with the simplest scheme, and do not reach for an agent at the outset — an agent spends latency and cost in exchange for how the task performs. Where the boundary is clear and the requirement is predictable, use a workflow. Reach for an agent only when you need flexibility, the model deciding on its own, and scale besides. In many scenes, one LLM call with retrieval or an example is already enough.

As for frameworks (the Claude Agent SDK, AWS Strands, Rivet, Vellum, and so on), they are quick to start with, but they add a layer of abstraction, they are hard to debug, and they easily tempt you into adding complexity. The suggestion is to start directly from the LLM API.

### Five patterns for orchestrating a workflow

1. **Prompt chaining.** Split the task into serial steps, feed the output of the previous step to the next, and a programmatic "gate" can be added in between to check. It suits a scene that can be split cleanly into fixed subtasks (write the marketing copy first, then translate it, for example).
2. **Routing.** Classify the input first, then dispatch it to a specialized follow-up. Let each category use its own dedicated prompt, so that optimizing for one kind of input does not hurt another (route an easy question to Haiku and a hard one to Sonnet, for example).
3. **Parallelization.** Two kinds. Sectioning — split the task into independent subtasks and run them in parallel (one model produces the result, another reviews the content, for example). Voting — run the same task several times and take several results (several sets of prompts looking for vulnerabilities in code, for example).
4. **Orchestrator-workers.** A central LLM dynamically decomposes the task, dispatches it to workers, and then gathers the results. The subtasks are not set in advance. The orchestrator decides them from the input. It suits a complex task whose steps cannot be predicted (a programming task that changes several files, for example).
5. **Evaluator-optimizer.** One LLM generates, another evaluates and feeds back, and a loop polishes the result. It suits a scene with a clear standard of evaluation, where iteration can bring a measurable improvement (literary translation, for example).

Note this: in the original post all five are filed under Workflow, orchestrator-workers included — because the "orchestration structure" is fixed by code, and only the content of the subtasks is fixed by the model. They are design templates that can be reused. They are not a framework, and there is no need to copy the whole set. The real agent is the separate category that comes after.

### The agent itself, and three principles

An agent is an LLM using tools inside a loop, according to feedback from the environment. At each step it gets ground truth and judges its progress. It can pause at a checkpoint, or when it is blocked, and wait for human feedback. It usually also sets a stopping condition (a maximum number of iterations, for example).

Three core principles: **simple design**, **a transparent process** (show the planning steps explicitly), and **a carefully polished ACI** (agent-computer interface: write the tool documentation seriously, and test it).

The stretch of tool prompt engineering in the appendix is worth pulling out on its own. A tool's format should sit close to the natural text the model is familiar with, and should not manufacture a formatting burden (a diff that demands exact line numbers, or escaping code inside JSON, for example). Write a tool description the way you would write a docstring for a junior engineer. Run more examples and iterate. Build in mistake-proofing (poka-yoke). Anthropic says that while doing SWE-bench, the time spent optimizing tools was greater than the time spent optimizing the overall prompt — one instance being forcing absolute paths, which cured the stubborn problem of relative paths going wrong.

### Discussion and additions

- By 2024, agent applications were already showing their first signs, and the two directions most favored were customer support and the coding agent. Both have "a clear standard of success + a feedback loop + human supervision". This combination can be used as a filter: only a clear standard of success (one that can be verified automatically) gives you a feedback loop, only a loop lets the model iterate on itself, and human supervision is the backstop on top. Turned around, a task whose standard is fuzzy and whose loop is hard to measure (creative writing, open-ended consulting) gets an agent stuffed into it and easily turns into burning tokens for its own satisfaction.
- This year's formula was agent = LLM + tools. The word harness had not appeared yet, and the tool / ACI was the core object of design. Reading on into the middle essay and the last essay, you can see how it gets wrapped, layer by layer: the harness wraps the tools in a layer further out, and is responsible for loop control, context management, memory, the permission sandbox, and error recovery. A tool is only one component inside the harness, and it has not been replaced.

---

## The middle essay · The multi-agent research system: from a single agent to a production system

> Source: https://www.anthropic.com/engineering/multi-agent-research-system

**The background.** Claude's Research feature uses several agents to do open-ended research. The architecture is orchestrator-worker (a lead agent plus parallel subagents).

### Why use multiple agents

The research steps cannot be predicted. The essence of search is "compression" — distilling insight out of a huge corpus. Letting each subagent explore in parallel with its own independent window, and hand the result back to the lead after compressing it, separates the concerns and lowers the path dependence.

The effect: Opus 4 as the lead and Sonnet 4 as the subagents scored 90.2% higher than a single Opus 4 on an internal research evaluation.

Why does it work? Mostly because it can spend more tokens. On BrowseComp, token usage alone explained 80% of the difference in performance. The other two factors were the number of tool calls and the choice of model.

The cost is blunt too. An agent uses about 4× the tokens of an ordinary conversation, and multiple agents about 15×. So it only suits a scene where the task is valuable enough, highly parallelizable, the information exceeds a single window, and several kinds of complex tools have to be connected. The part of a coding task that is truly parallelizable is not as large as in research, so coding is not really a good fit for multiple agents.

### Architecture and principles for the prompt

LeadResearcher first stores the plan in Memory (the context is truncated once it passes 200,000 tokens), then creates subagents to search in parallel, and finally hands the result to CitationAgent to locate the citations.

Principles for writing a prompt for an agent:

- Think the way your agent thinks (simulate it in the Console, and watch how it runs, step by step).
- Teach the orchestrator how to delegate — state the goal, the output format, where the tools come from, and the boundary.
- Allocate effort according to how complex the query is.
- Tool design and tool choice are the key.
- Let the agent improve itself.
- Wide first, narrow later.
- Guide the thinking process (extended thinking as scratch paper).
- Call tools in parallel (for a complex query, the research time can be shortened by up to 90%).

### Evaluation

You cannot only look at whether a preset sequence of steps was walked through. You have to judge "whether the result is right + whether the process is reasonable". Start evaluating immediately, even on a small sample (about 20 queries). An LLM-as-judge is steadiest as a single call scoring 0.0–1.0 plus pass / fail. Human evaluation fills the gaps (early on, for example, the agent preferred SEO content farms, and only a person could see it).

### Four hard points of reliability in production

This is the most valuable part of the middle essay — laying out the system-level trouble after "the agent is running":

1. **An agent is stateful, and errors accumulate.** It has to be able to resume from the interruption (not restart from the beginning), with retries plus periodic checkpoints. Also let the agent itself know a tool is broken and adapt, and pair that with a deterministic backstop.
2. **Non-determinism is hard to tune.** Add full production tracing, and what you monitor is the decision pattern and the structure of the interaction, not the content of the conversation (that keeps the privacy).
3. **Deployment has to be coordinated.** An agent is a highly stateful net, and it is running almost all the time. When you update, they may be stopped at any position in the flow. Use a rainbow deployment — the old version and the new version run at the same time, and traffic shifts gradually from the old to the new, without interrupting an agent that is already running.
4. **The bottleneck of synchronous execution.** The lead waits synchronously for each batch of subagents to finish. The implementation is simple, but it blocks the flow of information (the lead cannot direct a subagent partway through, the subagents cannot coordinate with each other, and if one gets stuck the whole system waits). Async can add parallelism, but coordinating the results, keeping state consistent, and propagating errors all get harder. The authors expect the future gains to outweigh the complexity.

The appendix has two more points worth keeping. Do "final-state evaluation" on an agent that changes state. And manage long-running conversations — summarize the stages already finished, store the key points in external memory, and when the limit is close, spawn a new subagent with a clean context to make the handoff and fetch the research plan back from memory. A subagent's output lands on the filesystem, and only a lightweight reference is passed back, so there is less of a game of telephone.

### Discussion: a trace can be more than a black box for a person to look at

I want to go one step further than the original post here (what follows is a view of my own, for reference only):

- The original post's full production tracing only gets as far as "letting a person diagnose a failure", and it deliberately does not look at the content of the conversation. Rainbow deployment only gets as far as old and new coexisting, with traffic cut over gradually. Neither has a node-level "record of change", and neither lets the agent use it itself.
- My thought is this: a trace should record the change at the key nodes, so the agent itself can also answer "why it was done that way at the time" — not only a black box a person looks at.

If it is actually going to land, one workable split is a **fact layer** (collected automatically, and trustworthy: the node, the trigger, the candidates, the one selected, the result) plus an **explanation layer** (the agent's own account at the time, treated only as a hypothesis and not as a conclusion). The grain of a node is stuck at "a place where there was a choice" — choosing A and not choosing B is what counts as a node. This layer lines up exactly with two hard points of the middle essay: debugging and tracing, and attribution after a long task is halfway done, the agent gets updated, and its behavior drifts.

---

## The last essay · Context engineering: the focus returns to the scarcest resource

> Source: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

**The point.** Formally name the "context management" component inside the harness, and explain from first principles why it is needed.

### From prompt engineering to context engineering

Prompt engineering cares about saying the thing right. It leans toward being done once, and it is aimed mainly at the system prompt. Context engineering cares about curating and maintaining, across the whole course of inference, that set of "optimal tokens" — system instructions, tools, MCP, external data, message history. Everything that lands in the window counts.

The key to the difference is "iteration". A prompt is written once, while context is curated afresh every time you decide "what to give the model".

### Why: attention has a budget

A bigger window is not a better window. Tests of the needle-in-a-haystack kind found context rot — the more tokens there are in the window, the weaker the model's ability to recall information accurately. Models degrade at different speeds, but the degradation is there in all of them.

The reason is in the architecture. Inside a transformer, every token has to attend to every other token, so n tokens are n² pairs of relationships, and the longer the context the thinner the attention is spread. On top of that, short sequences far outnumber long sequences in the training corpus, so the model simply has less experience of long-range dependencies. What shows up, then, is a gradual performance curve rather than a cliff — inside a long context the model can still do the work, but precision and long-range reasoning take a discount.

The conclusion: context is a finite "attention budget", and every token you add is spending it. Good context engineering is finding "the smallest set of high-signal tokens that can maximize the probability of the goal".

### The anatomy of an effective context

1. **The system prompt**: clear, direct, and at "the right altitude". Too low means hardcoding brittle logic into the prompt, and the more you maintain it the worse it gets. Too high means it is vague enough to assume a shared context, and it gives no concrete signal. Write it in sections (background / instructions / tool guidance / output). The goal is "minimal but complete" — minimal does not mean short. The way to do it is to test the minimal version with the strongest model first, then add according to the failure modes.
2. **Tools**: a tool is the contract between the agent and the space of information and action. It has to be token-efficient, non-overlapping in function, self-contained, resistant to error, and clear about its purpose. The most common pit is a bloated tool set and ambiguity about which to choose — if a person cannot say clearly which one to use, do not expect the agent not to get lost.
3. **Examples**: few-shot is still strongly recommended, but pick a small number of diverse, canonical examples, rather than piling up a string of edge cases. To a model, an example is "a picture worth a thousand words".

### Retrieval at runtime: just in time

The mainstream used to be "retrieve ahead of time": compute the relevant data first, then feed it to the model. The agent era opens another road — **just in time**: do not preload everything, keep only a lightweight identifier (a file path, a query, a link), and fetch it on demand with a tool at runtime.

Claude Code does exactly this. When analyzing a large database it does not stuff the whole block of data into the window. It writes a targeted query and uses commands such as head and tail to look, and it never loads the complete data object into the context.

This is a lot like human cognition. We do not memorize every document. We rely on the filesystem, the inbox, and bookmarks, and we fetch when we need to. And the file itself carries signal — the name, the directory, and the timestamp are all hinting at purpose and relevance.

That leads to **progressive disclosure**: the agent explores layer by layer, the result of each step provides a clue for the next, and only what is necessary right now stays in working memory. The cost is that exploration at runtime is slower, and depends more on good tools and on heuristics. So a mixed strategy is not ruled out either — some of it is prefetched (CLAUDE.md goes straight into the context, for example), and the rest is left to glob and grep for navigation on the spot.

### Three roads for a long-horizon task

When a task runs longer than one window (a code migration or a deep piece of research lasting tens of minutes to several hours), it needs a dedicated means:

1. **Compaction.** When the window is close to full, summarize the contents and open a new window. In Claude Code's implementation, the model keeps the architectural decisions, the unsolved bugs, and the implementation details, drops the redundant tool output, and continues with the five most recently visited files. The trick is in "what to keep" — go for recall first (do not drop things), then raise precision (remove the redundant). The safest lightweight form is to clear tool results that were used up long ago.
2. **Structured note-taking (agentic memory).** The agent periodically writes notes into memory outside the window (NOTES.md, a to-do), and pulls them back later. This is persistent memory at a low overhead.
3. **A sub-agent architecture.** Rather than letting one agent carry the whole project, let a specialized subagent do a focused task with a clean window, while the main agent holds the high-level plan and coordinates. A subagent may burn tens of thousands of tokens exploring, and hand back only a summary of 1–2k tokens. Separation of concerns, with the detailed context isolated inside the subagent.

How to choose: compaction suits a large amount of back-and-forth conversation; notes suit iterative development with clear milestones; multiple agents suit complex research where exploring in parallel pays off.

### Pokémon, and the memory tool

The post uses Claude playing Pokémon as an example, to show how memory changes what an agent can do. This is a non-programming, long-horizon task. The model was not taught any memory structure, and yet it grew, on its own, a progress ledger, a map of exploration, a list of achievements, and battle strategy, and after the window was compressed it kept playing by way of the notes — almost the spontaneous form of structured note-taking.

When Sonnet 4.5 was released, Anthropic turned this pattern into a product: a memory tool in public beta, based on the filesystem, letting an agent store information outside the window, build a knowledge base across sessions, and keep project state.

So this is a continuous spectrum: context (working memory) → note files inside a task → long-term memory across sessions. Whether it is compression or landing on a file, the essence is the same thing — exchanging a long context that is "unreliable and occupying the budget" for external storage that is "controllable and retrievable".

---

## Threading them together: three statements across one year

The three pieces are not three blocks of knowledge sitting side by side. They are one shift of the center of gravity:

- **The first essay cares about "whether to".** It gives the building blocks and the standard for judging, and the formula is agent = LLM + tools. At this point the core object of design is the tool / ACI.
- **The middle essay cares about "whether it can hold up".** Once an agent is really online and running long tasks, the trouble is all at the system layer — state, tracing, deployment, the synchronous bottleneck. The tool retreats into being one component.
- **The last essay cares about "how the resource gets spent".** It picks out the scarcest resource (context / attention) on its own, and gives a method for curating it. By here, "multiple agents" has also been reinterpreted as "one of the means of getting around the context limit", which is the other side of the same thing as the middle essay's "multiple agents are mainly able to burn more tokens".
