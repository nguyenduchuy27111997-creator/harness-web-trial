---
name: interview
description: Interview the human about the product and write docs/product/spec.md. Use before /kickoff, or when the spec is vague or missing sections.
argument-hint: [one-line product idea]
disable-model-invocation: true
model: opus
---

# Interview

Goal: a spec precise enough that `/kickoff` can turn it into testable features without guessing.

Product idea: $ARGUMENTS

1. Read `docs/product/spec.md`. Keep anything already filled in; ask only about gaps.
2. Interview with the AskUserQuestion tool, 1 to 4 questions per round. Skip the obvious. Dig into:
   - who the user is and the one job they hire the product for
   - the 2 to 4 core flows, step by step, including what the user sees
   - edge cases: empty states, errors, permissions, limits
   - what is explicitly out of scope for this version
   - data: what is stored, where it comes from, what is sensitive
   - look and feel, if it has a UI: mood, products it should feel like, brand colors or logo, light or dark, density
   - stack and hosting constraints (budget, existing accounts, languages the human can maintain)
   - how the human will judge that this version works
3. Stop when every section of the spec can be written concretely. Usually 3 to 5 rounds.
4. Write `docs/product/spec.md`. Keep each section short. Group scope into milestones: `M1` is the smallest version a user would actually use; later milestones add to it.
5. Show the human a 5-line summary and ask them to confirm or correct it. Apply corrections.
6. Commit: `docs: product spec`.

End by telling the human to run `/kickoff` in a fresh session.
