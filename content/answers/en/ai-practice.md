---
title: What AI practices does this site document?
description: From transformer notes to agent engineering and the tools built from it.
contentType: answer
slug: ai-practice
tags: [AI, agents, notes]
llmSummary: The AI material here has three layers — study notes on transformers and deep learning, source-reading notes on agent mechanics (agent loop, tools, context compression, multi-agent collaboration), and the small tools built from those mechanics, such as EnCoder and QQbot.
question: What AI practices does this site document?
shortAnswer: Three layers — study notes on transformers and deep learning, source-reading notes on agent mechanics (agent loop, tools, context compression, multi-agent collaboration), and small tools built from them, such as EnCoder and QQbot.
---

**AI is the main line here, and the writing sits in three layers, from mechanism to something that runs.**

The first layer is fundamentals: the [transformer notes](/en/2026/04/04/transformer-learning-notes/) walk through tokens, positional encoding, Q/K/V attention, multi-head attention, and layer norm in data-flow order, while Simple_CNN reproduces the path from convolution and pooling to a full training run.

The second layer is agent engineering: reading three Claude Code implementations side by side ([the notebook](/en/2026/08/23/agent-engineering-from-claude-code/)) lines up the agent loop, tool definitions, context injection and compression, parallel tools and sub-agents, multi-agent collaboration, and security boundaries. Minimind-notes covers model architecture and training methods.

The third layer is tooling that runs: EnCoder extends a minimal agent with cron scheduling, long-term memory, an agent team, and task management; QQbot uses pi as its brain and NapCatQQ as its connection, covering knowledge Q&A, timetable lookup, group management, long-term memory, and hot model switching. The project list is on the [projects page](/en/projects/).
