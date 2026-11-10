---
title: "The smaller the harness, the heavier it gets: the line along which a sub-agent folds into a skill and a tool"
description: 'From "the sub-agent faces the user itself", to "the main agent calls it with a tool", and on to "folded into a skill + a tool" — the harness''s surface area shrinks the whole way, and the weight on the model, the descriptions, and the acceptance criteria grows the whole way.'
contentType: note
pubDate: 2026-10-30T12:00:00+08:00
slug: harness-smaller-heavier
tags: [Agent, engineering practice]
llmSummary: 'Read together with Anthropic''s "When to fold subagents into your main agent loop" and with the experience of building a personal agent and a qqbot, the claim is that a harness''s weight belongs on the descriptions, on the model''s continuity, and on end-to-end acceptance. The same capability has three places it can land (a sub-agent facing the user directly / the main agent calling the sub-agent with a tool / folded into a skill + a tool), and the more it is folded the smaller it gets and the heavier it gets. A boundary should be cut by whether the context needs the other parts, not by whose job it is. A sub-agent is kept only for the three scenes of context bloat, true parallelism, and conflicting tools. Dispatching code-writing to a background coding agent as a "one-shot worker" is not something folding applies to. The order of work is to build an end-to-end eval first, fold one at a time, and see which tasks flip.'
---

On October 22 Anthropic published "[Building agents: When to fold subagents into your main agent loop](https://claude.com/resources/articles/building-agents-when-to-fold-subagents-into-your-main-agent-loop)". The author is Diane Sarkis from Applied AI, and the core conclusion is plain: fold the router, the planner, and the domain-expert sub-agents into the main loop, and change it into "one model + one context window + skills and tools disclosed progressively", and across several enterprise deployments this won on quality and on cost at the same time.

I agreed with it after reading. What I want more is to remember the piece as another sentence — what is really being discussed is not "whether to have sub-agents", but which layer the weight of the harness should sit on. Because the same "capability that can answer a user" lands in the architecture in three positions, and the harness is written completely differently in each.

## The same capability, three places it can land

### 1. The sub-agent faces the user itself

This is the heaviest kind. The sub-agent has its own context, its own tools, and its own instructions, and it also has to be able to talk to the user directly, so the harness has to be responsible for: routing intent, handing the conversation over, what context to pass at the handover, how several prompts avoid conflicting, how several sets of permissions stay isolated, and how several evals get gathered up.

What it buys is autonomy of organization: each team writes its own agent, and they do not interfere with each other. The cost is written at the handover — the moment context crosses a boundary it gets compressed once, and nobody truly owns the end-to-end quality. The customer-support agent in the piece is the typical case: a dozen or so expert sub-agents, a brand voice that is hard to keep unified, and latency dragging the experience down.

This shape is a reasonable transition when the organization is large and the team boundaries are hard. But it is "a solution to an organizational cost", not "a solution to a capability".

### 2. The main agent calls the sub-agent through a tool

The conversation stays in the main agent's hands, and the sub-agent becomes a callable black box: given an input, it hands back a compact, structured result. The harness degrades from "a handover protocol" into "one tool definition".

This is the stop with the lowest cost of migration, and the stop most worth doing first: you do not have to rewrite the sub-agent, the main agent can still take the conclusion and check it against real data, and the input to the final synthesis can still be cut by the main agent itself. But the root of the illness is not gone — each specialist still has its own prompt, context, owner, and eval; each call still hands back a lossy summary; each call still nests a model loop, and the latency still stacks the same way.

### 3. Folded into a skill + a tool

The sub-agent's prompt becomes a skill (how this team does the work, and which judgments it makes), and its API calls become MCP tools (what it can read, what it can write, and what shape it returns). Inside the main loop only one model, one window, a batch of tools, and a set of skill descriptions are left.

The structural things from before get taken apart and distributed: orchestration and ordering are left to the model to plan for itself, the domain process goes into the skill, and the hard limits (validation, an approval gate) and the needs that arise midway (retrieving memory) go into tools. Code only does the mechanical work that is cheap and almost always has to be done.

