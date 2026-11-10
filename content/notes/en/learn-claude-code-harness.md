---
title: "Learning Learn Claude Code: from the Agent Loop to the harness"
description: 'Once the implementations of tool calls, permissions, task state, async events, and multi-agent collaboration are laid out, I find that the hard part is not how many features there are, but the boundaries, the timing, and the protocols the host has to hold.'
contentType: note
pubDate: 2026-10-14T12:00:00+08:00
slug: learn-claude-code-harness
tags: [Study notes, Agent, Claude Code, Harness]
llmSummary: 'An expansion of module notes from the learn-claude-code teaching project (the notes were written in June and July 2026, and organized into a piece in October 2026). It unfolds along a minimal tool-calling loop: the message-protocol details of the Agent Loop (association by tool_use_id, several tool calls in one round, the stopping condition); separating a tool''s schema from its handler, and the inner boundary of safe_path; three permission gates, and a refusal as feedback; four Hook events and the short-circuit semantics of the first non-None return; a comparison of Todo, Task System, and Memory as three kinds of state, with the validation and the lifecycle of each; persisting task files, claiming atomically inside a lock, and unlocking dependencies; background, cron, and team events all delivered at the round boundary as a new user message; the teammate state machine, IDLE handling messages before claiming a task, the Task to Assignment to CWD binding and releasing it at the round boundary; approval and shutdown protocols that carry a request_id and a work_version; fail-closed worktrees and partial-failure handling; MCP naming and a dynamic tool pool, progressive disclosure of Skills, and the acceptance gap in the Goal Loop. It marks explicitly which parts are the teaching implementation and which are not finished yet, and the project link is at the end.'
---

While learning Learn Claude Code, I split the material into a set of module notes: the Agent Loop, Tools, Permission, Hook, Todo, and Task System, and on to Background Tasks, MCP, Memory, and Agent Teams.

At first glance, every module looked like one more feature being added to the agent. A few more tools, a slightly longer memory, a few more agents, and the system would seem to get stronger and stronger.

But once the implementation details are laid out, I would rather understand them along another line: **how a minimal tool-calling loop gradually grows into a runtime that can constrain action, keep state, deliver events, and coordinate work.** That runtime is the Harness this piece is talking about.

Two things to say first. On time: these are the module notes I wrote down while studying in June and July of this year, and I only recently organized them into a piece. On the boundary: what is arranged below is my study notes and the teaching implementation, not a reconstruction of the official Claude Code source. Some parts of the material are relatively complete code (the multi-agent one, for example), some are only fragments with the dependencies omitted, and some (memory, scheduling, acceptance) stop at a design note. I will try to say, at each place, how far it got. For me, the value of this round of study was not memorizing which features the product has. It was getting the engineering problems behind those features clear.

## 1. The Agent Loop is small; the point is to bring the feedback back

The smallest Agent Loop is only a few dozen lines. Fill in the interface details and it is roughly this:

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

It looks simple, but not one of the details can be left out:

- **The assistant's raw response has to be saved as it is.** The tool result later has to refer to the `tool_use` block inside it. If that block is missing from the history, the model cannot see what it just requested.
- **One response can contain several tool calls.** The loop has to walk every `tool_use` block and merge their outputs into one user message to put back. It cannot handle only the first, and it cannot split them into several messages — the protocol requires a corresponding result for every request.
- **`tool_use_id` is the only association.** In the same round the model can fire off two bash calls in a row, and the results are matched up by id. Without it, what the model sees is a pile of text that has lost its source.
- **A tool's output is always a string.** Objects, exceptions, exit codes — in the end they all have to be translated into text the model can read. The model does not care what type the handler returned.

This was the first time I clearly separated two things: **the model proposes an action, and the host carries the action out.** The model outputting a Bash call is not the same as the model having run the command itself. What actually changes a file or starts a process is the handler on the host side.

