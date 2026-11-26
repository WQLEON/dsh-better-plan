/**
 * better-plan — Host side.
 *
 * Two-phase flow, settled from the right-sidebar panel:
 *   1. asking: the agent publishes questions, each with clickable options.
 *      Every recommended option is pre-selected, and ONE top-level button
 *      settles the whole batch in a single click.
 *   2. plan: once every question is settled, the agent publishes an ordered
 *      plan. It uses the same single-button batch confirmation.
 *
 * The vendored discipline is injected as a per-agent systemPrompt section.
 * The chat-input icon toggles the feature on/off; right-click opens the panel.
 */

import { randomUUID } from 'node:crypto'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import z from '@deepseek-ai/schemastery'
import { buildDisciplines } from './disciplines.js'

function clampInt(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

/* Questions and plan survive a plugin reload: they live in a small JSON file
   next to the other DSH user data, written atomically on every change. */
function snapshotPath() {
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, 'better-plan-state.json')
}

function loadSnapshot() {
  try {
    const raw = JSON.parse(readFileSync(snapshotPath(), 'utf8'))
    return {
      mode: raw?.mode === 'plan' ? 'plan' : 'asking',
      decisions: sanitize(raw?.decisions, undefined, 'Q'),
      plan: sanitize(raw?.plan, undefined, 'P'),
      revision: Number.isSafeInteger(raw?.revision) ? raw.revision : 0,
      extraRequirements: Array.isArray(raw?.extraRequirements)
        ? raw.extraRequirements.filter((x) => typeof x === 'string').slice(0, 50)
        : [],
      pendingRequirements: Array.isArray(raw?.pendingRequirements)
        ? raw.pendingRequirements.filter((x) => typeof x === 'string').slice(0, 50)
        : [],
    }
  } catch {
    return { mode: 'asking', decisions: [], plan: [], revision: 0, extraRequirements: [], pendingRequirements: [] }
  }
}

function saveSnapshot(state) {
  try {
    const file = snapshotPath()
    const temp = `${file}.tmp`
    writeFileSync(temp, JSON.stringify(state), 'utf8')
    renameSync(temp, file)
    return true
  } catch {
    return false
  }
}


export const Config = z.object({
  defaultEnabled: z.boolean().default(true),
  minPerRound: z.natural().min(1).max(200).default(3),
  maxPerRound: z.natural().min(1).max(200).default(10),
  minTotal: z.natural().min(0).max(200).default(0),
  autoOpen: z.boolean().default(true),
})

export const inject = ['webServer', 'tools', 'systemPrompt', 'agents']

/* The host's own message factory is not importable from a bundle, so build the
   same frozen, identified user message it would produce. */
function createUserMessage(input) {
  const message = {
    ...input,
    role: 'user',
    id: randomUUID(),
  }
  return deepFreeze(structuredClone(message))
}
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value)
    for (const item of Object.values(value)) deepFreeze(item)
  }
  return value
}

const SECTION_NAME = 'better-plan:discipline'
const SECTION_ORDER = 3290
const FEEDBACK_SECTION = 'better-plan:feedback'
const FEEDBACK_ORDER = 3291
const R = {
  toggle: '/plugins/better-plan/toggle',
  state: '/plugins/better-plan/state',
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}
function isLoopback(req) {
  const host = String(req.headers?.host || '').split(':')[0].toLowerCase().replace(/^\[|\]$/g, '')
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}
async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const STATUS = new Set(['pending', 'confirmed', 'rejected'])
const MAX = 200
const MAX_OPTIONS = 12

function sanitizeOptions(raw) {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, MAX_OPTIONS).map((opt) => {
    if (typeof opt === 'string') return { text: opt.slice(0, 2000), recommended: false }
    const o = opt && typeof opt === 'object' ? opt : {}
    return {
      text: typeof o.text === 'string' ? o.text.slice(0, 2000) : '',
      recommended: o.recommended === true,
    }
  }).filter((o) => o.text !== '')
}

function sanitizeId(raw, fallback) {
  const text = typeof raw === 'string' ? raw.trim() : ''
  // Ids render as Q1 / P1: normalise any incoming casing to upper case.
  return (text || fallback).toUpperCase().slice(0, 40)
}

