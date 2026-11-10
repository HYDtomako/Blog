---
title: "Building a personal agent and a QQ bot: the process, and how it felt"
description: 'From a QQ bot to a personal agent running on this machine: why I started, how the capabilities got added step by step, the pits the bridge layer fell into, and why I think everyone should have a pa of their own.'
contentType: article
pubDate: 2026-10-18T14:36:00+08:00
slug: long-term-personal-agent
tags: [Agent, engineering practice]
llmSummary: 'Inspired by joye''s site and by talk in a QQ group, I built a qqbot and a personal agent that runs on Telegram, and I have kept using both. The piece records the motive (not building for the sake of building; the standard is "will I still use it tomorrow"), how qb grew from basic Q&A to a scheduled class timetable and an entertainment mode, how qb and pa take different permissions and different degrees of letting go because their audiences differ, how pa connects through background scheduling to other coding agents and only reports the final result, the bridge between pa and qb, giving the agent an email and letting it register accounts on its own (the human still has to pass the human-verification check), design principles for the harness (more complex is not better; usable → used often → good to use), traps in the bridge layer (simulating understanding with keyword and probability matching rots as the requirements grow; once a capability is sucked into the bridge layer it is no longer composable or observable), and an answer on product positioning (the difference is not features; it is privately accumulated memory over time, and who the data belongs to).'
---

I built a set of agents on this machine for my own use — a qqbot hanging off QQ, and a personal agent running on Telegram — and I am still using both. This piece is a careful write-up of how they came to be, which pits I hit along the way, and why I think the thing is worth doing.

## Where it started

The prompt came from two places. One was joye's site ([joyehuang.me](https://www.joyehuang.me/)): the first time I saw that a person can actually have an agent that belongs to them. The other was the everyday talk in a QQ group I spend time in (831907794), which confirmed that this had a real scene in my own life.

So I wanted a personal agent of my own (pa, from here on) and a qqbot (qb, from here on), and I wanted to keep using them.

What I got clear first was not the technology. It was the motive. Of the hand-built agents I have seen, most were built for the sake of building, and once they were done even their maker would not open them a second time. So the standard this time was not "can I get it built", but "will I still use it tomorrow". An agent I will keep using, and keep pushing forward, is the one worth starting.

## The qqbot came first

qb came first. I picked it because it was the easiest to get running — hanging off QQ, no interface, no complicated deployment. At the start I was actually quite lost, with no idea where to begin. Only after I actually tried did I find out how simple it was.

qb began with nothing but basic Q&A. Later I slowly added scheduled tasks: every day, post the next day's class timetable into the dorm group. That was the first time I handed a complete set of login details to an agent — some school URL, my account, my password. It could of course look up other things too, but I only let it act for me personally.

Technically there was no clever trick. The agent itself is built with pi, and the QQ connection is NapCat. NapCat is a protocol-side implementation based on NTQQ. It wraps QQ's sending and receiving as a standard OneBot interface (WebSocket / HTTP), and once the agent talks to those interfaces it can send and receive QQ messages. Which is to say I did not have to reverse any QQ protocol. I only had to connect to a line that was already laid — that is why it was easy to start.

