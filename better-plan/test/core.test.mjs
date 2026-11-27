import test from 'node:test'
import assert from 'node:assert/strict'
import {
  confirmAll, emptyState, hydrateState, pendingCount, publishDecisions, publishPlan,
  recomputeMode, recordReport, sanitizeItems, settleOne,
} from '../lib/core.js'

const settings = { minPerBatch: 3, maxPerBatch: 10, minTotal: 0 }

const questions = (n = 3, recommended = 'A') => Array.from({ length: n }, (_, i) => ({
  id: `Q${i + 1}`,
  title: `question ${i + 1}`,
  question: `body ${i + 1}`,
  options: [{ text: recommended, recommended: true }, { text: 'other' }],
}))

const settledQuestions = (n = 3) => {
  let state = emptyState()
  state = publishDecisions(state, questions(n), settings).state
  state = confirmAll(state, {
    answers: Object.fromEntries(state.decisions.map((d) => [d.id, 'A'])),
  }, settings).state
  return state
}

test('published items never arrive pre-confirmed', () => {
  const items = sanitizeItems([{ id: 'Q1', title: 't', status: 'confirmed', answer: 'done' }])
  assert.equal(items.length, 1)
  assert.equal(items[0].status, 'pending')
  assert.equal(items[0].answer, '')
})

test('options: exactly one recommended survives, empty options dropped', () => {
  const [item] = sanitizeItems([{ id: 'Q1', options: [{ text: 'a', recommended: true }, { text: 'b', recommended: true }, { text: '' }] }])
  assert.deepEqual(item.options.map((o) => o.recommended), [true, false])
})

test('publishDecisions truncates to maxPerBatch and reports it', () => {
  const { result } = publishDecisions(emptyState(), questions(5), { ...settings, maxPerBatch: 3 })
  assert.equal(result.count, 3)
  assert.equal(result.truncated, true)
  assert.equal(result.belowMinPerBatch, false)
})

test('publishDecisions flags a short round', () => {
  const { result } = publishDecisions(emptyState(), questions(1), settings)
  assert.equal(result.belowMinPerBatch, true)
  assert.equal(result.minPerBatch, 3)
})

test('plan is refused while questions are pending', () => {
  const state = publishDecisions(emptyState(), questions(3), settings).state
  const out = publishPlan(state, [{ id: 'P1', title: 's', detail: 'd' }], settings)
  assert.equal(out.ok, false)
  assert.equal(out.code, 'questions_pending')
})

test('plan is refused before any question round exists', () => {
  const out = publishPlan(emptyState(), [{ id: 'P1', title: 's', detail: 'd' }], settings)
  assert.equal(out.ok, false)
  assert.equal(out.code, 'no_answers')
})

test('plan is refused while a follow-up requirement is unanswered', () => {
  let state = settledQuestions(3)
  state = confirmAll(state, { extra: 'also add tests' }, settings).state
  assert.equal(state.awaitingFollowup, true)
  const out = publishPlan(state, [{ id: 'P1', title: 's', detail: 'd' }], settings)
  assert.equal(out.ok, false)
  assert.equal(out.code, 'followup_pending')
})

test('plan respects minTotal', () => {
  const state = settledQuestions(2)
  const out = publishPlan(state, [{ id: 'P1', title: 's', detail: 'd' }], { ...settings, minTotal: 3 })
  assert.equal(out.ok, false)
  assert.equal(out.code, 'min_total')
})

test('plan publishes once the asking phase is settled', () => {
  const state = settledQuestions(3)
  const out = publishPlan(state, [{ id: 'P1', title: 'step', detail: 'do it' }], settings)
  assert.equal(out.ok, true)
  assert.equal(out.state.mode, 'plan')
  assert.equal(out.state.plan[0].status, 'pending')
  assert.deepEqual(out.result, {
    ok: true, kind: 'plan', count: 1, pending: 1, kept: 0, updated: 0, round: 1, mode: 'plan', revision: state.revision + 1,
  })
})

