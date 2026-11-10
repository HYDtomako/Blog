---
title: "A close reading of the Anthropic blog: from code execution to a long-running harness"
description: A close reading, along the line of the harness, of two Anthropic engineering posts — "Code execution with MCP" and "Effective harnesses for long-running agents" — on how an agent moves from "LLM + tools" toward "LLM + harness".
contentType: article
slug: anthropic-harness-and-code-execution
pubDate: 2026-10-04T14:20:00+08:00
tags: [Agent, Anthropic, MCP, Harness, long-running tasks]
llmSummary: 'A close reading of two Anthropic engineering posts: "Code execution with MCP" and "Effective harnesses for long-running agents". The first is about using code execution to slim the context (progressive disclosure, processing data inside the sandbox, solidifying Skills). The second is about a handoff for a long-running agent across sessions (an initializer plus a coding agent, a feature list, git and a progress file, end-to-end tests). Together they point at one line of evolution: the agent moving from LLM + tools toward LLM + harness.'
---

I read these two together because they are only three weeks apart (2025-11-04 and 2025-11-26), and they happen to be two sides of the same thing:

- The earlier one solves "tool definitions and intermediate results eat the context clean". The method is to stop the agent sending tool calls directly, and have it write code that calls the tools instead.
- The later one solves "every new window starts from zero". The method is to move memory out of the model's head.

Put together, they draw one line: the agent is moving from `LLM + tools` toward `LLM + harness`.

---

## The first essay · Code execution with MCP: saving context at two openings

> Source: https://www.anthropic.com/engineering/code-execution-with-mcp
> Code execution with MCP: Building more efficient agents (2025-11-04, Adam Jones and Conor Kelly)

### An old problem, magnified by scale

After MCP was released in November 2024, it quickly became the de facto standard for connecting an agent to external systems, and the community accumulated several thousand servers. Once there are that many tools, two costs that are usually easy to miss get magnified.

One is preloading every tool definition. What the great majority of MCP clients do is stuff every tool definition they have received into the context in one go. Connect a few thousand tools and that is hundreds of thousands of tokens — the model has not yet read the user's request, and a large cut of the budget is already burned.

The other is that intermediate results have to pass through the model. The original post gives an example: ask the agent to "download the meeting notes from Google Drive and attach them to the Salesforce lead". The whole record fetched in the first step has to enter the context, and when the second step writes it back the whole record is copied into the arguments again — the same text makes the trip twice. A two-hour sales meeting can add something like 50,000 tokens; a slightly larger document overflows the window outright, and the workflow breaks on the spot. And while the model is hauling large blocks of data between the two calls, the odds of a bad copy are not low.

To understand these two problems, you have to see the MCP call chain clearly first: model ↔ MCP client (running inside the harness) ↔ MCP server. The client gets tool definitions from the server through `tools/list` and stuffs them into the model's context. The model decides "which tool, and which arguments", but what it emits is only a call intent. The thing that actually executes, routes, and passes the result back is the client. Which is to say the client does not understand the business. It only hauls. Its own actions occupy not a single token of context. What actually enters the context are the two endpoints of this chain: the tool definitions injected in, and the results passed back out.

### The fix: expose the MCP server as a code API

The idea is to swap the tool from "a call syntax exposed directly" to "code on a filesystem". Generate a directory for each MCP server. Under the directory, each tool corresponds to one TypeScript file. Inside the file is a thin wrapper function, and the body of the function forwards to the MCP client. For example, `servers/google-drive/getDocument.ts` corresponds to Google Drive's fetch-document tool, with the arguments and the return value typed by interfaces.

The way the agent discovers tools changes with it. First list `servers/` to see which servers there are, then read, on demand, the few tool files it actually needs, understand the interface, and call it by writing code directly. The earlier "Drive into Salesforce" example becomes ordinary code: one line to fetch the value, one line to write it back.

That way, only the definitions the current task needs get loaded. The number the original post gives is tokens dropping from 150,000 to 2,000, a saving of 98.7%. Cloudflare has a similar practice, and calls it Code Mode. The core observation, in one sentence: an LLM is good at writing code, so it should use that strength to meet MCP.

The point easiest to take the wrong way here is thinking "the MCP client has been moved out of the context". The client was never in the context. It has been on the outside the whole time, doing the hauling: connecting to the server, pulling definitions, routing, executing, bringing the result back. That process itself produces no tokens. What actually occupies the context budget is two other things:

