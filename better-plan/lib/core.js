/**
 * better-plan — pure state machine.
 *
 * Everything here is a plain function over plain data so the plugin's
 * behaviour can be tested without a running Harness:
 *   - sanitising what a model publishes (never trusting its status/answer)
 *   - the asking -> plan phase machine and its gates
 *   - settling questions/plan items from the panel
 *
 * A3 (kept by request): an answer that differs from the recommended option —
 * including a *preset* non-recommended option — counts as a "custom answer"
 * and deliberately keeps the grilling loop open for one more round.
 */

export const MAX_ITEMS = 200
export const MAX_OPTIONS = 12
export const MAX_TEXT = 4000
export const MAX_OPTION_TEXT = 2000
export const MAX_EXTRA_ITEMS = 50
export const MAX_EXTRA_TEXT = 8000

const STATUS = new Set(['pending', 'confirmed', 'rejected'])

export function clampInt(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

function textOf(value, max = MAX_TEXT) {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

export function emptyState() {
  return {
    revision: 0,
    mode: 'asking',
    decisions: [],
    plan: [],
    extraRequirements: [],
    pendingRequirements: [],
    awaitingFollowup: false,
  }
}

export function cloneState(state) {
  const copy = JSON.parse(JSON.stringify(state))
  return { ...emptyState(), ...copy }
}

export function sanitizeOptions(raw) {
  if (!Array.isArray(raw)) return []
  const options = raw.slice(0, MAX_OPTIONS).map((opt) => {
    if (typeof opt === 'string') return { text: textOf(opt, MAX_OPTION_TEXT), recommended: false }
    const o = opt && typeof opt === 'object' ? opt : {}
    return {
      text: textOf(o.text, MAX_OPTION_TEXT),
      recommended: o.recommended === true,
    }
  }).filter((o) => o.text !== '')

  // Exactly one recommended option, so the panel can pre-check the batch.
  const recommended = options.filter((o) => o.recommended)
  if (recommended.length === 0 && options.length > 0) options[0].recommended = true
  if (recommended.length > 1) {
    for (const opt of recommended.slice(1)) opt.recommended = false
  }
  return options
}

export function sanitizeId(raw, fallback) {
  const text = typeof raw === 'string' ? raw.trim() : ''
  // Ids render as Q1 / P1: normalise any incoming casing to upper case.
  return (text || fallback).toUpperCase().slice(0, 40)
}

/**
 * Sanitise published items. The model is never trusted with lifecycle state:
 * `status` is always forced to `pending` and `answer` is dropped, so a model
 * cannot pre-confirm its own questions and skip the user's click.
 */
export function sanitizeItems(raw, { limit = MAX_ITEMS, prefix = 'Q' } = {}) {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, limit ?? MAX_ITEMS).map((item, i) => {
    const o = item && typeof item === 'object' ? item : {}
    const options = sanitizeOptions(o.options)
    const legacyRecommended = textOf(o.recommended)
    if (options.length === 0 && legacyRecommended) {
      options.push({ text: legacyRecommended, recommended: true })
    }
    return {
      id: sanitizeId(o.id, `${prefix}${i + 1}`),
      title: textOf(o.title),
      question: textOf(o.question),
      options,
      recommended: legacyRecommended || (options.find((opt) => opt.recommended)?.text ?? ''),
      detail: textOf(o.detail),
      answer: '',
      status: 'pending',
      updatedAt: Date.now(),
    }
  })
}

export function hydrateState(raw) {
  const state = emptyState()
  if (!raw || typeof raw !== 'object') return state
  state.decisions = sanitizeStored(raw.decisions, 'Q')
  state.plan = sanitizeStored(raw.plan, 'P')
  state.extraRequirements = (Array.isArray(raw.extraRequirements) ? raw.extraRequirements : [])
    .filter((x) => typeof x === 'string').slice(-MAX_EXTRA_ITEMS)
  state.pendingRequirements = (Array.isArray(raw.pendingRequirements) ? raw.pendingRequirements : [])
    .filter((x) => typeof x === 'string').slice(-MAX_EXTRA_ITEMS)
  state.awaitingFollowup = Array.isArray(raw.pendingRequirements) && raw.pendingRequirements.length > 0
  state.revision = Number.isSafeInteger(raw.revision) && raw.revision >= 0 ? raw.revision : 0
  return state
}

/** Stored items keep their settled status; only the shape is re-checked. */
function sanitizeStored(raw, prefix) {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, MAX_ITEMS).map((item, i) => {
    const o = item && typeof item === 'object' ? item : {}
    return {
      ...sanitizeItems([o], { limit: 1, prefix })[0],
      id: sanitizeId(o.id, `${prefix}${i + 1}`),
      status: STATUS.has(o.status) ? o.status : 'pending',
      answer: textOf(o.answer),
      updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : Date.now(),
    }
  })
}