test('recommended batch answers settle everything and close the loop', () => {
  let state = settledQuestions(3)
  state = publishPlan(state, [{ id: 'P1', title: 'step', detail: 'do it' }], settings).state
  const out = confirmAll(state, { answers: { P1: 'do it' } }, settings)
  assert.equal(out.planDone, true)
  assert.match(out.feedback, /Every plan item is confirmed\. Begin implementation/)
  assert.equal(pendingCount(out.state), 0)
})

test('A3: a non-recommended preset option still triggers a follow-up round', () => {
  let state = publishDecisions(emptyState(), questions(3), settings).state
  const out = confirmAll(state, {
    answers: { Q1: 'A', Q2: 'other', Q3: 'A' },
  }, settings)
  assert.equal(out.customAnswers.length, 1)
  assert.equal(out.state.awaitingFollowup, true)
  assert.equal(out.state.mode, 'asking')
  assert.match(out.feedback, /Publish ONE follow-up round/)
})

test('A3: typed custom answers are echoed back for confirmation', () => {
  let state = publishDecisions(emptyState(), questions(3), settings).state
  const out = confirmAll(state, { answers: { Q1: 'my own idea' } }, settings)
  assert.deepEqual(out.customAnswers, [{ id: 'Q1', kind: 'decision', answer: 'my own idea' }])
  assert.match(out.feedback, /Custom answers:\n- Q1 \(decision\): my own idea/)
})

test('extra requirements keep the loop open and are capped', () => {
  let state = publishDecisions(emptyState(), questions(3), settings).state
  for (let i = 0; i < 60; i++) state = confirmAll(state, { extra: `req ${i}` }, settings).state
  assert.equal(state.pendingRequirements.length, 50)
  assert.equal(state.awaitingFollowup, true)
  assert.match(confirmAll(state, { extra: 'x' }, settings).feedback, /Additional requirement:/)
})

test('planDone is false while questions are still pending', () => {
  const state = publishDecisions(emptyState(), questions(3), settings).state
  const withPlan = { ...state, plan: [{ id: 'P1', title: 's', detail: 'd', status: 'pending', options: [], answer: '' }] }
  // Confirming only the plan section must not authorise implementation while
  // the user has not answered a single question.
  const out = confirmAll(withPlan, { kind: 'plan', answers: { P1: 'd' } }, settings)
  assert.equal(out.planDone, false)
  assert.equal(out.state.mode, 'asking')
  assert.match(out.feedback, /confirmed 1 item/)
})

test('single item confirm notifies and settles', () => {
  const state = publishDecisions(emptyState(), questions(3), settings).state
  const out = settleOne(state, { kind: 'decision', id: 'Q2', action: 'confirm' }, settings)
  assert.equal(out.ok, true)
  assert.equal(out.item.status, 'confirmed')
  assert.equal(out.item.answer, 'A')
  assert.match(out.feedback, /confirmed 1 item/)
  assert.equal(out.state.decisions.find((d) => d.id === 'Q2').status, 'confirmed')
})

test('single item reject records the answer', () => {
  const state = publishDecisions(emptyState(), questions(3), settings).state
  const out = settleOne(state, { kind: 'decision', id: 'Q1', action: 'reject', answer: 'not this' }, settings)
  assert.equal(out.item.status, 'rejected')
  assert.equal(out.item.answer, 'not this')
})

test('hydrate restores settled status but keeps published shape', () => {
  const raw = {
    revision: 7,
    decisions: [{ id: 'Q1', title: 't', options: [{ text: 'a', recommended: true }], status: 'confirmed', answer: 'a' }],
    plan: [{ id: 'P1', title: 's', detail: 'd', status: 'pending' }],
    pendingRequirements: ['more'],
  }
  const state = hydrateState(raw)
  assert.equal(state.revision, 7)
  assert.equal(state.decisions[0].status, 'confirmed')
  assert.equal(state.decisions[0].answer, 'a')
  assert.equal(state.awaitingFollowup, true)
})