- The static one: the harness injects every tool definition the client obtained into the model context in one go.
- The dynamic one: the result each tool returns has to be passed back into the context.

So what this change redraws is not the client's position. It is the opening of "what touches the context":

- Definitions go from "preloaded in full" to "read on demand". The model no longer faces one master table of tools stuffed in all at once. It sees a file tree first, and reads a schema only when it needs that one.
- Results go from "pass through the model once" to "stay in the sandbox". Intermediate data moves around inside the code, and only the bit that was explicitly logged or returned comes back to the context.
- The action on the model side changes with it. Before, it was "pick one from a pile of ready-made definitions, and emit a tool call". Now it is "browse the file tree to find the one you want, and write code that refers to it". Picking goes from "everything is laid out in front of you, so pick" to "go and read it only when you need it" — and that opening is exactly what gets saved.

The executing end never changes. It is still that client. What changes is who triggers it (a tool call becomes code the model wrote), where it runs (inside the model loop becomes inside the sandbox), and what comes back to the context (every result becomes an explicit output).

### Four gains

**Progressive disclosure.** A model is very good at wandering a filesystem. Lay the tools out as files, and it can read definitions on demand instead of reading all of them at once. Another approach is to hang a `search_tools` on the server, give it a detail-level parameter (name only / name plus description / the full definition with schema), and let the model ask for what it needs.

Worth remembering: this is "read less", not "read nothing". As soon as a tool definition enters the context it burns tokens, and once there are many tools the cost still rises. What it does is press the order of magnitude from O(every tool) down to O(the few in use right now). It does not settle the account.

**Context-efficient handling of results.** A large dataset is filtered, aggregated, and joined inside the execution environment first, and only then is the result handed to the model. The original post's example is a table of ten thousand rows: filter the pending orders by status, and print only the count plus the first few rows for review. What ends up in the model's context is five lines, not ten thousand.

The reason underneath is really data locality from software engineering — whoever needs to compute, compute next to the data, and do not haul it back and forth across a boundary. Here, the "remote" end is that model, expensive and far away, and with a small bandwidth besides. The sandbox is "local". Data, capability, and private content all stay local, and only the part that was explicitly logged or returned is handed over.

**Stronger control flow.** Loops, conditions, error handling, and polling-and-waiting are written directly in code, instead of "call a tool — sleep — call a tool" over and over inside the agent loop. The example the original post gives is polling a Slack channel for a message that a deploy has finished: written as code, it is a while loop that exits once the message arrives.

What this actually saves is "the time-to-first-token of the intermediate rounds". First, what a "round" of an agent is: one round = one complete model call + the action that call produced. Walked the traditional way, step by step, finishing a "look it up, then write it back" takes several rounds:

```
round 1: model(user request + every tool definition) → think → emit tool_call(fetch document)  ← pay one TTFT
         execute: the client calls the server
round 2: model(prior context + the full document)    → think → emit tool_call(write back)      ← pay another TTFT
         execute
round 3: model(prior context + everything)           → emit the final answer                   ← pay yet another TTFT
```

TTFT (time-to-first-token) is the wait, inside each model call, from the prompt being sent in to the first word coming out. Most of it is spent on prefill — running the whole input context through once, and the longer the input the longer the wait. After that, tokens stream out, and each one is fast. So the most expensive pause in each round, and the one easiest to feel, is that hit at the start.

Three things make this hurt. Every round runs the model from the beginning. It does not continue from the previous round, so "think about the next step, decide which tool call to send" has to be generated again on every round. Every round pays one TTFT at the start. And the context piles up, so prefill gets longer and longer, and each round is slower than the last. The so-called "intermediate rounds" are the rounds that do not produce a final answer and only exist to push the process along (round 1 and round 2 above). They give the user nothing themselves, and each of them pays, for nothing, one wait to "restart generation".

Write the deterministic loops, conditions, and polling as one piece of code and let the sandbox run it through in one go, and you pay only once for the call that says "I am writing this code" (one TTFT, plus the tokens spent generating the code). The while loop, the branches, and the many tool calls after that all run locally inside the sandbox, and no longer come back to the model one step at a time. Only when the code needs to "think again" does it return to the model and open a new round — and what gets saved is the TTFT of those steps that "come back to the model every step, and restart generation from scratch every step".