## Where "smaller means heavier" is actually heavy

The part of the harness that gets smaller is easy to count: fewer branches, no routing, fewer prompt entries, and the evals to maintain go from N sets to one set. Anthropic says that on a stronger model they cut more than 80% of Claude Code's system prompt, and that is the quantified version of this same thing.

But the weight did not disappear. It was moved to three places, and these three are harder to write than code:

The first is the description. Once there are more than 30–50 tool definitions, tool selection itself starts to degrade, so tool search is used to load them lazily. A skill has to lead with one short description that is accurate enough for the model to actually load it when it should. Write code wrong and you get an error. Write a description wrong and it fails silently — the model does not know it has a capability, or it uses one when it should not.

The second is the model's own continuity. Write the plan into the context on the first round, and revise the plan later as results come in. The one who writes the plan and the one who carries the plan out are the same model — that is what makes it possible to change course midway. This is a good thing, but it requires the model to really be able to narrate its own progress and check itself, and that ability varies a great deal from model to model.

The third is ownership. A small loop has no middle layer to pass the blame to: the end-to-end eval has to be truly owned by a small team, covering the chained calls that actually appear in production and every rule that cannot be broken. The example in the piece — "after folding, the latency dropped, but the main agent looked up the order itself and never asked logistics for the delivery date" — shows that looking at the total score is not enough. You have to look at which tasks flipped, and the same task has to be run several times: that flip showed up in only half the runs.

So "small" never equals less work. A small harness drives the complexity out of the structure and into the descriptions, the model's ability, and the standard of acceptance. Loosen any one of those three and the small loop degenerates at once into "one super prompt", which is exactly the other failure mode the piece criticizes at the start.

## Why I believe this line: two negative examples

### 1. Designing the team too completely: Encoder's teammates

While I was studying Agent_Teammate, I thought the multi-agent shape was very harmonious. Besides the main agent and the sub-agents having to interact, the sub-agents could also talk to each other, through a mailbox. And when a task was done the sub-agent did not end. It went back to IDLE and waited for the next task, or for the main agent's review. I later finished this design in my own [Encoder](https://github.com/HYDtomako/EnCoder) project — a coding agent that runs in the terminal. `team.py` ([source](https://github.com/HYDtomako/EnCoder/blob/main/encoder/team.py)) is seven hundred lines and more, and it is the multi-agent layer.

Concretely, it looked like this. Each agent has one inbox file, `.Mailbox/<name>.json`. Five kinds of message: task / review / end / result / notice, queued by `end < review < task < notice`, with review always overriding a new task that is waiting in the queue. A teammate spends its life walking among the three states work / idle / ending, and it closes only when the main agent explicitly sends end. Three at most at the same time. A teammate that changes code runs in its own worktree by default, each committing to its own branch, and the main agent merges them back with `integrate_results`. Only a real conflict starts a one-off integration agent. Teammates do not inherit the tools used for dispatching work, which prevents infinite nesting.

At the time I thought this set of things was very complete. Looking back now, the completeness was real, and the necessity was not.

Only three things hold up. One task goes to only one teammate. Review has a higher priority than a new task. People changing the same code each work inside their own worktree. These three have nothing to do with how strong the model is. What they solve is isolation and acceptance, so they do not stop working because the model gets stronger.

Two other things do not hold up. One is IDLE staying resident. What a resident teammate actually preserves is two things: a hot context, and a tool instance that has been set up. But the model itself has no hot state. Every inference reads the context through again from the start, so "standing by" does not save an agent any work. It adds one more context that has to be maintained and that goes stale — in the code I accumulate broadcasts into `self._notices` and inject them the next time work is dispatched, and that is this cost made concrete. What is actually worth keeping resident is process state: the dev server, the browser profile, the dependencies installed inside the worktree. Those things should stay at the tool layer, and they have nothing to do with how long the agent lives. IDLE should be left to the environment, not to the model.