export function settled(list) {
  return list.length > 0 && list.every((d) => d.status !== 'pending')
}
export function hasPending(list) {
  return list.some((d) => d.status === 'pending')
}
export function confirmedCount(list) {
  return list.filter((d) => d.status === 'confirmed').length
}
export function pendingCount(state) {
  return state.decisions.filter((d) => d.status === 'pending').length
    + state.plan.filter((d) => d.status === 'pending').length
}

export function defaultAnswerOf(item, kind) {
  if (kind === 'decision') {
    return item.options?.find((o) => o.recommended)?.text ?? item.recommended ?? ''
  }
  return item.detail || ''
}

export function recomputeMode(state, settings) {
  // An unanswered requirement reopens the asking phase, even with a full plan.
  if (state.awaitingFollowup) return 'asking'
  // Pending questions always mean we are still asking, whatever the plan says.
  if (hasPending(state.decisions)) return 'asking'
  const enough = confirmedCount(state.decisions) >= (settings?.minTotal ?? 0)
  if (state.plan.length > 0) return 'plan'
  return settled(state.decisions) && enough ? 'plan' : 'asking'
}

/* ------------------------------------------------------------------ publish */

export function publishDecisions(state, items, settings) {
  const next = cloneState(state)
  const requested = Array.isArray(items) ? items.length : 0
  const limit = settings?.maxPerRound ?? 10
  next.decisions = sanitizeItems(items, { limit, prefix: 'Q' })
  // Publishing a new round answers whatever requirement asked for it.
  next.pendingRequirements = []
  next.awaitingFollowup = false
  next.mode = recomputeMode(next, settings)
  next.revision = state.revision + 1
  return {
    state: next,
    result: {
      ok: true,
      kind: 'decision',
      count: next.decisions.length,
      truncated: requested > next.decisions.length,
      belowMinPerRound: next.decisions.length > 0 && next.decisions.length < (settings?.minPerRound ?? 3),
      minPerRound: settings?.minPerRound ?? 3,
      maxPerRound: limit,
      mode: next.mode,
      pending: pendingCount(next) > 0,
      revision: next.revision,
    },
  }
}

export const GATE_MESSAGES = {
  followup_pending: 'The user submitted requirements that are still unanswered: publish follow-up questions first.',
  questions_pending: 'Questions are still pending: the user must settle them on the panel before a plan is published.',
  no_answers: 'No settled question round exists yet: publish a question round and let the user settle it first.',
  min_total: 'Not enough questions have been confirmed yet: the configured minimum total must be reached before the plan phase.',
}

/**
 * Publishing a plan is gated on the asking phase actually being over. The model
 * cannot skip the questions, the user's confirmation, or a pending follow-up.
 */
export function publishPlan(state, items, settings) {
  const next = cloneState(state)
  if (next.awaitingFollowup) return { ok: false, code: 'followup_pending', mode: next.mode }
  if (hasPending(next.decisions)) return { ok: false, code: 'questions_pending', mode: next.mode }
  if (!settled(next.decisions)) return { ok: false, code: 'no_answers', mode: next.mode }
  if (confirmedCount(next.decisions) < (settings?.minTotal ?? 0)) return { ok: false, code: 'min_total', mode: next.mode }

  next.plan = sanitizeItems(items, { limit: MAX_ITEMS, prefix: 'P' })
  next.mode = 'plan'
  next.revision = state.revision + 1
  return {
    ok: true,
    state: next,
    result: {
      ok: true,
      kind: 'plan',
      count: next.plan.length,
      mode: next.mode,
      pending: pendingCount(next) > 0,
      revision: next.revision,
    },
  }
}

/* ------------------------------------------------------------------ settle */

function settleItem(item, kind, picked) {
  const chosen = typeof picked === 'string' && picked.trim()
    ? picked.slice(0, MAX_TEXT)
    : defaultAnswerOf(item, kind)
  return { ...item, status: 'confirmed', answer: chosen, updatedAt: Date.now() }
}