So a tool error is not an accident outside the closed loop either. A command failing, a tool not existing, a permission being refused — all of these should become feedback the model can read on its next step. The implementation does exactly that. If the tool cannot be found, return `Unknown tool`. If the handler throws, catch it as `Error: ...`. If the command times out, return `Error: Timeout (120s)`. **The basic unit of an agent is not one handsome answer. It is one action, and a result that can still be used after the action.**

I also noticed that this loop has only one stopping condition: the model stops requesting tools. As for "whether the work is actually finished", the loop itself makes no judgment — the Hook, the Goal Loop, and the acceptance in the later sections are all filling this gap.

## 2. Registering a tool is only the entrance; permissions and hooks decide the boundary

`Tools.py` separates three things: the tool definition the model sees (the name, the description, the parameter schema), the handler that actually executes, and the dispatch table between the two.

```python
TOOL_HANDLERS = {
    "bash": run_bash, "read_file": run_read, "write_file": run_write,
    "edit_file": run_edit, "glob": run_glob,
}
```

The model gives a tool name and arguments, and the host looks them up in the table and calls them. Adding a tool this way does not mean rewriting the loop. You only add one definition and one handler — "the tool has been registered" solves callability, not the boundary of its capability.

What really decides the boundary is the check inside the tool. Every file tool first goes through path resolution:

```python
def safe_path(p: str) -> Path:
    path = (WORKDIR / p).resolve()
    if not path.is_relative_to(WORKDIR):
        raise ValueError(f"Path escapes workspace: {p}")
    return path
```

`resolve()` first, and only then judge whether it is still inside the work area. Neither `..` nor a symlink can get around it. Each match from glob is checked again on its own. This is the inner boundary, the last door. And down at each particular tool, the boundary is not only the path. Bash has a 120-second timeout, stdout and stderr merged, a truncation at 50,000 characters, and empty output written explicitly as `(no output)`. The edit tool requires the match to be **exactly one place** before it acts, and a match of zero places or of several places both return an error — in an automated setting, changing the wrong place costs more than not changing anything.

The outer layer is the permission check. The notes split it into three gates: a hard refusal of dangerous commands, a match against the rules, and asking the user when necessary. What is easiest to write wrong is actually the way the refusal is written:

```python
if not check_permission(block):
    results.append({"type": "tool_result", "tool_use_id": block.id,
                    "content": "Permission denied."})
    continue
```

**A refusal does not end the task. It becomes an ordinary tool result.** The model sees "refused", and it can switch to another way of doing it and continue. That is much gentler than failing the whole round, and closer to real collaboration — being refused was a fact to begin with, not an error.

A hook is where this kind of policy gets moved out of the loop. Four events: `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`. The registered callbacks run in order, **the first one to return non-None short-circuits**, and the return value is taken as the reason for "stopping":

```python
def trigger_hooks(event, *args):
    for callback in HOOKS[event]:
        result = callback(*args)
        if result is not None:
            return result
    return None
```

That way the loop itself stays stable, and permissions, logs, and reminders about large output are all registered from the outside. The Todo version also uses the Stop event to do "continue": if the model stops and the Stop hook returns a message, the loop appends that sentence to the conversation and comes around again — the same mechanism can both block and push.

And "the same policy has a different shape on a different executor". A teammate in the multi-agent code cannot pop a window and ask the user, so the permission check runs with `prompt_user=False`: what comes back on a crossing of the line is no longer "refused", it is "this needs the Lead to carry it out". The reason for refusal becomes a reason for handing it over. Another pit that is easy to step in is the inner and outer layers disagreeing: the outer layer approved some path, and if the inner layer still refuses it fixedly, what the model receives is rules that contradict each other.

Last is the limit of a blacklist. Bash uses string matching to block dangerous commands (`rm -rf /`, `sudo`, `shutdown`, …). This is good for understanding where the check happens, but it cannot be treated as a reliable isolation scheme: a shell can do far more than a few patterns. **Allowing the model to request a tool, and allowing the tool to produce some side effect on the machine, are two different questions.**

## 3. A long task needs state, but not all state is called memory

Once a task goes from "change one line" to "read the code, design, implement, verify", the message history alone starts to struggle. Todo, Task System, and Memory are all supplying state, but they are not supplying the same kind of thing.

