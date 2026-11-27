/**
 * better-plan — pure state machine.
 *
 * Everything here is a plain function over plain data so the plugin's
 * behaviour can be tested without a running Harness:
 *   - sanitising what a model publishes (never trusting its status/answer)
 *   - merging a republished list into the settled one: an item whose id and
 *     content are unchanged keeps its confirmed/rejected status, so the user is
 *     never asked to confirm the same thing twice
 *   - continuing the Q/P numbering across rounds, never reusing a number
 *   - the asking -> plan phase machine and its gates
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
    // Highest number ever handed out for each prefix; numbers are never reused.
    counters: { q: 0, p: 0 },
    // Round = one cycle that ends when its last plan is executed. Entries are
    // appended in publishing order so the panel can replay the whole round.
    round: 1,
    roundDone: false,
    awaitingReport: false,
    timeline: [],
  }
}

export function cloneState(state) {
  const copy = JSON.parse(JSON.stringify(state))
  return { ...emptyState(), ...copy, counters: { ...emptyState().counters, ...(copy.counters ?? {}) } }
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
  return (text || fallback).toUpperCase().slice(0, 40)
}

function shapeOf(raw) {
  const o = raw && typeof raw === 'object' ? raw : {}
  const options = sanitizeOptions(o.options)
  const legacyRecommended = textOf(o.recommended)
  if (options.length === 0 && legacyRecommended) {
    options.push({ text: legacyRecommended, recommended: true })
  }
  return {
    title: textOf(o.title),
    question: textOf(o.question),
    options,
    recommended: legacyRecommended || (options.find((opt) => opt.recommended)?.text ?? ''),
    detail: textOf(o.detail),
  }
}

/** Content fingerprint: if it changes, a previously confirmed item is reopened. */
export function signatureOf(item) {
  return JSON.stringify([
    item?.title ?? '',
    item?.question ?? '',
    item?.detail ?? '',
    Array.isArray(item?.options) ? item.options.map((o) => [o.text, o.recommended === true]) : [],
  ])
}

/** The next per-kind batch number inside the current round. */
function nextBatch(state, kind) {
  return state.timeline.filter((e) => e.round === state.round && e.kind === kind).length + 1
}

/** Snapshot one published batch into the timeline. */
function appendEntry(state, kind, items, extra = {}) {
  const entry = {
    kind,
    at: Date.now(),
    round: state.round,
    batch: nextBatch(state, kind),
    items: (Array.isArray(items) ? items : []).map((item) => ({ ...item })),
    ...extra,
  }
  state.timeline = [...state.timeline, entry]
  return entry
}

/** A finished round starts the next one when new content arrives. */
function startNextRoundIfDone(state) {
  if (state.roundDone) {
    state.round += 1
    state.roundDone = false
  }
}

function pendingItem(id, shape) {
  return { id, ...shape, answer: '', status: 'pending', updatedAt: Date.now() }
}

/**
 * Legacy/simple sanitiser: forces every item to `pending` and numbers it from
 * 1. Publishing goes through `mergeItems` instead; this stays for stored shape
 * repair and for callers that explicitly want a fresh pending list.
 */
export function sanitizeItems(raw, { limit = MAX_ITEMS, prefix = 'Q' } = {}) {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, limit ?? MAX_ITEMS).map((item, i) => pendingItem(`${prefix}${i + 1}`, shapeOf(item)))
}

