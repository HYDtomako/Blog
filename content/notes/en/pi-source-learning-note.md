---
title: "What an interview taught me: you have to understand the code AI writes"
description: First the Agent harness interview from last weekend, then the Pi main-loop flow and design, written along the mind map.
contentType: note
pubDate: 2026-11-23T21:00:00+08:00
slug: pi-source-learning-note
tags: [notes, Agent, Pi, source reading]
llmSummary: Last weekend I interviewed with the CEO of a company building its own agent framework, for an Agent harness role. I struggled when questions landed on code. This note starts with that interview, then follows a runloop mind map — outer loop, inner loop, and the exits — to record the Pi flow and design I can explain so far. I have not finished reading all of the source.
---

## The interview

Last weekend I interviewed with a CEO. The role was Agent harness research and development, at a company building its own agent framework.

I had prepared some exercises beforehand. One of them was to implement a minimal, working agent without a framework. In the interview they would interrogate the code, and I was expected to understand code that AI had written.

Overall, I did not do well. I could not really handle the questions about the code. Once agent knowledge had to be grounded in code, I did not understand it well enough.

One question is simple in hindsight: "Why do tool results have to be written back into the session?" I answered from a message-visibility angle, something like: if the LLM cannot see the return value, there will be no corresponding output. The interviewer said that was not the point, and not the reason. He gave me time to look at the code, and I still could not answer.

He nudged me: if the loop is a loop, after the first turn finishes, does it need to decide what the second turn should do? The next turn needs the previous turn's output.

I later read agent source, mainly Pi, and also compared it with nanocode. For a while I even thought: without results being written back, later turns could not start, and the agent would be stuck making the same decision forever. That is wrong. The loop still runs. Each request to the model is built from the current messages. If a tool has run but its result is not written back into those messages, the model may still see that it called the tool, but not what came back, so it may call the same tool again, or be unable to take the next step.

There were more questions I could not answer, though the answers were all there in the code. The interviewer suggested that to learn agents I should read source. My foundations were still weak, and I needed to read more source. My resume mentioned Pi. He asked whether I had read Pi's code. I had not, and he was surprised.

He was kind, though. Even though I performed poorly, he still patiently gave me time to read code, to think, and to take his advice.

## How to learn agents: read the source

After that advice, I started reading the [Pi](https://github.com/badlogic/pi-mono) source against the map below. I have not finished reading all of it. What follows is written along the structure of this map: the flow and the design I can already explain.

The map is wide; [click for a larger image](/asset/pi-runloop-mindmap.png). The original is on [Excalidraw](https://excalidraw.com/#json=oY6yvZdKMAenaOtxkVWSf,0iGG_OgKqNg1nrNPwHdd4Q).

[![A mind map centered on the main loop](/asset/pi-runloop-mindmap.jpg)](/asset/pi-runloop-mindmap.png)

The map starts at runloop at the top, and splits into two branches: the outer loop on the left, the inner loop on the right. Further left, outside the runloop box, are the Agent entry points and the interjection queue. What extends to the right is asking the model and running tools. A working agent is not a single question and answer. It turns because these two loops turn.

Start outside the box, on the left. At the top is a queue for interjections, which enqueues, dequeues, and clears them. Interjections come in two timings. Cutting in while work is still in progress is called steering, like adding salt while cooking. Adding a line just as the turn is ending is called follow-up, like serving soup after the meal is done. Below that, the Agent has two entry points. Starting a new turn goes through prompt, and it waits until the previous loop has actually finished before opening the next one. The other path is continue: when the loop has stopped abnormally and there is still something to say, it resumes the same context — but only if no loop is running, and only if the context already ends with a tool result or a user message. Both paths go through the same gate: only one run at a time. A run mutates the same conversation record, so two runs in parallel would step on each other. Success, failure, and shutdown all have to close the run out before the next one can start. The user hitting stop, or a request failing, usually exits through that same close-out.

Then the outer loop. After the inner loop finishes, it asks whether there is still a follow-up. If there is, the line is placed in the interjection queue, and the inner loop runs again. The outer loop also has a notification block: the loop emits state changes that have already happened, so it can update its own state and wake listeners subscribed on the outside — for example, to refresh the UI. The loop can turn without this, but the session and the interface need it. Those subscriptions are set up before the user speaks. Listeners do not execute tools.

The inner loop runs top to bottom, as drawn. It first asks whether this turn should run: are there more tools to call, or interjections to handle? It starts by assuming there is more to do, so the loop can proceed even when this turn has no tool call. From the second turn on, before the next turn has started, there is a preparation step: whether to compact the context, switch models, or change how hard the model should think, to be applied to the next turn. If nothing changed, it stays as it is. During this window it also checks for interjections, and queues them if the queue is empty, so a run is not interrupted mid-flight. Only then does the turn officially start. The current conversation is then assembled into this turn's context, the model settings are confirmed once more, and the request goes to the model. What comes back may be a tool result, a reply, or nothing; all of it is merged into the full list of messages.

Asking the model and running tools sit on the right, as two blocks that branch out from the middle of the inner loop. Before the stream, oversized context is trimmed, and the messages the UI sees are converted into the messages the model understands. These are not the same set. The UI can show a custom line such as "Reading the file…". When the request is built for the model, custom messages it cannot understand are filtered out. The loop on the stream side is mostly bookkeeping. It does not execute tools. It records that a reply started, that a tool call started, that it ended, and it emits those changes. Actual tool execution is a separate block. It first checks whether the messages contain a tool call. If the reply was cut off for length, every tool call in that turn is marked failed and written back, and the inner loop is told to run again, rather than executing with a truncated argument. If there is no such problem, the tools actually run, serially or in parallel. Results are still written back in call order. The reason for writing them back is the one above: it is not that the loop would stop without them. The next turn's input is the current list of messages.

At the bottom of the inner loop is finishTurn: the outside decides what to do after the turn, usually to end or to continue. The map splits this into three exits. One is an error or an abort, a forced exit that finishTurn cannot contain. One checks whether a tool call was truncated for length and should not be executed; if the message above was actually an empty reply, the "there is more" flag has to be cleared, or the inner loop would spin on nothing. The third is the normal exit after a turn completes. After that normal exit there is still one more case: sometimes the outside has changed the model settings and needs the model to respond once more to the old context. That runs once, then the flag is turned off.

In a smaller implementation like nanocode, the loop has no such "prepare before the next turn" step. Context only grows, and the way to clear it is to clear the whole thing. That contrast made this design easier to see.

I have not finished reading all of the source, and I will come back to the finer parts of the map later. Even so, I would suggest reading some agent source: it often leaves you with a different kind of understanding.