| Module | The question it mainly answers | Lifecycle |
| --- | --- | --- |
| Todo | What do I intend to do now, and how far have I got? | The plan and the progress of the current task |
| Task System | Which piece of work can start, who is responsible, and are the dependencies satisfied? | A unit of work that can be persisted |
| Memory | What is still worth knowing next session? | Background information across sessions |

### Todo: visibility, not control

A todo is a plan laid out in the conversation, and updating it is done through a `todo_write` tool. The way it is written has two points of care. One is **validate first, then replace the whole thing** — the content cannot be empty, only one task can be in progress, and at the wrap-up they ought to be all finished. If validation fails, the existing list is left untouched, rather than appending one more entry to the array. The other is a small mechanism: if three rounds in a row have not touched the Todo, the runtime appends a sentence after the tool result, `<reminder>Update your todos.</reminder>`.

It does not force the model to do anything. It only reminds. Because the essence of a Todo is to make the progress visible, not to let the runtime make the plan in the model's place — the model writing down "done", and the code actually passing verification, are still two different things.

### Task System: the task graph solves "whether it can start"

The Task System turns work into an object that can be persisted: one file per task, and the fields hold, besides the status and the owner, the dependencies.

```python
@dataclass
class Task:
    id: str
    subject: str
    status: str          # pending | in_progress | completed
    owner: str | None    # the agent responsible for the current task
    blockedBy: list[str] # ids of the tasks this one depends on
```

"Once the database is done, which tasks can continue" becomes a computation from that. `can_start` checks whether every dependency is already complete, and a missing file counts as not complete. The act of completing also filters out the tasks **newly unlocked by this completion**, and pushes "what can be done next" back to the model along with it. Claiming and completing both carry conditions: only a task that is `pending` and that nobody has claimed can be claimed; only the owner themselves can mark it complete — work someone else got halfway through, even if you have permission to change the file, cannot be closed out on their behalf.

### Memory: memory is information governance first

Memory is the closest to the "remembering" we talk about day to day, but what it actually has to answer is four questions.

What to store: a candidate has to carry a scope, and only `persistent` ones are kept. Ones carrying a temporary sense such as "this session" or "the current task" get stopped by a word list — "don't create files this time" constrains only the current task, and should not keep taking effect next session. What to store it as: one Markdown file per memory, with name / description / type metadata at the front, plus an index file that registers them line by line. How to retrieve: first let the model do a semantic match against the index, and if the match fails fall back to ranking by keyword — "not remembering clearly" is allowed, and fetching the wrong thing and treating it as absent is not. How to maintain: past a certain scale, merge duplicates, update contradictions, and delete what has expired. **Save a snapshot before replacing**, and if the write fails, restore the original file and rebuild the index.

One principle I think matters more than the implementation: **recalled memory is background, not a command.** When it conflicts with the current request, the current request wins. Otherwise old information acquires the authority to give orders in the user's place.

My memory notes stop at the design. There is no implementation. But this sentence is worth leaving in place first: storing all of the history is not the same as owning a reliable memory. It may only be keeping an old misunderstanding around for longer.

## 4. Background tasks, scheduled tasks, and teammate messages share one problem

Background Tasks, Cron, and Agent Teams look very different on the surface: one runs a command that takes a long time, one waits for a time to arrive, one waits for another agent to write back. But standing at the entrance of the Agent Loop, they are all asking the same thing: **while the model is not looking at this matter, something changed on the host side — how do you hand that change to the model on the next round?**

The first decision for a background task is "do not wait". A long-running Bash carries `run_in_background` explicitly, the tool returns an id at once, and the real process runs in another thread:

```python
with self._lock:
    self.tasks[task_id]["status"] = status
    self.results[task_id] = _format_bash_result(output, exit_code)
    # Completion is not handed to the agent immediately. It goes onto the ready
    # list, and is delivered on the next turn of the Agent Loop.
    self._ready.append(task_id)
```

The form of the delivery is just as particular. When the task actually ends, the result is not inserted into the middle of the current conversation. It waits until this round ends, and is appended as a new event:

