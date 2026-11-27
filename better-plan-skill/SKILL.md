---
name: better-plan
description: Align before acting. Grill the user in numbered rounds where every question has a pre-filled recommendation, then publish an ordered plan that needs one explicit confirmation, and only then implement. Use for any non-trivial feature, refactor, migration, or design task.
---

# Better Plan

Use this for work that is not trivial: a feature, a refactor, a migration, a design review, an
architecture decision. For a one-step change, skip it and just do the work.

The rule is simple: **ask first, plan second, implement last.** Nothing is implemented until the
user has confirmed the plan.

## 1. Ask — one round at a time

Map the work as a **design tree**: every decision branches into decisions that depend on it.
The **frontier** is every question whose prerequisites are already settled — ask those now.

Ask the whole frontier in ONE message, 3 to 10 numbered questions. Every question carries 2–5
concrete options and exactly one recommendation. Use this shape:

    Q1 — <short title>
    A. <option, with its trade-off in a few words>   ← recommended
    B. <option>
    C. <option>

    → Recommended: A — <one line on why, when it is not obvious>

    Q2 — ...

    Reply "all recommended" (or "全部按推荐") to accept every default,
    or answer item by item, e.g. "Q1B Q2A Q3: <your own answer>".

Then stop and wait. Do not ask the next round in the same message: the answers reshape the tree.

Rules:

- **Facts are yours, decisions are theirs.** Read the files, run the commands, search the repo,
  dispatch a sub-agent when a fact needs its own context. Never ask the user something you could
  look up. Do not block the whole round on one fact — ask the questions that do not depend on it.
- **A question that depends on an open question belongs to a later round.** Never guess its answer.
- Keep each round to at most 10 questions; split a larger frontier across rounds.
- `all recommended` / `全部按推荐` / a bare `yes` accepts every recommended default at once.

## 2. A custom answer is never final

A custom answer is anything that is not the recommended default: a different preset option or typed
text. Treat it as **not final**. Publish ONE follow-up round that restates your understanding of
each custom answer and asks to confirm it. Only after that is it settled.

Do not silently adopt a custom answer, and do not bury it inside a new plan.

## 3. Plan — one ordered list, one confirmation

When the frontier is empty, publish the plan as an ordered list. Each step:

    P1 — <short title>
    <what changes, where, and how to verify it: a command, an expected output, a check>

Ask for exactly one confirmation:

    Reply `confirm` to start. If something is wrong, say which step and why — I will revise and
    re-publish the plan.

Nothing is implemented before that `confirm`.

Keep steps small and independently verifiable. The plan is a sequence, not a summary; do not
restate the questions.

## 4. Implement — and do not drift

- Follow the confirmed plan. If a step turns out to be wrong, stop and go back to step 1 for the
  decision that changed, instead of quietly improvising.
- Report back against the plan's verification steps.
- A plan item the user changes mid-flight goes through the same custom-answer rule: confirm first.

## Reference files

- `references/grilling.md` — the discipline for working the design tree in rounds.
- `references/domain-modeling.md` — sharpening the project's language and recording decisions.

Read them when the task is design-heavy. They are adapted from
[mattpocock/skills](https://github.com/mattpocock/skills) (MIT); see `THIRD_PARTY_NOTICES.md` in
the repository root.

The ask-then-plan shape follows that repository's `grill-with-docs` skill (grilling and
domain-modeling in one pass), with one addition: an ordered plan that must be confirmed before
implementation starts. `grill-me` is the upstream shorthand for grilling on its own.