The other is the mailbox connecting them. It lets agents talk to each other, and it looks natural, but it turns "a shared fact" into "a channel for passing messages along". A finds a global anomaly and broadcasts it, and what the others get on their next round is the sentence A said at the time, not A's context. The same piece of information gets compressed once for every boundary it crosses, and when something goes wrong you also cannot see who dropped what. What really needs to be shared across agents is facts — shared files, structured state — not a conversational link.

The boundary has to be said clearly too. A simple main agent is enough, on the premise that a single window can hold it, and that the same code does not need to be changed truly in parallel. Having many tasks is not a reason for parallelism. Only "the context has to be discarded" and "the writes have to be isolated" are. I had in fact written this on the first line of the design document long before — "if a single agent can do it, you do not need multiple agents" — I just did not dare believe it at the time.

### 2. Writing the capability into the bridge layer: the personal agent and the qqbot

The pit I hit while building the personal agent and the qqbot was not in the sub-agents. It was in the bridge layer.

At the start I left a lot of the design to the AI to decide, and the result was that a large share of messages did not go straight into the model. They went first into a hardcoded program: keywords, probability matching, and on a hit it returns directly. It spends almost no tokens, but used long enough it is bound to rot — the user phrases it differently and it fails, the branches pile up, and on failure it is silent and reports no error. What is more troublesome is that capabilities keep getting sucked into the bridge layer along the entrance, because that is where changing one line adds a feature.

The cost is what I actually understood for the first time: these capabilities leave the agent's field of view. The model does not know it has them, cannot combine them when it needs to, and cannot explain or repair them when something goes wrong. The feature is there, but it is not composable and not observable.

Looking at it now, this is the same illness as the "game of telephone" in the piece. The boundary was drawn on "which stretch of responsibility this is", rather than on "whether this stretch of work needs the context of the other parts". Draw it on responsibility, and you have to keep passing summaries. Draw it on context, and self-contained becomes something you can talk about. The standard of judgment I kept for myself is only one sentence: only when this stretch of work barely needs the rest of the system, and the result can be pressed into a small piece and handed back, does it deserve to be its own context. Work that has to ask back and forth for information should stay in the main loop.

## Where a sub-agent should still be kept

The piece lists three. The single loop shows a measurable drop in performance because the context has bloated. Parallelism is genuinely needed, and the context can be discarded once it has been used. A single agent cannot pick the tool reliably, or the system prompt contains instructions that conflict with each other.

My own usage lands on the second. Tasks like writing code are dispatched to a coding agent in the background. It takes an independent context, hands the result back when it is done, and the context is thrown away immediately after. It is a "one-shot worker" — give it the materials, it hands over the finished piece, and the main loop keeps walking forward with the full history. This does not contradict folding. What folding is aimed at is the sub-agent that is "resident, and treated as part of the architecture", not this kind of executor that is thrown away once it has been used.

## If you are going to start, what is the order

1. Have an end-to-end eval first. Even if it is only ten golden examples. What it measures is "whether the user's question was resolved well in the end", not "whether some intermediate step was carried out prettily".
2. Start the merge from the pair that is called most densely and coupled most tightly — the ones that show up one after another in production, which means they were one domain to begin with.
3. First let the main agent call it in the manner of a tool, keep the right to hold the conversation, and pick up a baseline at the same time.
4. Then fold them one by one into a skill plus tools. Fold one, run the eval once, compare before the fold and after it, and look at the tasks that flipped and not only at the score.
5. Do a prompt audit along the way: delete the patch-style instructions that were written back then for the old model. Now they only make the agent slower and stiffer.
6. Do not make permissions into "one agent per permission level". Each tool checks for itself what the caller can see and what the caller can do, and if not, it returns a refusal the model can read. One loop can serve users with different permissions.

## At the end

I once described the path of building my own agents as "usable → used often → good to use". This line holds for the harness too: the structure is not something you design. It is something that comes out of use. Each time the model gets one step stronger, the harness should get one layer thinner. Where it cannot get any thinner, it is usually not that the model is not strong enough. It is that the eval was never built, or that the description is still not written accurately enough.

> Source: https://claude.com/resources/articles/building-agents-when-to-fold-subagents-into-your-main-agent-loop