```
<task_notification>
Background task bg_0001 completed.

npm install finished successfully.
</task_notification>
```

**"Started" and "finished" are two different messages.** The model will not misread the start confirmation as the result, and the completion notice does not have to interrupt reasoning that is already underway.

Cron thinks the same way. It checks every second whether any task is due, but when the time comes it only enqueues, and it does not preempt the model call that is currently executing. `last_fired` keeps the same minute from being enqueued twice, and `pending_delivery` marks "not delivered yet". A 9 o'clock task that only gets its turn at 9:03 is delivered all the same — better late than crowding in.

Team messages take the same road, except the entrance is in the CLI. The runtime waits at the same time for user input and for the Lead's inbox, and once there is a teammate message it formats them into a stretch of `[Team events] ...` and appends that as a new user message, waking the Lead into a new round.

Put these together and the regularity is clear: **an async event has to enter the message history at the round boundary, and it is uniformly disguised as a "user message"** — because to the model, it really is new input. The model does not need to understand threads, queues, and timers. It only has to see what happened the next time it is called.

The cost of this mechanism has to be said clearly too. The file mailbox is "delete on read": if it crashes in the gap between taking the message away and the model actually reading it, the message is lost, with no ack and no retry. The ready queue of a background task lives in memory, and a process restart loses it the same way. The `durable` field of a scheduled task promises that it is kept across sessions, but there is still a distance down to the implementation. **What stands between "it can run" and "it can recover" is exactly this layer.**

## 5. The hardest part of multiple agents is not starting a thread. It is binding the boundary of the work

In this set of material, `agent_team_code.py` is a relatively complete implementation: task storage, the mailbox, teammate threads, plan approval, and the binding of a task to a worktree can all be seen inside the same program. The diagram at its start (the Lead generates tasks → teammates WORK / IDLE → events return to the message bus) looks very tidy. The actual complexity is all at the edge of the state.

### A teammate is not "one more model". It is a stretch of runtime that carries state

Each teammate is a thread holding its own message history, system prompt, and tool set, and it walks among four states: working, waiting_approval, idle, stopping. The order of what it does while idle is worth copying down:

```python
def wait_for_work(self):
    while True:
        inbox = BUS.wait_for_messages(self.name, IDLE_SCAN_INTERVAL)
        if inbox:
            ...            # handle the Lead's messages first
        task = claim_next_task(self.name)
        if task:
            ...            # no messages, then look for a ready task
```

**Handle messages first, then claim a task.** If there is no work, wait two seconds and look around once more. Finishing a task does not mean exiting, either. It goes back to idle — that is what "a persistent teammate" means: the identity and the context are kept inside the process the whole time.

But that is not the same thing as "recovering across sessions". The task files stay on disk. The message history, the approval state, and the runtime bindings are only in memory, and a process restart loses them. I marked this twice in the notes, because it is far too easy to blur it over with the one word "persisted".

The rule on the Lead's side is exactly the reverse. After generating teammates it should end this round, and not poll for status. What actually "wakes" the Lead is the runtime — the CLI notices there is something in the inbox, appends the event as a message, and then triggers one model call. What is reduced is the polling at the model layer, not all polling: the CLI looks at the input and the mailbox every 0.25 seconds, and an idle teammate scans for tasks every 2 seconds.

### Seeing that a task can be done is not the same as having claimed the task

Several teammates may see the same ready task at the same time. "Scan first, then change the status" is not enough. Claiming has to be one atomic operation:

```python
def claim_task(task_id, owner):
    with task_store_lock():            # a thread lock plus a file lock
        task = load_task(task_id)
        if task.status != "pending": ...
        if task.owner: ...             # already claimed by someone else
        if not can_start(task_id): ... # the dependencies are not done
        task.owner = owner
        task.status = "in_progress"
        save_task(task)                # a temp file plus os.replace
        teammate_assignments[owner] = {"task_id": task.id, "cwd": cwd}
```

