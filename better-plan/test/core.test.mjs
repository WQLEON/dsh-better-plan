import test from 'node:test'
import assert from 'node:assert/strict'
import {
  confirmAll, emptyState, hydrateState, pendingCount, publishDecisions, publishPlan,
  recomputeMode, sanitizeItems, settleOne,
} from '../lib/core.js'

const settings = { minPerRound: 3, maxPerRound: 10, minTotal: 0 }

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

test('publishDecisions truncates to maxPerRound and reports it', () => {
  const { result } = publishDecisions(emptyState(), questions(5), { ...settings, maxPerRound: 3 })
  assert.equal(result.count, 3)
  assert.equal(result.truncated, true)
  assert.equal(result.belowMinPerRound, false)
})

test('publishDecisions flags a short round', () => {
  const { result } = publishDecisions(emptyState(), questions(1), settings)
  assert.equal(result.belowMinPerRound, true)
  assert.equal(result.minPerRound, 3)
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
    ok: true, kind: 'plan', count: 1, pending: 1, kept: 0, reopened: 0, mode: 'plan', revision: state.revision + 1,
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
  assert.equal(again.result.reopened, 0)
  assert.deepEqual(again.state.decisions.map((d) => d.status), ['confirmed', 'confirmed', 'confirmed'])
  assert.deepEqual(again.state.decisions.map((d) => d.answer), ['A', 'A', 'A'])
})

test('changed content reopens only that item', () => {
  let state = publishDecisions(emptyState(), questions(3), settings).state
  state = confirmAll(state, { answers: { Q1: 'A', Q2: 'A', Q3: 'A' } }, settings).state
  const changed = questions(3)
  changed[1].question = 'a different body'
  const again = publishDecisions(state, changed, settings)
  assert.equal(again.result.kept, 2)
  assert.equal(again.result.reopened, 1)
  assert.deepEqual(again.state.decisions.map((d) => d.status), ['confirmed', 'pending', 'confirmed'])
  assert.equal(again.state.decisions[1].id, 'Q2')
})

test('new questions continue the Q numbering', () => {
  let state = publishDecisions(emptyState(), questions(3), settings).state
  state = confirmAll(state, { answers: { Q1: 'A', Q2: 'A', Q3: 'A' } }, settings).state
  const next = [{ id: 'Q4', title: 'new one', options: [{ text: 'A', recommended: true }] }]
  const again = publishDecisions(state, next, settings)
  assert.equal(again.state.decisions[0].id, 'Q4')
  assert.equal(again.state.counters.q, 4)
})

test('a removed number is never reused', () => {
  let state = publishDecisions(emptyState(), questions(3), settings).state
  state = confirmAll(state, { answers: { Q1: 'A', Q2: 'A', Q3: 'A' } }, settings).state
  // Q3 disappears from the list, then a new item claims Q3 again.
  state = publishDecisions(state, questions(2), settings).state
  const again = publishDecisions(state, [{ id: 'Q3', title: 'fresh' }], settings)
  assert.notEqual(again.state.decisions[0].id, 'Q3')
  assert.equal(again.state.decisions[0].id, 'Q4')
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

test('reusing an existing id with new content reopens that slot (R2)', () => {
  let state = publishDecisions(emptyState(), questions(2), settings).state
  state = confirmAll(state, { answers: { Q1: 'A', Q2: 'A' } }, settings).state
  // A model that forgot the counter sends two brand-new questions as Q1/Q2.
  const again = publishDecisions(state, [
    { id: 'Q1', title: 'brand new', options: [{ text: 'A', recommended: true }] },
    { id: 'Q2', title: 'also new', options: [{ text: 'A', recommended: true }] },
  ], settings)
  assert.deepEqual(again.state.decisions.map((d) => d.id), ['Q1', 'Q2'])
  assert.equal(again.result.reopened, 2)
  assert.deepEqual(again.state.decisions.map((d) => d.status), ['pending', 'pending'])
})
