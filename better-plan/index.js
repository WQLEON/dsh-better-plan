/**
 * better-plan — Host side.
 *
 * Two-phase flow, settled from the right-sidebar panel:
 *   1. asking: the agent publishes questions, each with clickable options.
 *   2. plan: once every question is settled, the agent publishes an ordered plan.
 *
 * State is scoped per session: every panel request carries the session id, and
 * each session owns its own snapshot file, so two windows (or two workspaces)
 * can never see or overwrite each other's questions.
 *
 * Mutating requests are only served to the local UI: loopback Host, JSON
 * content type (which forces a CORS preflight cross-origin), a same-origin
 * Origin/Sec-Fetch-Site, and the per-process token handed out by GET /state.
 */

import { createHash, randomUUID } from 'node:crypto'
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import z from '@deepseek-ai/schemastery'
import { buildDisciplines } from './disciplines.js'
import {
  GATE_MESSAGES,
  clampInt,
  confirmAll,
  emptyState,
  discardRound,
  hydrateState,
  publishDecisions,
  publishPlan,
  recomputeMode,
  recordReport,
  settleOne,
} from './lib/core.js'

export const Config = z.object({
  defaultEnabled: z.boolean().default(true),
  minPerBatch: z.natural().min(3).max(200).default(3),
  maxPerBatch: z.natural().min(3).max(200).default(10),
  // Deprecated aliases: 0 means "not set". Saving writes 0 here, so the new
  // keys win from then on while an existing profile keeps its old limits once.
  minPerRound: z.natural().min(0).max(200).default(0),
  maxPerRound: z.natural().min(0).max(200).default(0),
  minTotal: z.natural().min(0).max(200).default(0),
  autoOpen: z.boolean().default(true),
  showInputIcon: z.boolean().default(true),
})

export const inject = ['webServer', 'tools', 'systemPrompt', 'agents', 'commands']

const SECTION_NAME = 'better-plan:discipline'
const SECTION_ORDER = 3290
const R = {
  toggle: '/plugins/better-plan/toggle',
  state: '/plugins/better-plan/state',
}

const DEFAULT_SESSION = 'default'
const MAX_BODY_BYTES = 64 * 1024
const SESSION_HEADER = 'x-better-plan-session'
const TOKEN_HEADER = 'x-better-plan-token'
const SINCE_HEADER = 'x-better-plan-since'
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '::ffff:127.0.0.1'])

/* The host's own message factory is not importable from a bundle, so build the
   same frozen, identified user message it would produce. */
function createUserMessage(input) {
  const message = deepFreeze({ ...input, role: 'user', id: randomUUID() })
  return message
}
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value)
    for (const item of Object.values(value)) deepFreeze(item)
  }
  return value
}

/* ------------------------------------------------------------------ storage */

function homeDir() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}
function stateDir() {
  return join(homeDir(), 'better-plan')
}
function sessionKey(raw) {
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (!text) return DEFAULT_SESSION
  const safe = text.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 96)
  // A short hash keeps ids that sanitise to the same string in separate files.
  const hash = createHash('sha1').update(text).digest('hex').slice(0, 8)
  return `${safe || DEFAULT_SESSION}-${hash}`
}
function hostOf(raw) {
  const value = String(raw || '').trim().toLowerCase()
  if (!value) return ''
  if (value.startsWith('[')) {
    const end = value.indexOf(']')
    return end > 0 ? value.slice(1, end) : ''
  }
  return value.split(':')[0]
}
function isLoopback(req) {
  return LOOPBACK_HOSTS.has(hostOf(req.headers?.host))
}
function sessionIdOf(agent) {
  const id = agent?.session?.id ?? agent?.sessionId ?? agent?.id
  return typeof id === 'string' && id ? id : ''
}

class BodyError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}
async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new BodyError(413, 'request body too large')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new BodyError(400, 'invalid JSON body')
  }
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
function sendEmpty(res, status) {
  res.writeHead(status, { 'cache-control': 'no-store' })
  res.end()
}