function sanitize(list, limit, prefix = 'Q') {
  if (!Array.isArray(list)) return []
  return list.slice(0, limit ?? MAX).map((raw, i) => {
    const o = raw && typeof raw === 'object' ? raw : {}
    const s = (v) => (typeof v === 'string' ? v.slice(0, 4000) : '')
    const options = sanitizeOptions(o.options)
    const legacyRecommended = s(o.recommended)
    if (options.length === 0 && legacyRecommended) {
      options.push({ text: legacyRecommended, recommended: true })
    } else if (options.length > 0 && !options.some((opt) => opt.recommended)) {
      options[0].recommended = true
    }
    const fallback = options.find((opt) => opt.recommended)?.text ?? ''
    return {
      id: sanitizeId(o.id, `${prefix}${i + 1}`),
      title: s(o.title),
      question: s(o.question),
      options,
      recommended: legacyRecommended || fallback,
      detail: s(o.detail),
      answer: s(o.answer),
      status: STATUS.has(o.status) ? o.status : 'pending',
      updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : Date.now(),
    }
  })
}

function settled(list) {
  return list.length > 0 && list.every((d) => d.status !== 'pending')
}
function hasPending(list) {
  return list.some((d) => d.status === 'pending')
}
function confirmedCount(list) {
  return list.filter((d) => d.status === 'confirmed').length
}
function defaultAnswerOf(item, kind) {
  if (kind === 'decision') {
    const fromOptions = item.options?.find((o) => o.recommended)?.text
    return fromOptions ?? item.recommended ?? ''
  }
  return item.detail || ''
}

