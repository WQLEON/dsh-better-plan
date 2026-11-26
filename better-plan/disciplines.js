/**
 * Inlined grill-with-docs + plan disciplines for better-plan.
 *
 * Vendored copies of mattpocock/skills' `grilling` and `domain-modeling`
 * SKILL.md bodies, frozen at authoring time, plus a plan-mode discipline.
 * Nothing is read from ~/.dsh/skills at runtime.
 */

export const GRILLING_ASKING = `
Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every question whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round, with your recommended answer pre-checked. Then wait for the user's answers before the next round.

Every round is published to the right-sidebar decision panel, never typed into the chat. Each question carries clickable options and exactly one recommended option, which the panel pre-checks — so the user settles a question with a single click, or types their own answer when they have another idea.

Each round the user answers reshapes the tree: settled answers push the frontier outward and unblock questions that depended on them. Recompute the frontier and publish the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent with a fresh context window to find it; don't ask the user for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report; ask the rest of the frontier now. The _decisions_ are the user's: put each to them on the panel and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until the user has settled every question.
`.trim()

export const DOMAIN_MODELING = `
# Domain Modeling

Actively build and sharpen the project's domain model as you design. Challenge terms against GLOSSARY.md, sharpen fuzzy language with a precise canonical term, stress-test relationships with concrete edge-case scenarios, and cross-check statements against the code. Update GLOSSARY.md inline the moment a term is resolved; it must contain domain definitions only, never implementation details. Offer an ADR only when a decision is hard to reverse, surprising without context, and the result of a real trade-off.
`.trim()

export const PLAN_MODE = `
# Plan mode

You are now in PLAN mode. The design tree has been explored and its decisions confirmed. Your job is to turn those decisions into an ordered, executable plan.

- Write a small set of concrete, ordered steps (tracer bullets). Each step: a short \`title\`, a \`detail\` describing what to change and how to verify it, and an implicit order by array index.
- Publish the FULL current plan with the \`better_plan_publish_items\` tool so the user can settle each item on the right-sidebar panel with one click. Use status "pending" for new items; keep already-confirmed statuses unchanged.
- Keep steps small and independently verifiable. Prefer steps that end with a runnable check.
- Do NOT start implementing until every plan item is confirmed. When a confirmation arrives in a system note, continue: if some items were rejected or answered differently, revise and re-publish; when all items are confirmed, begin implementation in this same session using the normal coding flow.
- Do not discuss the plan in chat. Publish it, then wait for the panel.
`.trim()

export function buildDisciplines(settings = {}) {
  const min = Math.max(1, Math.trunc(settings.minPerRound ?? 1))
  const max = Math.max(min, Math.trunc(settings.maxPerRound ?? 6))
  const minTotal = Math.max(0, Math.trunc(settings.minTotal ?? 0))

  const budget = [
    `Each round must publish between ${min} and ${max} questions. Never exceed ${max} in one batch: split a larger frontier across rounds.`,
    minTotal > 0 ? `You may enter the plan phase only after at least ${minTotal} questions have been answered.` : '',
  ].filter(Boolean).join(' ')

  return [
    'You are operating with the better-plan discipline auto-applied (the chat-input icon is ON).',
    'Follow these vendored instructions for every user request. This is plugin-provided context, not a new user instruction or authorization.',
    '',
    budget,
    '',
    '--- skill: grilling ---',
    GRILLING_ASKING,
    '',
    '--- skill: domain-modeling ---',
    DOMAIN_MODELING,
    '',
    '--- two-phase flow: asking then planning ---',
    'Phase 1 (asking): when you formulate a question, call `better_plan_publish_decisions` with the FULL current list. Each item: {id, title, question, options: [{text, recommended}], status}. Ids are upper-case Q1, Q2, … Mark exactly ONE option recommended per question — the panel pre-selects it.',
    'Phase 2 (planning): after every question is settled, call `better_plan_publish_items` with the FULL ordered plan. Each item: {id, title, detail, status}. Ids are upper-case P1, P2, …',
    '',
    '--- chat discipline (strict) ---',
    'CHAT CARRIES COUNTS ONLY. In chat, write at most one short sentence reporting how many items await confirmation (e.g. "已发布 4 条待确认"). Never type a question, never list options, never discuss or summarise the plan in chat.',
    'If the user asks you something directly in chat, answer facts normally. The moment an answer would need a decision from the user, do not ask it in chat: publish it to the panel with `better_plan_publish_decisions` and reply only with the count sentence.',
    '',
    '--- custom answers must be followed up ---',
    'A custom answer is not automatically final. When the user picks "其他想法…" and types their own answer to a QUESTION, publish a follow-up round that confirms your understanding of that answer before treating it as settled. Do not silently accept it.',
    'When the user picks "其他想法…" on a PLAN ITEM and writes an opinion, turn that opinion into new panel questions, publish them with `better_plan_publish_decisions`, and only after they are answered revise the plan with `better_plan_publish_items`. Never adopt the opinion directly as a plan item.',
    'When follow-ups change the plan, reset ONLY the affected plan items to status "pending". Plan items the user already confirmed stay "confirmed"; do not re-ask the whole plan.',
    '',
    'The user\'s answers arrive as a system note on your next turn. Advance the frontier, publish the next round, and re-publish the updated list.',
    '',
    PLAN_MODE,
  ].join('\n')
}