The premise is that the branch condition can be computed deterministically inside the sandbox. A branch that has to be judged by the model's understanding (for example, "is this comment negative") still has to go back to the model. Said plainly, the condition tree is rigid, but what you get in exchange is time — and that is exactly the dividing line between a workflow (the code sets the path) and an agent (the model sets the path).

This gain is easy to oversell, though. It is actually quite limited:

- It only eats the deterministic piece. Only the steps that can be computed inside the sandbox without a judgment can be moved out. The moment a fork depends on the model's understanding, you still go back to the model and pay that round's TTFT. What gets saved is "the intermediate rounds that can be turned into code", not "the intermediate rounds".
- It requires you to know the path in advance. At the moment you write the code you already have to know what to loop, what to judge, and what to do on failure. But the value of an agent is precisely that the path is not known beforehand — if you really can write the whole thing in advance, it is not an agent, it is a workflow. The more you hardcode, the more you save, and the more it looks like a thin wrapper around a script.
- An error that has to go back to the model means the saving was for nothing. If the code crashes, or hits a branch nobody anticipated, the error still has to be thrown back to the model to start over, and this round actually takes one extra detour compared with before.
- TTFT itself is not that expensive. Once prompt caching is on, the prefill of a repeated prefix gets much faster. In a long task, what takes the bulk is often the tokens the model genuinely has to think, not that hit at the start of each round.
- It does not touch the few model rounds that are fundamental. Writing the code, reading the result and making a judgment, producing the final answer — those rounds are still paid. What is saved is only the purely mechanical round trip, and the ceiling is the share those mechanical steps originally took.

So the more accurate thing to say is: this is a gradual principle, not a solution — move out of the model loop, as far as you can, the mechanical steps that can be moved, and leave the model only the judgment that cannot be cut. The naive version degenerates into a workflow. The version that means something is "be deterministic where it should be deterministic, and do not save the places that should be handed to the model".

**Privacy.** Intermediate results stay in the execution environment by default, and only the part that was explicitly logged or returned is handed to the model. Data you do not want to share can move through the workflow and never enter the model context. In a more sensitive setting, the harness can also tokenize PII automatically — the real values are looked up and restored at the client layer, and the model only ever sees placeholders such as `[EMAIL_1]`. Import the customer contact details from a table into Salesforce, for example, and what the model sees is tokenized fields. The real values flow from the table to the CRM and never pass through the model. That hands you a data boundary along the way: you can say, for certain, "which data never reached the model".

### State persistence and Skills

Code execution with filesystem access also settles the state problem along the way: intermediate results land on disk, and the next session can pick up and keep running. The agent can first write the leads it found into a CSV, and later, in another window, read them back from the file and continue.

What is more worth noticing: code that has been run through can be saved as a reusable function, and adding a `SKILL.md` turns it into a structured skill. Which is to say the agent is not only "using tools that already exist". It starts to accumulate a toolbox of its own — solidifying a solution it has verified into a capability one level up. This step has more long-term value than saving tokens.

### The cost

Code execution is not free. To run code the agent generated, you need a safe execution environment: a sandbox, resource limits, monitoring. None of that infrastructure is required when you call a tool directly. It is a real operations and security cost. The tokens saved, the latency saved, and the ability to compose tools have to be weighed together with that cost.

Looked at along a longer thread, this cost points at a line of evolution: the agent is moving from `LLM + tools` toward `LLM + harness`. A simple tool call cannot hold up a long-running task or a coding task. A sandbox, permission control, a token budget — those capabilities can only be held by the harness. And once the model is allowed to write code, the attack surface widens from "which tools it can call" to "what code it can run" — the security boundary has to be held by the harness. That is exactly the entrance to the next essay.

### The sandbox permission model: from "subtraction" to "addition"

"The security boundary has to be held by the harness" is a light thing to say, and there are two completely different ways to do it. Cloudflare's post on Code Mode (2025-09-26) puts this layer of philosophy more clearly than Anthropic's original, and it is worth adding a sentence.

The traditional sandbox works by subtraction. First give it an environment with every capability — network, filesystem, shell — and then add restrictions inward, layer by layer: close ports, filter syscalls with seccomp, let the firewall pass only a few domains, mount a read-only directory. The essence is "it can do everything, and I take the dangerous parts away".

The problem with this setup is that its correctness depends on you enumerating the dangerous items exhaustively. Miss one exit and that is a hole, and the dangerous surface is nearly infinite. The boundary is also blurry. It is hard for a firewall to judge "whether this traffic is something this agent legitimately needs", and the model side is also guessing "will writing it this way get me blocked" — both sides are wrestling with a rule that cannot be stated clearly.