export function buildFeedback({ extra, customAnswers, planDone, count }) {
  if (extra) {
    return '[Plugin context from better-plan; the user submitted additional requirements on the right-sidebar panel — not a user instruction or authorization.]\n'
      + `Additional requirement:\n${extra}\n\n`
      + 'The user has NOT authorised implementation. Turn this requirement into follow-up questions, publish them with better_plan_publish_decisions, and revise the plan afterwards with better_plan_publish_items. Wait for another confirmation before implementing.'
  }
  if (customAnswers.length > 0) {
    const list = customAnswers.map((c) => `- ${c.id} (${c.kind}): ${c.answer}`).join('\n')
    return '[Plugin context from better-plan; the user typed custom answers on the right-sidebar panel — not a user instruction or authorization.]\n'
      + `Custom answers:\n${list}\n\n`
      + 'These are NOT automatically final. Publish ONE follow-up round with better_plan_publish_decisions confirming your understanding of each custom answer (and, if a plan item changed, reset only the affected plan items to pending). Wait for another confirmation before implementing.'
  }
  if (planDone) {
    return '[Plugin context from better-plan; the user confirmed the plan on the right-sidebar panel — not a user instruction or authorization.]\n'
      + 'Every plan item is confirmed. Begin implementation in this session using the normal coding flow.'
  }
  return `[Plugin context from better-plan; the user confirmed ${count} item(s) on the right-sidebar panel — not a user instruction or authorization.]\n`
    + 'Continue: if questions remain, publish the next round with better_plan_publish_decisions; once every question is settled, publish the ordered plan with better_plan_publish_items. Put everything on the panel, never in chat.'
}

export function confirmAll(state, input, settings) {
  const kind = input?.kind === 'plan' ? 'plan' : input?.kind === 'decision' ? 'decision' : 'all'
  const answers = input?.answers && typeof input.answers === 'object' ? input.answers : {}
  const extra = textOf(input?.extra, MAX_EXTRA_TEXT).trim()

  const next = cloneState(state)
  let count = 0
  const customAnswers = []

  const settleList = (list, listKind) => list.map((item) => {
    if (item.status !== 'pending') return item
    count += 1
    const picked = answers[item.id]
    if (typeof picked === 'string' && picked.trim()) {
      const recommended = defaultAnswerOf(item, listKind)
      // A3 by request: any non-recommended answer — preset option or typed
      // text — counts as custom and keeps the grilling loop open.
      if (picked.trim() !== recommended.trim()) {
        customAnswers.push({ id: item.id, kind: listKind, answer: picked.trim() })
      }
    }
    return settleItem(item, listKind, typeof picked === 'string' ? picked : '')
  })

  if (kind === 'all' || kind === 'decision') next.decisions = settleList(next.decisions, 'decision')
  if (kind === 'all' || kind === 'plan') next.plan = settleList(next.plan, 'plan')

  if (extra) {
    next.extraRequirements = [...next.extraRequirements, extra].slice(-MAX_EXTRA_ITEMS)
    next.pendingRequirements = [...next.pendingRequirements, extra].slice(-MAX_EXTRA_ITEMS)
    next.awaitingFollowup = true
  }
  if (customAnswers.length > 0) next.awaitingFollowup = true

  next.mode = recomputeMode(next, settings)
  const planDone = settled(next.plan)
    && !hasPending(next.decisions)
    && !extra
    && customAnswers.length === 0
  const feedback = buildFeedback({ extra, customAnswers, planDone, count })
  next.revision = state.revision + 1
  return { state: next, count, customAnswers, planDone, feedback, mode: next.mode }
}

/** Single-item settle (kept for completeness; the panel uses the batch path). */
export function settleOne(state, input, settings) {
  const kind = input?.kind === 'plan' ? 'plan' : input?.kind === 'decision' ? 'decision' : ''
  if (!kind) return { ok: false, code: 'bad_kind' }
  const action = input?.action === 'reject' ? 'reject' : input?.action === 'confirm' ? 'confirm' : ''
  if (!action) return { ok: false, code: 'bad_action' }

  const next = cloneState(state)
  const list = kind === 'decision' ? next.decisions : next.plan
  const index = list.findIndex((d) => d.id === input?.id)
  if (index < 0) return { ok: false, code: 'not_found' }

  const item = list[index]
  const answer = textOf(input?.answer)
  list[index] = action === 'confirm'
    ? settleItem(item, kind, answer)
    : { ...item, status: 'rejected', answer, updatedAt: Date.now() }

  next.mode = recomputeMode(next, settings)
  next.revision = state.revision + 1
  const allDone = !hasPending(next.decisions) && !hasPending(next.plan) && next.plan.length > 0 && settled(next.plan)
  const feedback = buildFeedback({ extra: '', customAnswers: [], planDone: allDone, count: 1 })
  return { ok: true, state: next, item: list[index], feedback, mode: next.mode }
}

/** Trim the legacy shared snapshot into a session state (used by migration). */
export function importLegacy(raw) {
  return hydrateState(raw)
}