export function apply(ctx, config) {
  let settings = {
    defaultEnabled: config?.defaultEnabled !== false,
    minPerRound: Math.max(3, clampInt(config?.minPerRound, 1, 200, 3)),
    maxPerRound: clampInt(config?.maxPerRound, 1, 200, 10),
    minTotal: clampInt(config?.minTotal, 0, 200, 0),
    autoOpen: config?.autoOpen !== false,
  }
  // The discipline starts from the configured default; the icon changes the
  // live value without rewriting the default.
  let enabled = settings.defaultEnabled

  const disciplines = buildDisciplines(settings)
  const persisted = loadSnapshot()
  let decisions = persisted.decisions
  let plan = persisted.plan
  let feedback = ''
  // Requirements the user typed instead of picking options. Only entries still
  // awaiting an answer block the loop; answered ones stay as history.
  let extraRequirements = persisted.extraRequirements ?? []
  let pendingRequirements = persisted.pendingRequirements ?? []
  let awaitingFollowup = pendingRequirements.length > 0
  // Derived, never restored: pending questions always mean we are asking.
  let mode = 'asking'
  let revision = persisted.revision
  if (decisions.length > 0 || plan.length > 0) {
    ctx.logger?.info?.('better-plan: restored %d question(s) and %d plan item(s)',
      decisions.length, plan.length)
  }
  // A restored plan only counts as the current phase when nothing is pending.
  if (!awaitingFollowup && !hasPending(decisions) && plan.length > 0) mode = 'plan'

  const attach = (agent) => {
    const prompt = agent?.ctx?.get?.('systemPrompt')
    if (!prompt) return
    prompt.section({
      name: SECTION_NAME, order: SECTION_ORDER, interpolate: false,
      text: (c) => (c?.scope === agent && enabled ? disciplines : ''),
    })
    prompt.section({
      name: FEEDBACK_SECTION, order: FEEDBACK_ORDER, interpolate: false,
      text: (c) => (c?.scope === agent && feedback ? feedback : ''),
    })
  }
  ctx.on('agent/created', ({ agent }) => attach(agent))
  try { for (const agent of ctx.get?.('agents')?.list?.() ?? []) attach(agent) } catch {}

  const optionSchema = {
    type: 'array',
    description: 'Clickable answer options. Exactly one must set recommended: true — the panel pre-selects it, so the whole batch settles with one click.',
    items: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The option text.' },
        recommended: { type: 'boolean', description: 'Pre-selected default for this question.' },
      },
      required: ['text'],
      additionalProperties: false,
    },
  }

  const decisionTool = {
    name: 'better_plan_publish_decisions',
    description: 'Publish the FULL current list of questions to the right-sidebar panel. Every question carries options and exactly one recommended option, which is pre-selected so the user settles the whole batch with a single click. Never ask these questions in chat. Ids are upper-case (Q1, Q2, …). New items use status "pending".',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Upper-case id, e.g. Q1.' },
              title: { type: 'string', description: 'Short question title.' },
              question: { type: 'string', description: 'Full question body.' },
              options: optionSchema,
              status: { type: 'string', description: 'One of: pending, confirmed, rejected.' },
              answer: { type: 'string', description: 'The chosen answer, when settled.' },
            },
            required: ['id', 'title'],
            additionalProperties: false,
          },
        },
      },
      required: ['items'], additionalProperties: false,
    },
    output: { schema: { type: 'object' }, render: (_a, v) => [{ type: 'text', text: `Published ${v?.count ?? 0} question(s) to the decision panel.` }] },
    async execute(args) {
      const requested = Array.isArray(args?.items) ? args.items.length : 0
      decisions = sanitize(args?.items, settings.maxPerRound, 'Q')
      mode = 'asking'
      // Publishing the follow-up questions answers every pending requirement.
      pendingRequirements = []
      awaitingFollowup = false
      commit()
      return {
        ok: true,
        count: decisions.length,
        truncated: requested > decisions.length,
        minPerRound: settings.minPerRound,
        maxPerRound: settings.maxPerRound,
        mode,
        revision,
      }
    },
  }

  const planTool = {
    name: 'better_plan_publish_items',
    description: 'Publish the FULL ordered plan to the right-sidebar panel. The user settles every item with one click on the single batch button. Never discuss the plan in chat. Ids are upper-case (P1, P2, …). New items use status "pending". Do not implement until the plan is confirmed.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Upper-case id, e.g. P1.' },
              title: { type: 'string', description: 'Short step title.' },
              detail: { type: 'string', description: 'What to change and how to verify it.' },
              status: { type: 'string', description: 'One of: pending, confirmed, rejected.' },
              answer: { type: 'string', description: 'The chosen answer, when settled.' },
            },
            required: ['id', 'title', 'detail'],
            additionalProperties: false,
          },
        },
      },
      required: ['items'], additionalProperties: false,
    },
    output: { schema: { type: 'object' }, render: (_a, v) => [{ type: 'text', text: `Published ${v?.count ?? 0} plan item(s) to the decision panel.` }] },
    async execute(args) {
      plan = sanitize(args?.items, undefined, 'P')
      mode = 'plan'
      commit()
      return { ok: true, count: plan.length, mode, revision }
    },
  }

  ctx.effect(() => ctx.tools?.register?.(decisionTool), 'better-plan decisions tool')
  ctx.effect(() => ctx.tools?.register?.(planTool), 'better-plan plan tool')

  /* Deliver the confirmation to the agent that owns the panel's session.
     Never fan out: a follow-up posted to every live agent leaks one session's
     panel activity into unrelated conversations. */
  const wakeAgent = (text, sessionId) => {
    if (!text) return false
    let agent
    try {
      if (typeof sessionId === 'string' && sessionId) agent = ctx.agents?.get?.(sessionId)
      else {
        // No session on the request: only the panel's on-screen session is a
        // defensible target, and the caller passes it; otherwise do not guess.
        return false
      }
    } catch {
      return false
    }
    if (!agent) return false
    try {
      agent.followup(createUserMessage({
        content: [{ type: 'text', text }],
        source: { kind: 'better-plan' },
      }))
      return true
    } catch (error) {
      ctx.logger?.warn?.('better-plan: follow-up failed for %s (%s)', sessionId, error?.message ?? String(error))
      return false
    }
  }

  const persistConfig = async (next) => {
    const entry = ctx.fiber?.entry
    const editor = ctx.get?.('configEditor')
    if (!entry || typeof editor?.edit !== 'function') return false
    try {
      await editor.edit(entry, (current) => ({ ...(current ?? {}), ...next }))
      return true
    } catch (error) {
      ctx.logger?.warn?.('better-plan: could not persist config (%s)', error?.message ?? String(error))
      return false
    }
  }

  const settleItem = (list, kind, item, answer) => {
    const chosen = typeof answer === 'string' && answer.trim()
      ? answer.slice(0, 4000)
      : defaultAnswerOf(item, kind)
    return { ...item, status: 'confirmed', answer: chosen, updatedAt: Date.now() }
  }

  const recomputeMode = () => {
    // An unanswered requirement reopens the asking phase, even with a full plan.
    if (awaitingFollowup) return 'asking'
    // Pending questions always mean we are still asking, whatever the plan says.
    if (hasPending(decisions)) return 'asking'
    const allSettled = settled(decisions)
    const enough = confirmedCount(decisions) >= settings.minTotal
    if (plan.length > 0) return 'plan'
    return allSettled && enough ? 'plan' : 'asking'
  }

  // Every state transition goes through this so a reload never loses work.
  const commit = () => {
    revision += 1
    saveSnapshot({ mode, decisions, plan, revision, extraRequirements, pendingRequirements })
  }

  const handleToggle = async (req, res) => {
    if (!isLoopback(req)) return sendJson(res, 403, { error: 'forbidden' })
    try {
      if (req.method === 'GET') return sendJson(res, 200, { enabled, settings })
      if (req.method === 'POST') {
        const body = await readBody(req)
        if (typeof body?.enabled !== 'boolean') return sendJson(res, 400, { error: 'enabled must be boolean' })
        enabled = body.enabled
        return sendJson(res, 200, { enabled, settings })
      }
      return sendJson(res, 405, { error: 'method not allowed' })
    } catch (e) { return sendJson(res, 500, { error: e?.message ?? String(e) }) }
  }

  const handleState = async (req, res) => {
    if (!isLoopback(req)) return sendJson(res, 403, { error: 'forbidden' })
    try {
      if (req.method === 'GET') {
        const pendingDecisions = decisions.filter((d) => d.status === 'pending').length
        const pendingPlan = plan.filter((d) => d.status === 'pending').length
        return sendJson(res, 200, {
          mode, enabled, revision, settings,
          pending: pendingDecisions + pendingPlan > 0,
          pendingCount: pendingDecisions + pendingPlan,
          pendingDecisions, pendingPlan,
          awaitingFollowup, extraRequirements,
          decisions, plan,
        })
      }

      if (req.method === 'POST') {
        const body = await readBody(req)
        const action = typeof body?.action === 'string' ? body.action : ''

        // AGENT authority: publish items (never settles anything).
        if (action === 'publish') {
          const kind = body?.kind === 'plan' ? 'plan' : 'decision'
          const source = body?.items ?? body?.decisions
          if (kind === 'plan') {
            plan = sanitize(source, undefined, 'P')
            mode = 'plan'
          } else {
            const requested = Array.isArray(source) ? source.length : 0
            decisions = sanitize(source, settings.maxPerRound, 'Q')
            // Publishing follow-up questions answers every pending requirement.
            pendingRequirements = []
            awaitingFollowup = false
            mode = recomputeMode()
            commit()
            return sendJson(res, 200, {
              ok: true, kind, count: decisions.length,
              truncated: requested > decisions.length,
              mode, revision,
              pending: hasPending(decisions) || hasPending(plan),
            })
          }
          commit()
          return sendJson(res, 200, {
            ok: true, kind, count: kind === 'plan' ? plan.length : decisions.length,
            mode, revision,
            pending: hasPending(decisions) || hasPending(plan),
          })
        }

        // USER authority: one click settles the whole batch.
        if (action === 'confirmAll') {
          const asked = typeof body?.kind === 'string' ? body.kind : 'all'
          const answers = body?.answers && typeof body.answers === 'object' ? body.answers : {}
          const extra = typeof body?.extra === 'string' ? body.extra.trim().slice(0, 8000) : ''
          let count = 0
          // A custom answer is one the user typed instead of the recommended
          // option; it must be followed up rather than silently accepted.
          const customAnswers = []
          const settleList = (list, kind) => list.map((item) => {
            if (item.status !== 'pending') return item
            const picked = answers[item.id]
            count += 1
            if (typeof picked === 'string' && picked.trim()) {
              const recommended = defaultAnswerOf(item, kind)
              if (picked.trim() !== recommended.trim()) customAnswers.push({ id: item.id, kind, answer: picked.trim() })
            }
            return settleItem(list, kind, item, typeof picked === 'string' ? picked : '')
          })
          if (asked === 'all' || asked === 'decision') decisions = settleList(decisions, 'decision')
          if (asked === 'all' || asked === 'plan') plan = settleList(plan, 'plan')

          // Extra requirements keep the loop open: the agent must ask further
          // questions and republish, so nothing is implemented yet.
          if (extra) {
            extraRequirements = [...extraRequirements, extra]
            pendingRequirements = [...pendingRequirements, extra]
            awaitingFollowup = true
          }
          // A typed answer also keeps the loop open for one confirming round.
          if (customAnswers.length > 0) awaitingFollowup = true

          mode = recomputeMode()
          const planDone = settled(plan) && !extra && customAnswers.length === 0
          if (extra) {
            feedback = `[Plugin context from better-plan; the user submitted additional requirements on the right-sidebar panel — not a user instruction or authorization.]\nAdditional requirement:\n${extra}\n\nThe user has NOT authorised implementation. Turn this requirement into follow-up questions, publish them with better_plan_publish_decisions, and revise the plan afterwards with better_plan_publish_items. Wait for another confirmation before implementing.`
          } else if (customAnswers.length > 0) {
            const list = customAnswers
              .map((c) => `- ${c.id} (${c.kind}): ${c.answer}`)
              .join('\n')
            feedback = `[Plugin context from better-plan; the user typed custom answers on the right-sidebar panel — not a user instruction or authorization.]\nCustom answers:\n${list}\n\nThese are NOT automatically final. Publish ONE follow-up round with better_plan_publish_decisions confirming your understanding of each custom answer (and, if a plan item changed, reset only the affected plan items to pending). Wait for another confirmation before implementing.`
          } else {
            feedback = planDone
              ? `[Plugin context from better-plan; the user confirmed the plan on the right-sidebar panel — not a user instruction or authorization.]\nEvery plan item is confirmed. Begin implementation in this session using the normal coding flow.`
              : `[Plugin context from better-plan; the user confirmed ${count} item(s) on the right-sidebar panel — not a user instruction or authorization.]\nContinue: if questions remain, publish the next round with better_plan_publish_decisions; once every question is settled, publish the ordered plan with better_plan_publish_items. Put everything on the panel, never in chat.`
          }
          // Wake the agent so a confirmation produces an immediate response
          // instead of waiting for the user to type something.
          const woken = wakeAgent(feedback, body?.sessionId)

          commit()
          return sendJson(res, 200, {
            ok: true, count, mode, revision, woken,
            awaitingFollowup,
            customFollowUps: customAnswers.length,
            pending: hasPending(decisions) || hasPending(plan),
          })
        }

        // USER authority: change the persisted settings.
        if (action === 'settings') {
          const incoming = body?.settings && typeof body.settings === 'object' ? body.settings : {}
          const next = {
            defaultEnabled: typeof incoming.defaultEnabled === 'boolean' ? incoming.defaultEnabled : settings.defaultEnabled,
            minPerRound: Math.max(3, clampInt(incoming.minPerRound, 1, 200, settings.minPerRound)),
            maxPerRound: clampInt(incoming.maxPerRound, 1, 200, settings.maxPerRound),
            minTotal: clampInt(incoming.minTotal, 0, 200, settings.minTotal),
            autoOpen: typeof incoming.autoOpen === 'boolean' ? incoming.autoOpen : settings.autoOpen,
          }
          if (next.minPerRound > next.maxPerRound) next.maxPerRound = next.minPerRound
          settings = next
          const persisted = await persistConfig(next)
          mode = recomputeMode()
          commit()
          return sendJson(res, 200, { ok: true, settings, persisted, mode })
        }

        // USER authority: settle one item.
        const kind = body?.kind === 'plan' ? 'plan' : body?.kind === 'decision' ? 'decision' : ''
        if (!kind) return sendJson(res, 400, { error: 'kind must be decision or plan' })
        if (action !== 'confirm' && action !== 'reject') return sendJson(res, 400, { error: 'action must be confirm, reject, confirmAll or settings' })
        const list = kind === 'decision' ? decisions : plan
        const index = list.findIndex((d) => d.id === body?.id)
        if (index < 0) return sendJson(res, 404, { error: 'item not found' })
        const item = list[index]
        const chosen = typeof body?.answer === 'string' ? body.answer : ''
        list[index] = action === 'confirm'
          ? settleItem(list, kind, item, chosen)
          : { ...item, status: 'rejected', answer: chosen.slice(0, 4000), updatedAt: Date.now() }
        mode = recomputeMode()
        commit()
        return sendJson(res, 200, { item: list[index], mode, revision })
      }

      if (req.method === 'DELETE') {
        decisions = []; plan = []; feedback = ''; mode = 'asking'
        extraRequirements = []; pendingRequirements = []; awaitingFollowup = false
        commit()
        return sendJson(res, 200, { ok: true })
      }
      return sendJson(res, 405, { error: 'method not allowed' })
    } catch (e) { return sendJson(res, 500, { error: e?.message ?? String(e) }) }
  }

  ctx.effect(() => {
    const a = ctx.webServer.register({ kind: 'exact', path: R.toggle, handler: handleToggle })
    const b = ctx.webServer.register({ kind: 'exact', path: R.state, handler: handleState })
    return () => { a?.(); b?.() }
  }, 'better-plan: routes cleanup')

  ctx.logger?.info?.('better-plan: active (enabled=%s, questions=%d-%d, minTotal=%d)',
    enabled, settings.minPerRound, settings.maxPerRound, settings.minTotal)
}