The addition model turns it around. When the sandbox starts, it has almost nothing. In Cloudflare's Code Mode, the sandbox has no network by default (`globalOutbound: null`, and `fetch()` throws immediately). Capabilities are granted one by one, explicitly — if it should be able to look at GitHub, give it a client binding that is already authenticated, and nothing else. Deny by default. The allowlist is finite, explicit, and auditable.

Why call this a change of philosophy, and not a small optimization:

- The question is reversed. Subtraction asks "how do we stop this thing doing too much". Addition asks "what do we actually want it to be able to do". Only the latter is a question that can be given a definite answer — the answer to the former is always incomplete.
- The boundary goes from blurry to exact. Network filtering has to guess "which traffic is legitimate". A binding is "this JavaScript interface is allowed to be called", and calling anything else simply does not exist. The model does not have to guess, and the supervisor does not have to discriminate.
- Security no longer rests on constraining behavior. It rests on architecture. In Cloudflare's own words, enforce security through architecture rather than behavior — not praying the model will not write bad code, but the bad code physically not having that capability.
- A side effect comes with it. The capability is given out by a binding, and the token behind the binding lives on the supervisor's side, so code the AI wrote never gets a chance to write the secret out and leak it — a problem the subtraction model has a hard time solving thoroughly.

This guarantee has a boundary that has to be said clearly, though. It only covers "capabilities you did not grant". Once you have given a read-write workspace binding, it can still delete every file in the workspace — that code really is bad, and it has the ability. The addition model does not stop this. It only converges the risk surface onto "the few capabilities you explicitly granted, that can be listed, audited, and given permissions one by one". So the accurate thing to say is: it does not make bad code harmless. It makes the harm bad code can do strictly equal to the few cards you deliberately dealt, and not one card more. Set beside subtraction, the difference is that the number of cards missed is zero, rather than "I tried my best to take them all back".

This is really the principle of least privilege, except that the traditional way of implementing it is so much work that people degenerate into "give everything first, then take it back". A runtime as cheap as an isolate, cheap enough to start from zero every time, is what first makes a real "zero permissions by default" untroublesome — which also explains why Code Mode and Cloudflare's Agents SDK dare to take "one independent sandbox per agent" as the default posture.

---

## The second essay · Effective harnesses: how a long-running agent keeps its memory across sessions

> Source: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
> Effective harnesses for long-running agents (2025-11-26)

### The problem: every time the window changes, it loses its memory once

An agent can only work inside discrete sessions, and a new session has no memory at all of what happened before. Once a project is complicated, one context window cannot hold it, and the work has to be done across many windows — while every new window starts from the beginning. The original post compares it to an engineering crew working in shifts: each shift, coming on, knows nothing of what the previous shift did.

The Claude Agent SDK comes with context-management abilities such as compaction, and in theory it can let an agent keep working. But compression alone is not enough. The original post says that even looping Opus 4.5 inside the SDK, and dropping in nothing but "build me a clone of claude.ai", it still cannot produce a web app that could go to production.

### Two typical ways it goes wrong

1. It tries to finish the whole application in one breath. The result is that the implementation gets halfway, the context runs out, and it leaves a half-finished product with no documentation at all. The next session can only guess what the previous shift did, and spends a large amount of time on "getting the basic application running again". Compaction cannot always pass this handoff through clearly either.
2. Late in the work, it misjudges that the job is done. The project is more or less there, the new shift's agent sees that "it looks pretty complete", and declares victory — when in fact a pile of features is still undone.

These two pits point at the same design principle: split the project small, let each session push only a little, and every time leave a "clean state". The standard for a clean state is that this code looks like it could be merged into the trunk directly: no major bugs, orderly, documented.

### Split into two stretches: an initializer and a coding agent

The scheme is two stretches. The first session is given to an initializer agent, with a prompt written for the purpose, to set up the initial environment: an init.sh script, a claude-progress.txt (recording what the agent has done), and an initial git commit. After that, each session is given to a coding agent, which only makes an incremental push and leaves a structured update.

The key is to let the agent, inside a brand-new window, quickly read "what the state is now". It relies on two things: claude-progress.txt and the git history — and the inspiration is exactly what a real engineer does when they come in to work each day.