The check, the modification, and the save are all inside the same lock. The lock has two layers: an `RLock` inside the threads, and a file lock (fcntl.flock) built on the task directory. The latter keeps several host processes on the same machine from grabbing the same task either. The write uses a temp file plus an atomic `os.replace`, so it does not leave a task file that was written only halfway. There is an extra limit besides: "one teammate has only one thing at a time". If there is already an assignment, or there is already a task in progress, the claim is refused outright.

The task graph solves "whether it can start". Atomic claiming solves "who is allowed to start". The former cannot stand in for the latter.

### The boundary of the task also has to become the boundary of file operations

Putting different agents into different worktrees only prepares different working directories. What really matters is which directory the later tool calls actually execute in.

This implementation keeps a registry: Task → Assignment → CWD. Each of a teammate's file tools does not use the workspace root directly. It exchanges the assignment for a directory:

```python
def assignment_cwd(owner):
    ...
    if task.status not in {"in_progress", "completed"} or task.owner != owner:
        raise ValueError(f"Assignment for {owner} is no longer active")
    ...
    if cwd.resolve() != Path(assignment["cwd"]).resolve():
        raise ValueError(f"Assignment cwd changed for task {task.id}")
```

When the binding is broken, refuse to execute, rather than quietly falling back to the main directory — **fail closed, rather than fail open**. If the task no longer belongs to you, or the working directory does not match the record, the tool would rather error than act.

Inside it there is also a very fine timing problem, anticipated ahead of time. The same model response might call "complete the task" first, and then call a file tool afterwards. If completing the task released the directory binding immediately, the later operations might land in the wrong directory. So the release is postponed to the round boundary — it runs only when the model calls no more tools this round, and it only releases an assignment that "is already complete, and really belongs to itself". An action that looks like nothing but "deleting one dictionary entry" is in fact part of the state machine.

Creating and removing a worktree are also designed entirely around "consistency". Before creating, validate the task status, the branch name, and the Git registry. When Git succeeds but binding the task fails, what comes back is not a simple error. It is a "partial success" that describes the residue, and a person finishes the cleanup by hand. Removal requires that the task is already complete, that no teammate is still renting the directory, and that the work area is clean (unless discarding the changes was explicitly requested), and the branch is kept forever. These pieces of handling look verbose, but they point at the same thing: **among several writers, the most expensive thing is not creating. It is not knowing what the state actually is right now.**

### An approval has to approve a specific piece of work, not a name

Plan approval cannot be as simple as "agree to this teammate", either. The teammate may already have changed tasks, and the plan may already have changed.

The code makes approval into a numbered request protocol. The message carries a `request_id`, and the request records a `work_version` (the assignment version) and a `task_id`. When a teammate submits a plan it generates the request and sets the gate to pending. When the Lead approves, it has to check that this request still points at that teammate's **current** work. When the teammate receives the approval it checks the other way too, and it takes effect only when the request_id, the task_id, and the version all match:

```python
valid = (
    msg["from"] == "lead" and msg["to"] == name
    and request_id == expected_id
    and state.work_version == work_version
    and state.task_id == task_id
    ...
)
```

The moment the task changes, the version number goes up by one, and the old approval expires on its own. What gets approved that way is "this version of this task", not a pass some agent can keep using.

Approval is also tied to the permission to execute. While the plan is not approved, the teammate's bash / write / edit are stopped by the gate, which returns `Blocked: plan status is ...`. Reading files and looking at tasks are unaffected. **Some messages are only information. Some messages change the permission to execute. The latter need an explicit protocol and a state check.** Shutdown is the same. The Lead sends a shutdown request carrying a request_id, the teammate checks it and replies with an ack, and exits at the round boundary. On exit, unfinished tasks are returned to pending — abandoned work has to go back to the task board, not rot inside some thread.

### The problems not solved here

What has to be said clearly is that these mechanisms still rest on the assumption of "the same process". Teammates are daemon threads. When the process exits, the message history, the approval state, and the leases all disappear. The mailbox deletes on read, with no ack and no retry. "Ask the user before generating a teammate" is written in the system prompt, and it relies on the model obeying it. It is not enforced by code. A teammate's tool permissions also cover only bash / write / edit, and other calls go around them.

