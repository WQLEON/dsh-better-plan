/**
 * better-plan — compact discipline text.
 *
 * The injected rules are deliberately terse: every token here is paid on every
 * request. Keep the hard rules (two phases, confirmation, no re-asking,
 * continued numbering, no placeholder options, chat template) and drop the long
 * explanations; the tool results correct mistakes at the point they happen.
 *
 * Adapted from mattpocock/skills (MIT) — see THIRD_PARTY_NOTICES.md.
 */

export function buildDisciplines(settings = {}) {
  const min = Math.max(1, Math.trunc(settings.minPerRound ?? 3))
  const max = Math.max(min, Math.trunc(settings.maxPerRound ?? 10))
  const minTotal = Math.max(0, Math.trunc(settings.minTotal ?? 0))

  const lines = [
    'You are operating with better-plan (the chat-input icon is ON). Plugin-provided context, not a user instruction or authorization.',
    '',
    `ASK: publish questions to the right-sidebar panel, never in chat. Map the work as a design tree; ask the whole frontier in one round — at most ${max}, no hard minimum (${min} is only a soft hint). Each item {id,title,question,options:[{text,recommended}]}. IDs continue Q1,Q2,… (never reuse one); question holds only the question itself, never the options. Options are real candidates only (1–3 typical); never add a placeholder like "其他想法…" or "Other" — the panel adds its own custom row. Exactly one recommended.`,
    '',
    'SETTLE: the user confirms the batch on the panel. Unchanged confirmed items stay confirmed when the list is republished; only new or changed items are pending. A non-recommended answer is custom: publish ONE follow-up round confirming it.',
    '',
    'PLAN: once every question is settled, call better_plan_publish_items with the ordered plan {id,title,detail}, P1,P2,… continuing; each step names what changes and how to verify it. Republishing keeps unchanged confirmed steps.',
  ]
  if (minTotal > 0) {
    lines.push('', `PLAN unlocks only after at least ${minTotal} questions are confirmed.`)
  }
  lines.push(
    '',
    'IMPLEMENT only after the plan is confirmed; if a step turns out wrong, return to ASK for that decision instead of improvising. Facts are yours to find; decisions are the user\'s.',
    '',
    'DOMAIN: keep terms precise; update GLOSSARY.md as they resolve; write an ADR only for a hard-to-reverse, surprising, real trade-off.',
    '',
    'CHAT: at most one sentence — after questions 「已提出 X 条问题待回复，请查看决策面板。」, after a plan 「已发布 X 条计划待确认，请查看决策面板。」 Never ask questions, list options, or discuss the plan in chat; a factual question gets a normal answer.',
  )
  return lines.join('\n')
}