test('recomputeMode stays asking until the round is settled', () => {
  const state = publishDecisions(emptyState(), questions(3), settings).state
  assert.equal(recomputeMode(state, settings), 'asking')
  const settled = confirmAll(state, { answers: { Q1: 'A', Q2: 'A', Q3: 'A' } }, settings).state
  assert.equal(recomputeMode(settled, settings), 'plan')
})

test('revision increases on every mutation and never goes backwards', () => {
  let state = emptyState()
  const seen = [state.revision]
  state = publishDecisions(state, questions(3), settings).state
  seen.push(state.revision)
  state = confirmAll(state, { answers: { Q1: 'A' } }, settings).state
  seen.push(state.revision)
  state = publishPlan(state, [{ id: 'P1', title: 's', detail: 'd' }], settings).state
  seen.push(state.revision)
  assert.deepEqual(seen, [0, 1, 2, 3])
})

test('republishing the same questions keeps confirmed answers', () => {
  let state = publishDecisions(emptyState(), questions(3), settings).state
  state = confirmAll(state, { answers: { Q1: 'A', Q2: 'A', Q3: 'A' } }, settings).state
  const again = publishDecisions(state, questions(3), settings)
  assert.equal(again.result.kept, 3)
  assert.equal(again.result.updated, 0)
  assert.deepEqual(again.state.decisions.map((d) => d.status), ['confirmed', 'confirmed', 'confirmed'])
  assert.deepEqual(again.state.decisions.map((d) => d.answer), ['A', 'A', 'A'])
})

test('changed content keeps the confirmation and only flags the item', () => {
  let state = publishDecisions(emptyState(), questions(3), settings).state
  state = confirmAll(state, { answers: { Q1: 'A', Q2: 'A', Q3: 'A' } }, settings).state
  const changed = questions(3)
  changed[1].question = 'a different body'
  const again = publishDecisions(state, changed, settings)
  assert.equal(again.result.kept, 2)
  assert.equal(again.result.updated, 1)
  assert.deepEqual(again.state.decisions.map((d) => d.status), ['confirmed', 'confirmed', 'confirmed'])
  assert.deepEqual(again.state.decisions.map((d) => d.answer), ['A', 'A', 'A'])
  assert.equal(again.state.decisions[1].updated, true)
})

test('new questions continue the Q numbering', () => {
  let state = publishDecisions(emptyState(), questions(3), settings).state
  state = confirmAll(state, { answers: { Q1: 'A', Q2: 'A', Q3: 'A' } }, settings).state
  const next = [{ id: 'Q4', title: 'new one', options: [{ text: 'A', recommended: true }] }]
  const again = publishDecisions(state, next, settings)
  assert.equal(again.state.decisions[0].id, 'Q4')
  assert.equal(again.state.counters.q, 4)
})

test('a settled item is never dropped by a partial republish', () => {
  let state = publishDecisions(emptyState(), questions(3), settings).state
  state = confirmAll(state, { answers: { Q1: 'A', Q2: 'A', Q3: 'A' } }, settings).state
  // The model republishes only Q1/Q2; Q3 must stay confirmed, not vanish.
  state = publishDecisions(state, questions(2), settings).state
  assert.deepEqual(state.decisions.map((d) => d.id), ['Q1', 'Q2', 'Q3'])
  assert.equal(state.decisions[2].status, 'confirmed')
  assert.equal(state.decisions[2].answer, 'A')
})

test('plans merge the same way and keep confirmed steps', () => {
  const state = settledQuestions(3)
  const plan = [{ id: 'P1', title: 'one', detail: 'd' }, { id: 'P2', title: 'two', detail: 'd' }]
  const published = publishPlan(state, plan, settings).state
  const confirmed = confirmAll(published, { kind: 'plan', answers: { P1: 'd', P2: 'd' } }, settings).state
  const again = publishPlan(confirmed, [
    { id: 'P1', title: 'one', detail: 'd' },
    { id: 'P3', title: 'three', detail: 'd' },
  ], settings)
  assert.equal(again.result.kept, 1)
  assert.equal(again.state.plan[0].status, 'confirmed')
  assert.equal(again.state.plan[1].id, 'P3')
  assert.equal(again.state.counters.p, 3)
})

