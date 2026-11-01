---
name: feedback
description: Sort out what the human said about the built product (in chat, or with /bug on a PR) and route each item to the right place, a bug or a re-plan. Use when the human says something works wrong or differently than they meant, or asks to go through feedback the build loop collected.
argument-hint: "[what is wrong, in the human's words]"
---

# Feedback

Feedback: $ARGUMENTS

Items come from the human's words above, and from the loop's file of `/bug` comments left on PRs:
`"$(git rev-parse --git-common-dir)/harness-loop/feedback.jsonl"`, one JSON object per line
(`at`, `id` of the feature, `pr`, `text`, `from`). An item with `"handled": true` is done.

1. List the open items (the human's words first) and, for each, read the feature in `harness/features.json`,
   its status file and its PR, so you know what was built and what acceptance said.
2. Put each item in one class and say which, in one line each:
   - **Broken:** it does not do what its acceptance says. Route: follow `.claude/skills/bug/SKILL.md` for it.
   - **Built as specified, not as meant:** acceptance was met, but the human meant something else (an intent miss).
     Route: ask the human what they meant (AskUserQuestion, with what was built as one option), then follow
     `.claude/skills/replan/SKILL.md` to change the spec and the feature's acceptance. Record the miss so repeated
     ones turn into a rule: append `{"at": "<now>", "id": "<id>", "kind": "intent miss", "detail": "<what was built vs
     what was meant>"}` as one line to `"$(git rev-parse --git-common-dir)/harness-loop/failures.jsonl"`.
   - **New scope:** something the spec never asked for. Route: `.claude/skills/replan/SKILL.md`.
   - **A question:** answer it in chat; nothing to change.
3. Before anything is committed, show the human the plan (item, class, route) and ask them to confirm it.
4. Do the routes. Then mark each item from feedback.jsonl done by rewriting its line with `"handled": true`
   (keep the other lines as they are).
5. Say what changed and that `/build` picks up new bugs first.
