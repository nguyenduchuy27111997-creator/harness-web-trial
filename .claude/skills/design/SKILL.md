---
name: design
description: Writes the design doc for one milestone (docs/design/<M>.md: data model and migrations, contract, module boundaries, NFR) and has the architect subagent approve it. The loop runs it before the first feature of each milestone; run it by hand only to redo a design.
argument-hint: <milestone, like M1>
model: opus
---

# Design (one milestone)

Argument: $ARGUMENTS (the milestone; anything after it is context from the human, for example an answer the loop relayed).

The design is the contract every feature of the milestone is built and reviewed against. Keep it as small as the milestone allows: it is read by every session that builds one of its features.

## 1. Read
- `docs/product/spec.md`, every feature of the milestone in `harness/features.json`, `docs/decisions/`, the earlier milestones' `docs/design/*.md`, and `harness/PRESET.md` if it exists (it says which tools enforce the design in this stack).
- The code as it is now: schema and migrations, routes, modules, shared types.

## 2. Write `docs/design/<M>.md`
Use exactly these sections. Describe what this milestone adds or changes; refer to an earlier design for what stays.

```
# Design <M>: <one line on what the milestone delivers>

## Features
<each feature id of the milestone, one line on what it needs from this design>

## Data model
<tables or collections: fields, keys, relations, constraints, indexes, access rules (for example RLS)>

### Migrations
<the schema changes in order, each one a new migration that keeps existing data>

## Contract
<every endpoint, server action or public function the features use: inputs, outputs, errors; where its types live>

## Modules
<each module or folder, its one job, and the import rules between them (who may import whom)>

## NFR
- Load: <expected users, requests, data size; limits that apply>
- Security: <threat model: who can read or change what, and what stops everyone else>
- Cost: <infrastructure this needs and what it costs at that load>

## Decisions
<choices made here, with the alternative rejected and why; a choice that changes an earlier design or decision also gets a file in docs/decisions/>
```

### With an agent team (optional, P33)
When `HARNESS_AGENT_TEAMS=1` is set and agent teams are on in this session (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`; never in the loop, which runs headless), write the doc as a team: one teammate drafts Data model and Migrations, one the Contract, one Modules and NFR, each in its own file under `docs/plans/design-<M>/`, messaging each other where the sections meet (a table the contract reads, a module that owns an endpoint). You stay the lead: merge the drafts into `docs/design/<M>.md`, make the sections agree, and go on to step 3. The architect still approves the merged doc alone.

## 3. Make it enforceable
If `harness/PRESET.md` lists design gates, update their configuration to match the doc (for example the import rules in `.dependency-cruiser.cjs`). Do not write product code, migrations or tests: features do that.

Run `./scripts/check.sh`; it must pass.

## 4. Approve
Spawn the `architect` subagent with the milestone id and wait for its result (foreground). Fix every problem it lists and spawn it again, up to 3 rounds. A hook saves its report as `harness/evidence/design-<M>.md` with a hash of the doc; the integrity guard refuses a design doc without a PASS for exactly that content, so any edit after the PASS needs a new architect run. Never write under `harness/evidence/` yourself.

If it still fails after 3 rounds, commit nothing: report the remaining problems and stop. The loop retries with your notes.

## 5. Commit
Commit the doc, the gate configuration and the evidence: `docs(design): <M> - <one line>`. Never bypass the pre-commit hook.

Report in 3 lines: milestone, the main choices, what feature sessions must watch for.