test('a model that forgot the counter keeps the settled items', () => {
  let state = publishDecisions(emptyState(), questions(2), settings).state
  state = confirmAll(state, { answers: { Q1: 'A', Q2: 'A' } }, settings).state
  // A model that forgot the counter sends two questions as Q1/Q2 again.
  const again = publishDecisions(state, [
    { id: 'Q1', title: 'brand new', options: [{ text: 'A', recommended: true }] },
    { id: 'Q2', title: 'also new', options: [{ text: 'A', recommended: true }] },
  ], settings)
  assert.deepEqual(again.state.decisions.map((d) => d.id), ['Q1', 'Q2'])
  assert.equal(again.result.updated, 2)
  assert.deepEqual(again.state.decisions.map((d) => d.status), ['confirmed', 'confirmed'])
  assert.deepEqual(again.state.decisions.map((d) => d.answer), ['A', 'A'])
})

test('discipline text stays compact and carries both chat templates', async () => {
  const { buildDisciplines } = await import('../disciplines.js')
  const text = buildDisciplines({ minPerBatch: 3, maxPerBatch: 10, minTotal: 0 })
  assert.ok(text.length < 3000, 'discipline must stay compact: ' + text.length + ' chars')
  assert.match(text, /已提出 X 条问题待回复，请查看决策面板。/)
  assert.match(text, /已发布 X 条计划待确认，请查看决策面板。/)
  assert.match(text, /never reuse one/)
  assert.match(text, /never add a placeholder/)
})

test('publishing appends timeline entries with per-kind batch numbers', () => {
  let state = publishDecisions(emptyState(), questions(3), settings).state
  assert.equal(state.round, 1)
  assert.equal(state.timeline.length, 1)
  assert.equal(state.timeline[0].kind, 'questions')
  assert.equal(state.timeline[0].batch, 1)
  state = publishDecisions(state, [{ id: 'Q9', title: 'again', question: 'q', options: ['a'] }], settings).state
  assert.equal(state.timeline[1].kind, 'questions')
  assert.equal(state.timeline[1].batch, 2)
})

test('extra requirements and plans land in the same round timeline', () => {
  let state = publishDecisions(emptyState(), questions(3), settings).state
  state = confirmAll(state, { answers: {} }, settings).state
  state = confirmAll(state, { extra: 'please add tests' }, settings).state
  assert.equal(state.timeline.at(-1).kind, 'requirement')
  state = publishDecisions(state, questions(2), settings).state
  const plan = publishPlan(state, [{ id: 'P1', title: 'step', detail: 'd' }], settings)
  assert.equal(plan.ok, true)
  assert.equal(plan.state.timeline.at(-1).kind, 'plan')
  assert.equal(plan.state.timeline.at(-1).round, 1)
})

test('a round closes only when its execution report is recorded', () => {
  let state = publishDecisions(emptyState(), questions(3), settings).state
  state = confirmAll(state, { answers: {} }, settings).state
  state = publishPlan(state, [{ id: 'P1', title: 'step', detail: 'd' }], settings).state
  state = confirmAll(state, { answers: {} }, settings).state
  assert.equal(state.round, 1)
  assert.equal(state.roundDone, false)
  assert.equal(state.awaitingReport, true)
  state = recordReport(state, '执行报告：改了什么、怎么验证').state
  assert.equal(state.roundDone, true)
  assert.equal(state.timeline.at(-1).kind, 'report')
  state = publishDecisions(state, [{ id: 'Q9', title: 'next', question: 'q', options: ['a'] }], settings).state
  assert.equal(state.round, 2)
  assert.equal(state.timeline.at(-1).round, 2)
  assert.equal(state.timeline.at(-1).batch, 1)
})