A multi-agent system that can be left unattended for a long time still has to keep filling in reliability here. This is also the most honest part of this set of notes: **the teaching implementation lays the problems out, but it does not pretend they have already been solved.**

## 6. Extending capability is not the end. Acceptance is the other half of the closed loop

The remaining few modules, I would now understand along two directions.

One direction is extending the capabilities the model can use. A skill uses progressive disclosure: the system prompt holds only each skill's name and description, and the body is loaded when the moment is right — because every time the prompt is assembled, it is competing for a limited context. MCP lets external tools enter the tool pool: the server provides the tools and the call entrance, and the harness is responsible for connecting, naming, permissions, and dispatch.

```python
# mcp__{server}__{tool}
# different servers may have a tool of the same name: docs.search() / github.search()
```

Two details are worth keeping. The tool pool is **reassembled every round**, because a new server may connect midway through the session. The `mcp__server__tool` prefix is the name shown to the model, and the real call entrance is dispatched by the harness. The MCP in the material is still a mock example, and it cannot be equated with having already connected a real protocol.

The other direction is controlling how a task moves forward. A workflow composes steps that are already known — run three checks in parallel first, for example, then verify serially, and then register the whole thing as a tool. What it emphasizes is "composition", packing several actions into one larger action.

The Goal Loop handles a different kind of problem: the model has stopped, but the thing has not been accomplished. The example in the notes is typical: fix → run pytest → find an error → this round ends. The design intent is to analyze the result after the model stops, and if there is still an error or a block, push one more round.

But "call the model once more when an error is found" is not a complete answer. The basic loop already feeds tool errors back. What is actually missing is: **after the model stops, who judges whether the goal has already been reached.** Only scanning the messages for an `error` is too crude — the absence of error text does not mean the scene the user wanted can work, and the presence of error text does not necessarily mean the whole task failed. To keep pushing forward, you need at least an explicit standard of acceptance, a verification result that can be read, and a boundary for retrying and for stopping.

The material leaves a set of self-test questions at the end, and one of them stayed with me the most: context compression, and recovering from a 429 or a 529 — why do these belong to the Agent Runtime rather than to the LLM itself? Because they all happen **between turns** — in the gap the model cannot see, the host is responsible for putting the state back in order. Arranged, the runtime's duties are really a list:

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

The runtime not only has to let the agent know "what happened". It also has to give the agent a checkable "what counts as done".

## The thread I kept

Looking back, I no longer understand these modules as a string of features sitting side by side. They are the same loop meeting new engineering problems, one after another:

- An action needs feedback, so there is a tool result written back. Even a refusal and an error have to be written back.
- An action produces side effects, so there are permissions, a path check, and hooks. But a refusal is feedback, not termination.
- Work spans many rounds, so the plan, the task, and the long-term memory have to be distinguished. The lifecycles of the three are completely different.
- A result may arrive late, so there are queues and event delivery. Every async event becomes a new user message at the round boundary.
- Several agents work at the same time, so atomic claiming, a directory binding, and an approval protocol that carries a version are needed.
- The model may stop early, so an independent basis for acceptance is still needed.

The change this round of study brought me was a shift of attention, from "what the model will think next" to "how the host lets this step happen safely, and gives the next step something to go on".

**The Agent Loop is responsible for joining the actions up. The Harness is responsible for giving those actions a boundary, a state, and feedback. And whether it was actually accomplished still has to be handed to verification.**

There is a sentence at the start of this material that I have kept in mind: Agency comes from the model training itself, and an agent product equals "model + Harness" — the model is the driver, and the Harness is the car. What this set of notes lays out is the parts the car is built from. None of them is hard to understand on its own. What is hard is making them all hold at the same time.

That is more worth keeping than memorizing a dozen module names.

(The original material: [shareAI-lab/learn-claude-code](https://github.com/shareAI-lab/learn-claude-code), a teaching project that implements a nano Claude Code-style agent harness from zero to one. The code fragments in this piece come from that project and from my module notes.)