After that I kept filling it out, taking [MaiBot](https://github.com/Mai-with-u/MaiBot) as a reference. The way it picks up a conversation on its own is interesting, like a person. So I added an entertainment mode to qb, meant for idle chat.

## Two agents, two degrees of letting go

qb faces many people, so its capabilities and permissions are kept very tight — what it may reply, what it may do, all held in.

pa is different. It is the one I use deeply, and the conversation happens on Telegram. I gradually let it go: for tasks like writing code, it connects through background scheduling to other coding agents (codex, claude code, kimi code, …). The end effect is that I only face the final result pa hands back, and I return to the GUI when something needs a careful pass.

I also bridged pa and qb, so the two can talk to each other. qb is in the group, pa is on my computer, and the line between them turns "a problem noticed in the group" directly into "a fix that happens on the computer".

One night I was lying in bed, found a small bug in the bot, and simply passed a message to pa from inside QQ and told it to fix the bug. In the end other coding agents were the ones that did the work, and there still seemed to be some bugs left. It did not get fixed.

This was no remarkable result, but it was a marvelous beginning: the first time I started and pushed a piece of development while completely away from the computer.

## Give it an identity

I also tried to give pa more capabilities. One of them, following joye's approach, was to give the agent an email address.

Honestly, I am not in the habit of using email, and I was not sure how useful an inbox really is to an agent. But later I had pa go register a GPT account on its own, and in that moment I was genuinely a little stunned. Through the whole process there was only one thing I had to do: pass the human-verification check. Everything else it finished itself.

Perhaps, later on, we will keep letting go and let agents do more of the work for us.

Someone posted on X about using a grok bot to turn a broken streetlight downstairs into an email to the relevant department; a few days later the streetlight was actually fixed. There are also products that can connect to how you use your phone, to Gmail, and to GitHub, and become an assistant that knows you better. In China, too, ecosystems that connect a pa to other apps keep being rolled out.

The point of giving an agent an email and letting it register accounts itself is not the inbox. It starts to have an identity of its own, instead of only borrowing mine. That is a precondition for letting go: you will not really hand work to something that has no identity of its own.

Another capability is driving a browser. At first I used [browser-use](https://github.com/browser-use/browser-use), an open-source option, and pa used it to open pages, click, and fill forms. Last night (2026-10-19), [ego-lite](https://x.com/ego_agent/status/2112212296185655740) became usable on Windows: a browser designed for people and for agents at the same time. What pa takes over is no longer a single action, but a whole string of what we asked for.

Set the two side by side: the inbox gave it an identity, the browser gave it hands and feet. The further those hands and feet can reach, the less "let the agent do the work for us" is merely something to look forward to.

## Two technical problems while building

Both pa and qb are agents built on pi. Two problems held me up while I was building them.

### The harness does not have to be complicated

At the start I was thinking: how am I supposed to build this harness?

What I landed on is a very plain sentence — more complex and more advanced is not better; simple and practical, then adjust. I have always thought that in the agent direction there is no such thing as the best design, only a design that fits you. The field itself is still developing. You pick up a feel while using it, and you adjust as you go.

So the path is: usable → used often → good to use. First let it run, then let it get used often, and only then make it good to use.

### The bridge layer: not a mistake, a way of doing it

At the start I did not really understand the bridge layer, so a lot of the design was left to the AI to decide. The result was that a large share of the input never went straight to the model. It went first into a hardcoded program: keywords, probability matching, and on a hit it returns a result directly. Use that long enough and problems show up.

It really can produce output while spending almost no tokens, but that is a long way from the effect we want. You also watch more and more capabilities get stuffed into the bridge layer: the implementation of a tool, memory, …

To be clear first: this is not a mistake. It is a way of doing it. The problem is not "using code". It is "using code to understand what was meant".

The bridge layer is the forwarding, routing, and preprocessing between an external message entrance (QQ, Telegram) and the model. That it has to exist is not in dispute. Auth, allowlists, rate limits, format rules, retries, logs — these were never things the model should judge. What they want is determinism, not the power to understand.

There is only one dividing line: does this step need to "hear what was meant".

- Whether it may send, whom to send to, whether this person is on the allowlist, whether this message is a duplicate → no need to understand. Code does it, fast and at zero cost.
- What this sentence actually wants, which tool to call, whether to ask a follow-up → it needs to understand. Hand it to the model.

And its typical shape is exactly the pile of slop the AI writes at the start: the input does not enter the model, it enters a dead program. It is especially handy at first. It can hand back a result at almost no cost. The price grows with the requirements. Hardcoded matching cannot cover real use, and a different way of saying it makes the match fail. When it fails it is often silent: no error, and no follow-up question. Worst of all, it cannot generalize — a dead program is guessing at meaning, and a guess is eventually wrong. That is the concrete mechanism behind "it breaks the longer you use it".

Why do capabilities keep getting sucked into the bridge layer? Because the entrance is the most convenient place: change one line and you have added a feature, with no prompt to edit and no context to rethink. The cost is that those capabilities leave the agent's field of view. The model does not know it has them, cannot combine them when it needs to, and cannot explain or repair them when something goes wrong. The feature is there, but it is not composable and not observable.

The right direction to pull it back: the bridge layer keeps only the part that "must be determined"; a concrete capability becomes a tool the model can see, can call, and can get an error from, rather than a branch hidden on the forwarding path.

## How is it different from other agents

Someone might ask: what is the difference between your personal agent and things like openclaw or a grok bot?

I have no standard answer. I am not even sure, myself, how I ought to answer.

What I can be sure of is this. It is a product I will use for a long time, an agent that holds memory and data belonging only to me. Set beside the others, I would rather use my own.

I have also heard the other claim: that a pa is unnecessary. I do not agree. I think everyone should have a pa of their own — it is not complicated to build, and you will want to use it.

For learning, it is feedback while you study agents. For how you see things, it puts you in touch with more of the experience, and with more of the products.

Said a little more concretely, the difference is not in the features. It is in belonging, and in compounding. Someone else's agent starts from zero in understanding you, on every conversation. This one of mine knows you better the more it is used. Half a year of accumulated context is not something any new product can sell you. The value of a pa is also not how strong it is today. It is where it missed, and that it now knows how not to repeat the miss — knowledge that only grows inside your own logs.

There is another angle I care about, and that rarely gets mentioned. Something you built yourself, you can use at once, and you can hand to someone else at once. That may be the fastest way to let other people judge your product — no waiting on a release, no promotion to do. Someone nearby can use it, and the feedback is back the same day. And because I use it every day myself, it keeps getting maintained, not for the sake of shipping a version, but because when it breaks the first person who feels it is me. Put those two together, and they say more about why it is worth building than the features themselves do.

## Putting the memory in Notion

Later I tried one more thing: install Notion into pa, and have it move the memory in.

What moved was concrete. Memory accumulated over long use, the taste of mine it had written down, the chat context of each day — all of it written into Notion, and updated and appended on a schedule. Once it was in there, the thing was no longer "lying in some directory on the local machine". It was on a platform: the computer can open it, the phone can open it, I can change it in passing, and pa can read it any time.

Another layer of benefit is sharing. While working on some project, pa and the other agents can read and write the same thing, collaborating as if they were in the same repository, instead of each guarding its own copy.

The real unexpected gain was reading what it had distilled up there. pa periodically redistills these things and then appends them, and sometimes the entry it wrote is genuinely interesting — there really are details in it that I cannot see myself. As if there were an extra observer beside me, writing down the things I had not noticed.

Some people ask why not just use Obsidian. These are two different tradeoffs. Obsidian is local-first. The files sit on your own disk: fast, usable offline, the data entirely yours. Sync across devices is something you assemble yourself (a cloud drive, Git, a sync plugin). When several ends edit at once it tangles easily, and an agent that wants to read and write has to land on the files on this machine. Notion lives in the cloud by nature. Multi-device sync, sharing, and an API are all ready-made, at the cost of depending on the network and on a third party, with the data not sitting beside you. So this is not a question of which one replaces the other. It is whether you care more that "the thing is in your own hands", or that "it can be edited from anywhere, and anyone can read it".

## Not finished yet

Having got this far, my conclusion is actually plain. The bar for building an agent is already low — low enough that "can it be built" is no longer a question. The real question, once it has been built, is whether you will still use it.