function numberFromId(id, prefix) {
  if (typeof id !== 'string') return null
  const match = new RegExp(`^${prefix}(\\d+)$`, 'i').exec(id.trim())
  if (!match) return null
  const n = Number(match[1])
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

function highestNumber(list, prefix) {
  let max = 0
  for (const item of list ?? []) {
    const n = numberFromId(item?.id, prefix)
    if (n !== null && n > max) max = n
  }
  return max
}

/**
 * Merge a republished list into the settled one.
 *
 * The user's confirmation is never taken back by a republish:
 * - same content (same id or another id) -> the stored item wins: its status
 *   and answer stay, only the text is refreshed and `updated` is flagged;
 * - an already confirmed item whose wording changed -> same: keep status and
 *   answer, refresh the text, flag `updated`;
 * - a genuinely new item -> pending, numbered from the running counter.
 *
 * Returns the merged list plus counters/accounting for the caller.
 */
export function mergeItems(rawList, { existing = [], counter = 0, limit = MAX_ITEMS, prefix = 'Q' } = {}) {
  const list = Array.isArray(rawList) ? rawList.slice(0, limit ?? MAX_ITEMS) : []
  const byId = new Map((existing ?? []).map((item) => [item.id, item]))
  const bySignature = new Map()
  for (const item of existing ?? []) {
    const key = signatureOf(item)
    if (!bySignature.has(key)) bySignature.set(key, item)
  }
  const base = Math.max(counter, highestNumber(existing, prefix))
  let next = base
  const used = new Set()
  const items = []
  let kept = 0
  let updated = 0

  const takeId = () => {
    do { next += 1 } while (used.has(`${prefix}${next}`) || byId.has(`${prefix}${next}`))
    const id = `${prefix}${next}`
    used.add(id)
    return id
  }

  for (const raw of list) {
    const shape = shapeOf(raw)
    const signature = signatureOf(shape)
    const wanted = numberFromId(raw?.id, prefix)
    const candidate = wanted !== null ? `${prefix}${wanted}` : null
    const byStoredId = candidate && !used.has(candidate) ? byId.get(candidate) : null
    // A republish under a new id but with identical content is the same item.
    const byContent = !byStoredId ? bySignature.get(signature) ?? null : null

    if (byStoredId || byContent) {
      const stored = byStoredId ?? byContent
      if (used.has(stored.id)) continue
      used.add(stored.id)
      const changed = signatureOf(stored) !== signature
      items.push({
        ...stored,
        ...shape,
        id: stored.id,
        status: stored.status,
        answer: stored.answer,
        updatedAt: unchangedAt(stored, changed),
        ...(changed ? { updated: true } : { updated: stored.updated === true }),
      })
      if (changed) updated += 1
      else kept += 1
      continue
    }

    const id = candidate && !used.has(candidate) && !byId.has(candidate) && wanted > base ? candidate : takeId()
    used.add(id)
    if (candidate && id === candidate && wanted !== null) next = Math.max(next, wanted)
    items.push(pendingItem(id, shape))
  }

  return {
    items,
    counter: Math.max(next, highestNumber(items, prefix)),
    kept,
    updated,
    dropped: Math.max(0, (Array.isArray(rawList) ? rawList.length : 0) - items.length),
  }
}

function unchangedAt(stored, changed) {
  return changed ? Date.now() : stored.updatedAt
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
  state.round = clampInt(raw.round, 1, 1e6, 1)
  state.roundDone = raw.roundDone === true
  state.awaitingReport = raw.awaitingReport === true
  state.timeline = sanitizeTimeline(raw.timeline)
  repairRounds(state)
  state.counters = {
    q: Math.max(clampInt(raw?.counters?.q, 0, 1e9, 0), highestNumber(state.decisions, 'Q')),
    p: Math.max(clampInt(raw?.counters?.p, 0, 1e9, 0), highestNumber(state.plan, 'P')),
  }
  return state
}

const ENTRY_KINDS = new Set(['questions', 'plan', 'requirement', 'report', 'discard', 'message'])

/**
 * Regroup the timeline so a round holds its questions, plans and requirements,
 * and only an execution report closes it. Older data that was split into
 * several rounds (or that has no rounds at all) is repaired here.
 */
function repairRounds(state) {
  if (!Array.isArray(state.timeline) || state.timeline.length === 0) {
    state.round = 1
    return
  }
  const buckets = [{ entries: [] }]
  for (const entry of state.timeline) {
    const current = buckets[buckets.length - 1]
    const closed = current.entries.some((e) => e.kind === 'report' || e.kind === 'discard')
    if (entry.kind === 'questions' && closed) buckets.push({ entries: [] })
    buckets[buckets.length - 1].entries.push({ ...entry })
  }
  const timeline = []
  buckets.forEach((bucket, index) => {
    const per = new Map()
    const seen = new Set()
    for (const entry of bucket.entries) {
      const items = (entry.items ?? []).filter((item) => {
        if (!item?.id) return true
        const key = entry.kind + ':' + item.id
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      if (items.length === 0 && entry.kind !== 'requirement' && entry.kind !== 'report') continue
      const batch = (per.get(entry.kind) ?? 0) + 1
      per.set(entry.kind, batch)
      timeline.push({ ...entry, round: index + 1, batch, items })
    }
  })
  state.timeline = timeline
  state.round = Math.max(1, buckets.length)
  state.roundDone = buckets[buckets.length - 1].entries.some((e) => e.kind === 'report')
}

/** Stored timeline entries: shape checked, unknown kinds dropped. */
function sanitizeTimeline(raw) {
  if (!Array.isArray(raw)) return []
  return raw.slice(-200).map((entry, i) => {
    const o = entry && typeof entry === 'object' ? entry : {}
    const kind = ENTRY_KINDS.has(o.kind) ? o.kind : 'questions'
    return {
      kind,
      at: Number.isFinite(o.at) ? o.at : Date.now(),
      round: clampInt(o.round, 1, 1e6, 1),
      batch: clampInt(o.batch, 1, 1e6, i + 1),
      items: sanitizeStored(o.items, kind === 'plan' ? 'P' : 'Q'),
      ...(typeof o.text === 'string' ? { text: textOf(o.text, MAX_EXTRA_TEXT) } : {}),
    }
  })
}

/** Stored items keep their settled status; only the shape is re-checked. */
function sanitizeStored(raw, prefix) {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, MAX_ITEMS).map((item, i) => {
    const o = item && typeof item === 'object' ? item : {}
    return {
      ...pendingItem(sanitizeId(o.id, `${prefix}${i + 1}`), shapeOf(o)),
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

export function publishDecisions(state, items, settings, options = {}) {
  const next = cloneState(state)
  const limit = settings?.maxPerBatch ?? settings?.maxPerRound ?? 10
  const merged = mergeItems(items, {
    existing: next.decisions,
    counter: next.counters.q,
    limit,
    prefix: 'Q',
  })
  const incomingQuestions = new Set(merged.items.map((item) => item.id))
  next.decisions = [...merged.items, ...state.decisions.filter((item) => !incomingQuestions.has(item.id))]
  next.counters = { ...next.counters, q: merged.counter }
  // Publishing a new round answers whatever requirement asked for it.
  next.pendingRequirements = []
  next.awaitingFollowup = false
  // Republishing the same questions must not create a new batch: only items the
  // session has not seen yet are recorded.
  const knownQuestions = new Set(state.decisions.map((item) => item.id))
  const freshQuestions = merged.items.filter((item) => !knownQuestions.has(item.id))
  if (freshQuestions.length > 0) {
    startNextRoundIfDone(next)
    const firstBatch = !next.timeline.some((entry) => entry.round === next.round && entry.kind === 'questions')
    if (firstBatch && options?.userMessage) {
      appendEntry(next, 'message', [], { text: textOf(options.userMessage, 2000) })
    }
    appendEntry(next, 'questions', freshQuestions)
  }
  next.mode = recomputeMode(next, settings)
  next.revision = state.revision + 1
  const pending = merged.items.filter((d) => d.status === 'pending').length
  return {
    state: next,
    result: {
      ok: true,
      kind: 'decision',
      count: merged.items.length,
      pending,
      kept: merged.kept,
      updated: merged.updated,
      truncated: merged.dropped > 0,
      belowMinPerBatch: pending > 0 && pending < (settings?.minPerBatch ?? 3),
      minPerBatch: settings?.minPerBatch ?? 3,
      maxPerBatch: limit,
      round: next.round,
      mode: next.mode,
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
 * A republished plan keeps the items the user already confirmed.
 */
export function publishPlan(state, items, settings) {
  const next = cloneState(state)
  if (next.awaitingFollowup) return { ok: false, code: 'followup_pending', mode: next.mode }
  if (hasPending(next.decisions)) return { ok: false, code: 'questions_pending', mode: next.mode }
  if (!settled(next.decisions)) return { ok: false, code: 'no_answers', mode: next.mode }
  if (confirmedCount(next.decisions) < (settings?.minTotal ?? 0)) return { ok: false, code: 'min_total', mode: next.mode }

  const merged = mergeItems(items, {
    existing: next.plan,
    counter: next.counters.p,
    limit: MAX_ITEMS,
    prefix: 'P',
  })
  const incomingPlan = new Set(merged.items.map((item) => item.id))
  next.plan = [...merged.items, ...state.plan.filter((item) => !incomingPlan.has(item.id))]
  next.counters = { ...next.counters, p: merged.counter }
  next.mode = 'plan'
  const knownPlan = new Set(state.plan.map((item) => item.id))
  const freshPlan = merged.items.filter((item) => !knownPlan.has(item.id))
  if (freshPlan.length > 0) {
    startNextRoundIfDone(next)
    appendEntry(next, 'plan', freshPlan)
  }
  next.revision = state.revision + 1
  return {
    ok: true,
    state: next,
    result: {
      ok: true,
      kind: 'plan',
      count: merged.items.length,
      pending: merged.items.filter((d) => d.status === 'pending').length,
      kept: merged.kept,
      updated: merged.updated,
      round: next.round,
      mode: next.mode,
      revision: next.revision,
    },
  }
}

/* ------------------------------------------------------------------ settle */

function settleItem(item, kind, picked, explicit = false) {
  const value = typeof picked === 'string' ? picked.slice(0, MAX_TEXT) : ''
  // An explicit answer may be empty: the user chose "other" and left it blank,
  // which means neither a choice nor a rejection — keep it confirmed and empty.
  const chosen = explicit ? value : (value.trim() ? value : defaultAnswerOf(item, kind))
  return { ...item, status: 'confirmed', answer: chosen, updatedAt: Date.now() }
}

export function buildFeedback({ extra, customAnswers, planDone, count }) {
  if (extra) {
    return `[bp] requirement (not authorization): ${extra}\nAsk follow-ups on the panel, then revise the plan; wait.`
  }
  if (customAnswers.length > 0) {
    const list = customAnswers.map((c) => `- ${c.id} (${c.kind}): ${c.answer}`).join('\n')
    return `[bp] custom answers (not final):\n${list}\nAsk ONE follow-up round; wait.`
  }
  if (planDone) return '[bp] plan confirmed. Implement, then report.'
  return `[bp] the user confirmed ${count} item(s). Continue on the panel.`
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
    const hasAnswer = Object.prototype.hasOwnProperty.call(answers, item.id)
    const picked = answers[item.id]
    if (hasAnswer && typeof picked === 'string' && picked.trim()) {
      const recommended = defaultAnswerOf(item, listKind)
      // A3 by request: any non-recommended answer — preset option or typed
      // text — counts as custom and keeps the grilling loop open.
      if (picked.trim() !== recommended.trim()) {
        customAnswers.push({ id: item.id, kind: listKind, answer: picked.trim() })
      }
    }
    return settleItem(item, listKind, typeof picked === 'string' ? picked : '', hasAnswer)
  })

  const hadPendingPlan = next.plan.some((item) => item.status === 'pending')
  if (kind === 'all' || kind === 'decision') next.decisions = settleList(next.decisions, 'decision')
  if (kind === 'all' || kind === 'plan') next.plan = settleList(next.plan, 'plan')

  if (extra) {
    if (next.roundDone) {
      next.round += 1
      next.roundDone = false
      next.awaitingReport = false
      next.decisions = []
      next.plan = []
    }
    next.extraRequirements = [...next.extraRequirements, extra].slice(-MAX_EXTRA_ITEMS)
    next.pendingRequirements = [...next.pendingRequirements, extra].slice(-MAX_EXTRA_ITEMS)
    next.awaitingFollowup = true
    appendEntry(next, 'requirement', [], { text: extra })
  }
  if (customAnswers.length > 0) next.awaitingFollowup = true

  next.mode = recomputeMode(next, settings)
  // Only a confirmation that settled plan items can finish a round. Confirming
  // the questions of a cycle that already had a confirmed plan must not.
  const planDone = hadPendingPlan
    && settled(next.plan)
    && !hasPending(next.decisions)
    && !extra
    && customAnswers.length === 0
  const feedback = buildFeedback({ extra, customAnswers, planDone, count })
  const roundHasPlan = next.timeline.some((entry) => entry.round === next.round && entry.kind === 'plan')
  const everythingSettled = settled(next.plan)
    && !hasPending(next.decisions)
    && !next.awaitingFollowup
    && customAnswers.length === 0
  if ((planDone || (roundHasPlan && everythingSettled)) && !next.roundDone) next.awaitingReport = true
  next.timeline = syncSnapshots(next.timeline, 'questions', next.decisions)
  next.timeline = syncSnapshots(next.timeline, 'plan', next.plan)
  next.revision = state.revision + 1
  return { state: next, count, customAnswers, planDone, feedback, mode: next.mode, round: next.round }
}

/**
 * The execution report closes a round: the agent finished implementing a
 * confirmed plan and told the user what it did.
 */
export function recordReport(state, text) {
  const next = cloneState(state)
  if (next.roundDone) return { ok: false }
  if (!next.timeline.some((entry) => entry.round === next.round && entry.kind === 'plan')) return { ok: false }
  if (next.plan.length === 0 || next.plan.some((item) => item.status === 'pending')) return { ok: false }
  if (next.decisions.some((item) => item.status === 'pending')) return { ok: false }
  if (next.awaitingFollowup) return { ok: false }
  next.awaitingReport = false
  next.roundDone = true
  appendEntry(next, 'report', [], { text: textOf(text, 4000) })
  next.revision = state.revision + 1
  return { ok: true, state: next, round: next.round }
}

/**
 * Discard the working set of the current round: the entries stay in the
 * timeline as history, the round advances and the new one starts empty.
 */
export function discardRound(state) {
  const next = cloneState(state)
  appendEntry(next, 'discard', [], { text: '' })
  next.round += 1
  next.roundDone = false
  next.awaitingReport = false
  next.awaitingFollowup = false
  next.decisions = []
  next.plan = []
  next.pendingRequirements = []
  next.mode = 'asking'
  next.revision = state.revision + 1
  return { state: next, round: next.round }
}

/** Copy settled items back into the timeline snapshots of the same kind. */
function syncSnapshots(timeline, kind, list) {
  if (!Array.isArray(timeline) || timeline.length === 0) return timeline
  const byId = new Map(list.map((item) => [item.id, item]))
  return timeline.map((entry) => {
    if (entry.kind !== kind) return entry
    return { ...entry, items: (entry.items ?? []).map((snap) => byId.get(snap.id) ?? snap) }
  })
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
  next.timeline = syncSnapshots(next.timeline, kind === 'decision' ? 'questions' : 'plan', list)
  next.revision = state.revision + 1
  const allDone = !hasPending(next.decisions) && !hasPending(next.plan) && next.plan.length > 0 && settled(next.plan)
  if (allDone) next.roundDone = true
  const feedback = buildFeedback({ extra: '', customAnswers: [], planDone: allDone, count: 1 })
  return { ok: true, state: next, item: list[index], feedback, mode: next.mode }
}