There is a point here that often gets misread. The so-called "two agents" are really only different in their initial prompt. The system prompt, the tool set, and the harness are exactly the same (a footnote in the original post makes a point of saying this). Do not think of it as two systems.

### Managing the environment: three pieces of the puzzle

The feature list. Have the initializer expand the user's original prompt into a complete file of feature requirements — in the claude.ai clone example there are more than 200 features. This list starts by marking every item failing, which gives every later agent a draft of "what the complete functionality looks like". The rule is hard: only the passes field may be changed, and very heavy wording warns that "deleting or altering tests is unacceptable". The original post deliberately chose JSON rather than Markdown, because a model is less likely to rewrite and overwrite JSON at random.

Incremental progress. Each session does only one feature. When it is done, leave a clean state: commit the progress into git (with a descriptive commit message), and at the same time write a summary in the progress file. Then a bad change can be rolled back with git revert to a usable state, and the time spent guessing "what did the previous shift do" is saved.

Testing. This is the link easiest to leave out. Without an explicit prompt, Claude will run the unit tests, curl a URL, and think it has passed, but it cannot recognize that "end to end, it actually does not go through". After it is explicitly required to use a browser-automation tool and verify end to end the way a real user would, the behavior improves by a lot — the screenshots taken by the Puppeteer MCP can find bugs that reading the code alone cannot see.

One point that is easy to mix up needs clarifying. The "testing" here is not an acceptance pass done once when the project wraps up. It is an action that runs through every shift and every feature. It lands in two places. Every time a feature is finished, the agent has to have verified it end to end itself before it dares to mark that item on the list as passing (this is exactly what guards against the second way of going wrong, above). Every time a new session starts work, it first runs the basic end-to-end test in init.sh, confirms the application was not broken by the previous shift, and only then starts. What the original post calls "the last failure mode" means the last pit on the list that is easy to miss, not the test that comes last in time.

Testing is not without leftover problems either — vision and browser automation have limits of their own. Puppeteer, for example, cannot see the browser's native alert dialog, so a feature that depends on a dialog is more likely to carry a bug.

### A few things to do before each shift starts

Each coding agent, starting work, first does a few basics: pwd to see the working directory; read the git log and the progress file; read the feature list, and pick out the highest-priority feature that is not finished yet. The initializer should also have written init.sh, so that it can start the dev server and run a basic end-to-end test once through. The agent runs it at the start of every session, confirms the application was not broken by the previous shift, and only then starts changing things. Taking the claude.ai clone as the example, that basic test is: use Puppeteer to start a new conversation, send a message, and receive a reply.

### A table of failure modes

The original post lists four "failure mode → fix" pairs explicitly:

1. Declaring the whole project finished too early → the initializer generates a feature list; the coding agent reads the list before starting, and picks one feature to start on.
2. Leaving an environment that has bugs and no documentation → create an initial git repository plus a progress file; on starting, read the progress file and the git log, and run the basic test; on finishing, write a commit and a progress update.
3. Marking a feature complete too early → a feature list plus self-verify, and mark it passing only after testing carefully.
4. Having to spend time figuring out how to get the application running → write init.sh; read it first when starting.

### Questions still open

The original post also leaves items open. Whether to build "one general-purpose coding agent", or to go for a multi-agent architecture, the authors have not decided. Specialized agents such as a test agent, a QA agent, and a cleanup agent may be stronger on their own subtasks. Also, this scheme is optimized for full-stack web development, and they want to extend it later to other long-running tasks such as scientific research and financial modeling.

---

## Threading them together: two sides of the same coin

What the two posts talk about is really two sides of the same thing.

The first treats context as a scarce budget, and throttles it at two openings — the static tool definitions, and the dynamic intermediate results — and pushes heavy data out beyond the context: process it in the sandbox first, land it on the filesystem, and solidify code that has been run through into Skills. The second pushes state out beyond the context: a feature list, the git history, a progress file, an init.sh that can actually start, so the next shift, which has lost its memory, can take over.

The common point is clear. Move "memory" and "state" out of the model's head and onto a carrier that can be read, written, and rolled back from outside, and let the model be responsible only for the incremental push. The list and the transcript are not the point. What actually has to be held is that "state can be handed over".

That is also where the line of evolution lands. A simple tool call cannot hold up a long-running task. The sandbox, permission control, the context budget, and the handoff across sessions all have to be held by the harness. `LLM + tools` is becoming `LLM + harness`.