test('confirming questions never finishes a round that already had a plan', () => {
  let state = publishDecisions(emptyState(), questions(3), settings).state
  state = confirmAll(state, { answers: {} }, settings).state
  state = publishPlan(state, [{ id: 'P1', title: 'step', detail: 'd' }], settings).state
  state = confirmAll(state, { answers: {} }, settings).state
  assert.equal(state.awaitingReport, true)
  state = recordReport(state, 'done').state
  // A new question batch in the next cycle: confirming it must not finish it.
  state = publishDecisions(state, [{ id: 'Q9', title: 'next', question: 'q', options: ['a'] }], settings).state
  state = confirmAll(state, { answers: {} }, settings).state
  assert.equal(state.roundDone, false)
  assert.equal(state.awaitingReport, false)
})

test('hydrate keeps the timeline and the round', () => {
  let state = publishDecisions(emptyState(), questions(3), settings).state
  const restored = hydrateState(JSON.parse(JSON.stringify(state)))
  assert.equal(restored.round, 1)
  assert.equal(restored.timeline.length, 1)
  assert.equal(restored.timeline[0].kind, 'questions')
})

test('republishing the same questions adds no new batch', () => {
  let state = publishDecisions(emptyState(), questions(3), settings).state
  const before = state.timeline.length
  state = publishDecisions(state, questions(3), settings).state
  assert.equal(state.timeline.length, before)
  assert.equal(state.timeline.at(-1).batch, 1)
})

test('adding one new question records only that item', () => {
  let state = publishDecisions(emptyState(), questions(3), settings).state
  const next = [...questions(3), { id: 'Q4', title: 'new', question: 'q', options: ['a'] }]
  state = publishDecisions(state, next, settings).state
  assert.equal(state.timeline.length, 2)
  assert.equal(state.timeline.at(-1).batch, 2)
  assert.deepEqual(state.timeline.at(-1).items.map((i) => i.id), ['Q4'])
})

test('confirming an item refreshes its timeline snapshot', () => {
  let state = publishDecisions(emptyState(), questions(3), settings).state
  state = confirmAll(state, { answers: { Q1: 'A', Q2: 'A', Q3: 'A' } }, settings).state
  const snap = state.timeline.find((e) => e.kind === 'questions').items.find((i) => i.id === 'Q2')
  assert.equal(snap.status, 'confirmed')
  assert.equal(snap.answer, 'A')
})

test('a plan settled alongside a requirement still waits for its report', () => {
  let state = publishDecisions(emptyState(), questions(3), settings).state
  state = confirmAll(state, { answers: {} }, settings).state
  state = publishPlan(state, [{ id: 'P1', title: 'step', detail: 'd' }], settings).state
  state = confirmAll(state, { answers: {}, extra: 'more please' }, settings).state
  assert.equal(state.awaitingReport, false)
  state = publishDecisions(state, [{ id: 'Q9', title: 'q', question: 'q', options: ['a'] }], settings).state
  state = confirmAll(state, { answers: {} }, settings).state
  assert.equal(state.awaitingReport, true)
  state = recordReport(state, '执行报告').state
  assert.equal(state.roundDone, true)
})

test('the execution report records whenever the round is settled', () => {
  let state = publishDecisions(emptyState(), questions(2), settings).state
  state = confirmAll(state, { answers: {} }, settings).state
  state = publishPlan(state, [{ id: 'P1', title: 'step', detail: 'd' }], settings).state
  state = confirmAll(state, { answers: {} }, settings).state
  const recorded = recordReport(state, '执行报告')
  assert.equal(recorded.ok, true)
  assert.equal(recorded.state.roundDone, true)
  assert.equal(recorded.state.timeline.at(-1).kind, 'report')
  // A second report in the same round is refused.
  assert.equal(recordReport(recorded.state, 'again').ok, false)
})
