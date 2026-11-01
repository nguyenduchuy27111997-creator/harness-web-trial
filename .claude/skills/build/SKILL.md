---
name: build
description: Run the build loop from chat. It builds ready features in parallel (3 lanes by default), opens one PR per feature, and merges each PR itself when CI is green, the verifier passed and review found no bugs. Use when the human asks to build, run or start the loop, for its status, to answer its questions, or to stop it.
argument-hint: "[start|status|stop|stop now|budget M1 20] [--lanes 3] [--budget 10] [--milestone M1] [--milestone-budget M1=20]"
---

# Build loop

Request: $ARGUMENTS

The human does not read code or use a terminal. Everything goes through you and `harness/loop.py`; never edit product code in this skill.

## Start (the default when the loop is not running)
1. Run `python3 harness/loop.py status`. If it is already running, go to Status.
2. Unless the human gave a budget, run `python3 harness/loop.py forecast` (add `--milestone M1` when they named one) and propose the `--budget` it suggests, with its estimate, in one line; use what they answer.
   Run `python3 harness/loop.py start --lanes 3 --budget 10` plus any options from the request (`--milestone`, `--lanes`, `--budget`, `--milestone-budget M1=20` for a budget that spans runs). The loop detaches and keeps running if this session ends.
3. If it prints `Cannot start: ...`, explain the fix in one plain sentence each. Uncommitted changes: show what they are and ask before committing them. No GitHub remote or `gh` not signed in: the human must set that up; say how.
4. Open the dashboard URL it prints in the built-in browser so the human can watch.
4b. Phone (once per project): if `python3 harness/loop.py notify test` says pushes are not set up, offer them. On yes, run
   `python3 harness/loop.py notify set`, give the human the topic it prints (install the free ntfy app, tap +, subscribe
   to that topic, keep it private), then `notify test`. Also suggest turning on Remote Control in the Claude app, so they
   can answer here from the phone. Pushes come when the loop needs them, a run ends, a milestone is done, or the machine
   or network has trouble; questions also go on the PR, where `/answer <text>` or `/drop <why>` from their account works.
4c. Unattended (once per project, on this Mac): offer `python3 harness/loop.py service install`, a launchd agent that runs
   the loop so a crash or a reboot does not end a run (it resumes with the same budget, at most 3 times). After that
   `start` hands each run to the service. If CI runs on a self-hosted runner on this Mac (`HARNESS_RUNS_ON`), ask once
   whether the loop may restart that runner when it gets stuck; on yes, `python3 harness/loop.py runner on`.
5. Watch for things that need the human: start a monitor on `python3 harness/loop.py events --follow`, filtered to lines containing `needs_human`, `held`, `failed`, `reverted`, `merged`, `budget:`, `repeated:`, `paused:`, `offline:`, `milestone:`, `from GitHub` or `stopped`.

## When the loop needs the human
For each `needs_human`, `held`, `failed` or `reverted` event: run `python3 harness/loop.py status`, read the question under "Waiting on you", and ask the human in plain words (AskUserQuestion when there are clear options). Then record the answer: `python3 harness/loop.py answer <id> "<their answer>"`. The feature goes back in the queue with the answer as context; a `held` feature whose PR is open is fixed on its branch with the answer instead, then reviewed again. Other lanes keep working meanwhile.

Jobs named `D-<M>` are milestone designs: the loop writes `docs/design/<M>.md` and has the architect approve it before that milestone's features start. They need the human only if the architect keeps rejecting the design.

A `held` feature whose question says it spent more than its budget (three times what a feature here usually costs) waits for the human: tell them what it spent and why it may be big (from its PR and log), and record their answer as usual; "$5 more" (any amount) lets it go on, `drop` ends it.

For a `budget:` event, a milestone used its budget: its features wait (bugs and other milestones go on). Tell the human what it spent and ask for a new budget; record it with `python3 harness/loop.py budget <M> <dollars>`.

A job the human no longer wants answered (a rule proposal already done, a feature dropped from scope) is closed with `python3 harness/loop.py drop <id> "<why>"`.

For a `paused:` event, the Claude account hit its usage limit: the loop keeps every job as it was, goes on with CI and merges, and starts Claude work again after the reset time it names. Tell the human that time in one line; nothing to answer.

For a `repeated:` event, the same kind of failure happened twice or more. The loop opens a rule job (`L-<hash>`) for it: `/learn` adds a rule to `docs/golden-principles.md` and the reviewer's checklist in a PR that may touch only those two files, merged once CI is green. Tell the human in one line when it merges. If the job asks instead (`needs_human` with a `PROPOSE:`), it wants a lint, hook, gate or skill change: ask the human and record the answer as usual.

For `merged` events, tell the human in one line which feature landed. For `stopped`, give the reason, the cost and what was merged, then `python3 harness/loop.py digest` (at most six lines: the run, the week, what waits, owner checks, feedback, repeated failures).

Some merged features are owner checks: the first one with a UI in each milestone, ones marked `owner_check: true`, and about one in four. They never block a merge: the human looks at the PR and comments `/ok` or `/bug <what is off>`. When the digest shows feedback to sort out, run `/feedback`.

For `offline:` (GitHub unreachable) the loop waits by itself and says `online again`; for `slept:` the Mac slept during the run; for `waiting:` the machine is too busy (load, disk, or a probe such as `docker info` failing: say what to start) and no new session starts until it eases; for `runner:` the self-hosted runner is stuck (the loop restarts it if allowed, else the human runs `svc.sh stop` and `svc.sh start` in the runner's folder). Tell the human in one line.

## Status
For "how is it going overall" or "is it getting better", run `python3 harness/loop.py metrics`: first-pass yield, cost per feature, review cost per feature (aim $0.30), the human's answers, reverts, failures that were the machine's, spend by model, and results by kit and Claude Code version.

Run `python3 harness/loop.py status` and summarise in at most five lines: running or not, cost of budget, milestone spend, what is building, PRs waiting on CI, what merged, the `Health:` line when something in it is off, and any questions (ask them). Re-open the dashboard if the loop runs.

## Stop
`python3 harness/loop.py stop` takes no new work and stops when the running sessions finish. `python3 harness/loop.py stop --now` stops at once (the cut-off features are rebuilt next time, and the run's spend is marked incomplete: those sessions never report their cost). Use `--now` only when the human asks to stop immediately.

## Before the first start in a project
The loop needs: a GitHub remote `origin`, `gh` signed in, a clean working tree on `main`, a backlog with ready features (`/kickoff`, `/bug` or `/replan` make one), and `.github/workflows/check.yml` so each PR has CI. It spends at most the budget; tell the human the budget before starting if they did not give one.