export function apply(ctx, config) {
  let settings = {
    defaultEnabled: config?.defaultEnabled !== false,
    minPerBatch: clampInt(Number(config?.minPerRound) || config?.minPerBatch, 3, 200, 3),
    maxPerBatch: clampInt(Number(config?.maxPerRound) || config?.maxPerBatch, 3, 200, 10),
    minTotal: clampInt(config?.minTotal, 0, 200, 0),
    autoOpen: config?.autoOpen !== false,
    showInputIcon: config?.showInputIcon !== false,
  }
  if (settings.maxPerBatch < settings.minPerBatch) settings.maxPerBatch = settings.minPerBatch

  // The toggle is a property of the running app, not of one conversation.
  let enabled = settings.defaultEnabled
  // The token every mutating request must present. Handed out by GET /state and
  // only readable same-origin, so a cross-site page cannot forge a mutation.
  const instanceToken = randomUUID()
  // Rebuilt whenever settings change so the injected range and the panel agree.
  let disciplines = buildDisciplines(settings)
  const refreshDisciplines = () => { disciplines = buildDisciplines(settings) }

  const states = new Map()
  const sectionDisposers = new Set()
  // A session that wrote questions or a plan in chat without publishing gets one
  // short correction note on its next request. Cleared by the next real publish
  // and expired after ten minutes, so it can never become a permanent prompt block.
  const notices = new Map()
  const publishedSinceUser = new Set()
  const lastAssistant = new Map()
  const lastUserMessage = new Map()
  const NOTICE_TTL_MS = 10 * 60 * 1000
  const NOTICE_TEXT = 'NOTE: your previous reply wrote questions or plan content in chat without publishing. Publish with the panel tools; in chat reply only with the one-sentence template.'
  // Two-tier injection: a session gets the full discipline once per icon-on
  // period, then a short reminder. Turning the icon off ends the period, so the
  // next activation injects the full text again.
  const fullInjected = new Map()
  let modeGeneration = 0
  const REMINDER_TEXT = 'BP reminder: publish questions and plans with the panel tools; in chat reply only with the one-sentence template; ids continue Q/P and confirmed items are never re-asked.'
  const disciplineActive = (sessionId) => Boolean(sessionId) && enabled
  const setEnabled = (value) => {
    if (enabled === value) return
    enabled = value
    modeGeneration += 1
    fullInjected.clear()
  }

  const registerDisposer = (disposable) => {
    if (typeof disposable === 'function') sectionDisposers.add(disposable)
    else if (typeof disposable?.dispose === 'function') sectionDisposers.add(() => disposable.dispose())
  }

  /* Old versions kept one shared snapshot in $DSH_HOME. Keep a copy for the
     user and never read it into any session: that shared file is exactly the
     cross-session leak this version removes. */
  const archiveLegacyOnce = () => {
    const legacy = join(homeDir(), 'better-plan-state.json')
    const marker = join(stateDir(), 'legacy-archived.json')
    try {
      if (!existsSync(legacy) || existsSync(marker)) return
      mkdirSync(stateDir(), { recursive: true })
      const copy = join(stateDir(), `legacy-${Date.now()}.json`)
      copyFileSync(legacy, copy)
      writeFileSync(marker, JSON.stringify({ archivedAt: Date.now(), copy }), 'utf8')
      ctx.logger?.info?.('better-plan: archived the legacy shared state to %s', copy)
    } catch (error) {
      ctx.logger?.warn?.('better-plan: could not archive legacy state (%s)', error?.message ?? String(error))
    }
  }

  const stateFile = (key) => join(stateDir(), `${key}.json`)

  const loadState = (key) => {
    try {
      return hydrateState(JSON.parse(readFileSync(stateFile(key), 'utf8')))
    } catch {
      return emptyState()
    }
  }
  const sessionState = (key) => {
    if (!states.has(key)) states.set(key, loadState(key))
    return states.get(key)
  }
  const persistState = (key, state) => {
    try {
      mkdirSync(stateDir(), { recursive: true })
      const file = stateFile(key)
      const temp = `${file}.tmp`
      const payload = {
        revision: state.revision,
        mode: state.mode,
        round: state.round,
        roundDone: state.roundDone,
        awaitingReport: state.awaitingReport,
        counters: state.counters,
        decisions: state.decisions,
        plan: state.plan,
        extraRequirements: state.extraRequirements,
        pendingRequirements: state.pendingRequirements,
        timeline: state.timeline,
      }
      writeFileSync(temp, JSON.stringify(payload), { encoding: 'utf8', mode: 0o600 })
      renameSync(temp, file)
      try { chmodSync(file, 0o600) } catch { /* Windows ACLs are not chmod */ }
      return true
    } catch (error) {
      ctx.logger?.warn?.('better-plan: could not save session state (%s)', error?.message ?? String(error))
      return false
    }
  }
  /** Adopt a new state for a session and persist it; returns whether it hit disk. */
  const commitState = (key, state) => {
    states.set(key, state)
    return persistState(key, state)
  }

  /* ------------------------------------------------------------------ view */

  const view = (state, session, persisted) => {
    const pendingDecisions = state.decisions.filter((d) => d.status === 'pending').length
    const pendingPlan = state.plan.filter((d) => d.status === 'pending').length
    return {
      ok: true,
      session: session.raw || null,
      sessionScoped: session.key !== DEFAULT_SESSION,
      enabled,
      revision: state.revision,
      mode: state.mode,
      round: state.round,
      timeline: state.timeline,
      counters: state.counters,
      settings,
      pending: pendingDecisions + pendingPlan > 0,
      pendingCount: pendingDecisions + pendingPlan,
      pendingDecisions,
      pendingPlan,
      awaitingFollowup: state.awaitingFollowup,
      extraRequirements: state.extraRequirements,
      decisions: state.decisions,
      plan: state.plan,
      token: instanceToken,
      persisted: persisted !== false,
    }
  }

  /* ----------------------------------------------------------------- guards */

  const guard = (req, { mutating }) => {
    if (!isLoopback(req)) return { status: 403, error: 'forbidden: only loopback requests are served' }
    if (!mutating) return null
    const contentType = String(req.headers['content-type'] || '').toLowerCase()
    if (!contentType.startsWith('application/json')) {
      return { status: 415, error: 'content-type must be application/json' }
    }
    const site = String(req.headers['sec-fetch-site'] || '').toLowerCase()
    if (site && site !== 'same-origin' && site !== 'none') {
      return { status: 403, error: 'cross-site request refused' }
    }
    const origin = req.headers.origin
    if (typeof origin === 'string' && origin) {
      let originHost = ''
      try { originHost = hostOf(new URL(origin).host) } catch { originHost = '' }
      if (!LOOPBACK_HOSTS.has(originHost)) return { status: 403, error: 'cross-origin request refused' }
    }
    if (String(req.headers[TOKEN_HEADER] || '') !== instanceToken) {
      return { status: 403, error: `missing or invalid ${TOKEN_HEADER}` }
    }
    return null
  }

  const requestSession = (req, body) => {
    const header = req.headers?.[SESSION_HEADER]
    const fromHeader = typeof header === 'string' ? header.trim() : ''
    const fromBody = typeof body?.sessionId === 'string' ? body.sessionId.trim() : ''
    const raw = fromHeader || fromBody
    return { raw, key: sessionKey(raw) }
  }

  /* --------------------------------------------------------------- delivery */

  const takeUserMessage = (sessionId) => {
    const text = lastUserMessage.get(sessionId)
    lastUserMessage.delete(sessionId)
    return text
  }

  const wakeAgent = (feedback, sessionRaw) => {
    if (!feedback) return false
    // With the feature switched off the panel must not put words in a turn.
    if (!enabled) return false
    const target = typeof sessionRaw === 'string' ? sessionRaw.trim() : ''
    if (!target) return false
    let agent
    try { agent = ctx.agents?.get?.(target) } catch { agent = undefined }
    if (!agent || typeof agent.followup !== 'function') return false
    try {
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: feedback }],
        source: { kind: 'better-plan' },
      }))
      return true
    } catch (error) {
      ctx.logger?.warn?.('better-plan: follow-up failed for %s (%s)', target, error?.message ?? String(error))
      return false
    }
  }

  /* ------------------------------------------------------------------ tools */

  const publishThroughTool = (exec, kind, items) => {
    const sessionRaw = sessionIdOf(exec?.agent)
    if (!sessionRaw) {
      return { ok: false, code: 'no_session', message: 'This tool must be called from a conversation.' }
    }
    const key = sessionKey(sessionRaw)
    const state = sessionState(key)
    if (kind === 'plan') {
      const outcome = publishPlan(state, items, settings)
      if (!outcome.ok) {
        return {
          ok: false,
          code: outcome.code,
          message: GATE_MESSAGES[outcome.code],
          mode: state.mode,
          revision: state.revision,
          pendingDecisions: state.decisions.filter((d) => d.status === 'pending').length,
        }
      }
      notices.delete(sessionRaw)
      return { ...outcome.result, persisted: commitState(key, outcome.state) }
    }
    const outcome = publishDecisions(state, items, settings, { userMessage: takeUserMessage(sessionRaw) })
    notices.delete(sessionRaw)
    return { ...outcome.result, persisted: commitState(key, outcome.state) }
  }

  const optionSchema = {
    type: 'array',
    description: 'Answer options; exactly one recommended (pre-selected).',
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
    description: 'Publish the full question list to the decision panel. Real options only (1–3 typical), exactly one recommended; ids continue Q1, Q2, … Never ask in chat.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Question id, e.g. Q1.' },
              title: { type: 'string', description: 'Short title.' },
              question: { type: 'string', description: 'Full question body.' },
              options: optionSchema,
            },
            required: ['id', 'title'],
            additionalProperties: false,
          },
        },
      },
      required: ['items'], additionalProperties: false,
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => [{
        type: 'text',
        text: v?.ok === false
          ? `Rejected: ${v.message ?? v.code}`
          : `Published ${v?.count ?? 0} question(s) to the decision panel.`,
      }],
    },
    async execute(args, exec) {
      return publishThroughTool(exec, 'decision', args?.items)
    },
  }

  const planTool = {
    name: 'better_plan_publish_items',
    description: 'Publish the full ordered plan to the decision panel. Each step names what changes and how to verify it; ids continue P1, P2, … Implement only after the user confirms.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Step id, e.g. P1.' },
              title: { type: 'string', description: 'Short step title.' },
              detail: { type: 'string', description: 'What changes and how to verify it.' },
            },
            required: ['id', 'title', 'detail'],
            additionalProperties: false,
          },
        },
      },
      required: ['items'], additionalProperties: false,
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => [{
        type: 'text',
        text: v?.ok === false
          ? `Rejected: ${v.message ?? v.code}`
          : `Published ${v?.count ?? 0} plan item(s) to the decision panel.`,
      }],
    },
    async execute(args, exec) {
      return publishThroughTool(exec, 'plan', args?.items)
    },
  }

  ctx.effect(() => ctx.tools?.register?.(decisionTool), 'better-plan decisions tool')
  ctx.effect(() => ctx.tools?.register?.(planTool), 'better-plan plan tool')

  /* ------------------------------------------------------- system prompt */

  const attachedAgents = new WeakSet()
  const listAgents = () => {
    // The agents service has changed shape across releases; try every known
    // way before giving up, and never let enumeration break plugin startup.
    try {
      const agents = ctx.get?.('agents') ?? ctx.agents
      if (!agents) return []
      if (typeof agents.list === 'function') return agents.list() ?? []
      if (typeof agents.values === 'function') return [...agents.values()]
      if (agents instanceof Map) return [...agents.values()]
      if (Array.isArray(agents.agents)) return agents.agents
    } catch { /* fall through */ }
    return []
  }

  const noticeFor = (sessionId) => {
    const entry = notices.get(sessionId)
    if (!entry) return ''
    if (Date.now() - entry.at > NOTICE_TTL_MS) {
      notices.delete(sessionId)
      return ''
    }
    return entry.text
  }

  const assistantText = (message) => (Array.isArray(message?.content) ? message.content : [])
    .filter((part) => part?.type === 'text')
    .map((part) => part.text ?? '')
    .join('')
    .trim()

  // Deliberately conservative: a long reply that asks questions or lists options
  // counts as panel content. Short factual answers never trigger it.
  const looksLikePanelContent = (text) => text.length >= 20
    && (/[?？]/.test(text) || /(^|\n)\s*[A-D][.、)]/.test(text) || /选项|推荐/.test(text))

  const onSessionEvent = (session, event) => {
    try {
      const sessionId = typeof session?.id === 'string' ? session.id : ''
      if (!sessionId || !event || typeof event.type !== 'string') return
      if (!disciplineActive(sessionId)) return
      if (event.type === 'user/message') {
        publishedSinceUser.delete(sessionId)
        const text = assistantText(event.data?.message)
        if (text && !text.startsWith('[Plugin context from better-plan')) lastUserMessage.set(sessionId, text)
        return
      }
      if (event.type === 'turn/end') {
        // A stable round ends when its execution report reached the user.
        const key = sessionKey(sessionId)
        try {
          const current = states.get(key)
          if (current) {
            const recorded = recordReport(current, lastAssistant.get(sessionId) ?? '')
            if (recorded.ok) commitState(key, recorded.state)
          }
        } catch { /* best effort */ }
        return
      }
      if (event.type === 'tool/call') {
        const name = event.data?.name ?? event.data?.call?.name ?? ''
        if (typeof name === 'string' && name.startsWith('better_plan_publish_')) {
          publishedSinceUser.add(sessionId)
          notices.delete(sessionId)
        }
        return
      }
      if (event.type === 'assistant/message') {
        const text = assistantText(event.data?.message)
        if (text) lastAssistant.set(sessionId, text)
        if (publishedSinceUser.has(sessionId)) return
        if (looksLikePanelContent(text)) {
          notices.set(sessionId, { at: Date.now(), text: NOTICE_TEXT })
        }
      }
    } catch { /* best effort: never break the session */ }
  }
  ctx.on('session/event', onSessionEvent)

  const attach = (agent) => {
    if (!agent || attachedAgents.has(agent)) return
    const prompt = agent?.ctx?.get?.('systemPrompt')
    if (!prompt?.section) return
    attachedAgents.add(agent)
    registerDisposer(prompt.section({
      name: SECTION_NAME,
      order: SECTION_ORDER,
      interpolate: false,
      text: (scope) => {
        if (scope?.scope !== agent) return ''
        const sessionId = sessionIdOf(agent)
        if (!disciplineActive(sessionId)) return ''
        const notice = sessionId ? noticeFor(sessionId) : ''
        const full = fullInjected.get(sessionId) !== modeGeneration
        if (full) fullInjected.set(sessionId, modeGeneration)
        const body = full ? disciplines : REMINDER_TEXT
        return notice ? `${body}\n\n${notice}` : body
      },
    }))
  }
  ctx.on('agent/created', ({ agent }) => attach(agent))
  for (const agent of listAgents()) attach(agent)

  /* ------------------------------------------------------------ settings */

  const persistConfig = async (next) => {
    const entry = ctx.fiber?.entry
    const editor = ctx.get?.('configEditor')
    if (!entry || typeof editor?.edit !== 'function') return false
    try {
      await editor.edit(entry, (current) => ({
        ...(current ?? {}),
        ...next,
        // Migrate: new keys are authoritative from now on.
        minPerRound: 0,
        maxPerRound: 0,
      }))
      return true
    } catch (error) {
      ctx.logger?.warn?.('better-plan: could not persist config (%s)', error?.message ?? String(error))
      return false
    }
  }

  const normaliseSettings = (incoming, base) => {
    const next = {
      defaultEnabled: typeof incoming?.defaultEnabled === 'boolean' ? incoming.defaultEnabled : base.defaultEnabled,
      minPerBatch: clampInt(incoming?.minPerBatch ?? incoming?.minPerRound, 3, 200, base.minPerBatch),
      maxPerBatch: clampInt(incoming?.maxPerBatch ?? incoming?.maxPerRound, 3, 200, base.maxPerBatch),
      minTotal: clampInt(incoming?.minTotal, 0, 200, base.minTotal),
      autoOpen: typeof incoming?.autoOpen === 'boolean' ? incoming.autoOpen : base.autoOpen,
      showInputIcon: typeof incoming?.showInputIcon === 'boolean' ? incoming.showInputIcon : base.showInputIcon,
    }
    if (next.maxPerBatch < next.minPerBatch) next.maxPerBatch = next.minPerBatch
    return next
  }

  /* -------------------------------------------------------------- routes */

  const handleToggle = async (req, res) => {
    try {
      const mutating = req.method !== 'GET'
      const denied = guard(req, { mutating })
      if (denied) return sendJson(res, denied.status, denied)
      if (req.method === 'GET') return sendJson(res, 200, { ok: true, enabled, settings, token: instanceToken })
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
      const body = await readBody(req)
      if (typeof body?.enabled !== 'boolean') return sendJson(res, 400, { error: 'enabled must be boolean' })
      setEnabled(body.enabled)
      return sendJson(res, 200, { ok: true, enabled, settings })
    } catch (error) {
      return sendJson(res, error?.status ?? 500, { error: error?.message ?? String(error) })
    }
  }

  const handleState = async (req, res) => {
    try {
      const mutating = req.method !== 'GET'
      const denied = guard(req, { mutating })
      if (denied) return sendJson(res, denied.status, denied)

      const body = mutating ? await readBody(req) : null
      const session = requestSession(req, body)
      const state = sessionState(session.key)

      if (req.method === 'GET') {
        const since = Number(req.headers[SINCE_HEADER])
        if (Number.isFinite(since) && since === state.revision) return sendEmpty(res, 304)
        return sendJson(res, 200, view(state, session))
      }

      if (req.method === 'DELETE') {
        states.set(session.key, emptyState())
        persistState(session.key, emptyState())
        return sendJson(res, 200, { ok: true, reset: true, ...view(states.get(session.key), session) })
      }

      if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })

      // Optimistic concurrency: a panel that has not seen the latest revision
      // must refresh instead of settling a stale batch.
      const expected = Number(body?.revision)
      if (Number.isFinite(expected) && expected !== state.revision) {
        return sendJson(res, 409, { error: 'revision_conflict', ...view(state, session) })
      }

      const action = typeof body?.action === 'string' ? body.action : ''

      if (action === 'publish') {
        const kind = body?.kind === 'plan' ? 'plan' : 'decision'
        if (kind === 'plan') {
          const outcome = publishPlan(state, body?.items ?? body?.decisions, settings)
          if (!outcome.ok) {
            return sendJson(res, 409, {
              ok: false, code: outcome.code, message: GATE_MESSAGES[outcome.code], ...view(state, session),
            })
          }
          notices.delete(session.raw)
          const persisted = commitState(session.key, outcome.state)
          return sendJson(res, 200, { ...view(outcome.state, session, persisted), ...outcome.result, persisted })
        }
        const outcome = publishDecisions(state, body?.items ?? body?.decisions, settings, { userMessage: takeUserMessage(session.raw) })
        notices.delete(session.raw)
        const persisted = commitState(session.key, outcome.state)
        return sendJson(res, 200, { ...view(outcome.state, session, persisted), ...outcome.result, persisted })
      }

      if (action === 'confirmAll') {
        const outcome = confirmAll(state, body, settings)
        notices.delete(session.raw)
        const persisted = commitState(session.key, outcome.state)
        const woken = wakeAgent(outcome.feedback, session.raw)
        return sendJson(res, 200, {
          ...view(outcome.state, session, persisted),
          ok: true,
          count: outcome.count,
          customFollowUps: outcome.customAnswers.length,
          planDone: outcome.planDone,
          woken,
          persisted,
        })
      }

      if (action === 'discardRound') {
        const outcome = discardRound(state)
        notices.delete(session.raw)
        const persisted = commitState(session.key, outcome.state)
        return sendJson(res, 200, { ...view(outcome.state, session, persisted), ok: true, discarded: true, persisted })
      }

      if (action === 'confirm' || action === 'reject') {
        const outcome = settleOne(state, body, settings)
        if (!outcome.ok) {
          const status = outcome.code === 'not_found' ? 404 : 400
          return sendJson(res, status, { error: outcome.code })
        }
        notices.delete(session.raw)
        const persisted = commitState(session.key, outcome.state)
        const woken = wakeAgent(outcome.feedback, session.raw)
        return sendJson(res, 200, { ...view(outcome.state, session, persisted), ok: true, item: outcome.item, woken, persisted })
      }

      if (action === 'settings') {
        const incoming = body?.settings && typeof body.settings === 'object' ? body.settings : {}
        settings = normaliseSettings(incoming, settings)
        refreshDisciplines()
        // minTotal can change the mode of every open conversation.
        for (const [key, cached] of states) {
          const mode = recomputeMode(cached, settings)
          if (mode !== cached.mode) {
            const next = { ...cached, mode }
            states.set(key, next)
            persistState(key, next)
          }
        }
        const persisted = await persistConfig(settings)
        const current = sessionState(session.key)
        return sendJson(res, 200, { ...view(current, session, persisted), ok: true, settings, persisted })
      }

      if (action === 'reset') {
        const cleared = emptyState()
        const persisted = commitState(session.key, cleared)
        return sendJson(res, 200, { ...view(cleared, session, persisted), ok: true, reset: true, persisted })
      }

      return sendJson(res, 400, { error: 'action must be publish, confirmAll, confirm, reject, settings or reset' })
    } catch (error) {
      return sendJson(res, error?.status ?? 500, { error: error?.message ?? String(error) })
    }
  }

  archiveLegacyOnce()

  ctx.effect(() => {
    const a = ctx.webServer.register({ kind: 'exact', path: R.toggle, handler: handleToggle })
    const b = ctx.webServer.register({ kind: 'exact', path: R.state, handler: handleState })
    return () => { a?.(); b?.() }
  }, 'better-plan: routes cleanup')

  // Sections registered on live agents must go away with the plugin, or a hot
  // reload would stack a second copy of the discipline on every agent.
  ctx.effect(() => () => {
    for (const dispose of sectionDisposers) {
      try { dispose() } catch { /* already gone */ }
    }
    sectionDisposers.clear()
  }, 'better-plan: prompt sections cleanup')

  // The commands are the icon's twins: /better-plan turns the mode on,
  // /better-plan-off turns it off, both app-wide.
  const registerCommand = (name, value) => ctx.commands?.register?.({
    name,
    description: value
      ? '开启更好的计划模式（与输入框图标一致）'
      : '关闭更好的计划模式（与输入框图标一致）',
    handler: () => {
      setEnabled(value)
      return { kind: 'success', text: '' }
    },
  })
  ctx.effect(() => registerCommand('better-plan', true), 'better-plan: /better-plan')
  ctx.effect(() => registerCommand('better-plan-off', false), 'better-plan: /better-plan-off')

  ctx.logger?.info?.('better-plan: active (enabled=%s, questions=%d-%d, minTotal=%d, session-scoped state)',
    enabled, settings.minPerBatch, settings.maxPerBatch, settings.minTotal)
}
