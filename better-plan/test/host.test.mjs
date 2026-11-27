import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { apply } from '../index.js'

const home = mkdtempSync(join(tmpdir(), 'better-plan-host-'))
process.env.DSH_HOME = home
// A previous better-plan version shared one snapshot across every session.
writeFileSync(join(home, 'better-plan-state.json'), JSON.stringify({ plan: [{ id: 'P9', title: 'other window' }] }))
test.after(() => rmSync(home, { recursive: true, force: true }))

function fakeReq({ method = 'GET', headers = {}, body } = {}) {
  return {
    method,
    headers,
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) yield Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
    },
  }
}
function fakeRes() {
  return {
    status: 0,
    headers: {},
    body: '',
    writeHead(status, headers) { this.status = status; this.headers = headers || {} },
    end(body) { this.body = body == null ? '' : String(body) },
  }
}

/** Boot the host plugin against a minimal fake Cordis context. */
function boot(config = {}) {
  const handlers = new Map()
  const tools = new Map()
  const sections = []
  const agents = new Map()
  const listeners = new Map()
  const commands = new Map()
  const ctx = {
    logger: { info() {}, warn() {} },
    fiber: {},
    effect(fn) { return fn() },
    on(event, handler) {
      const list = listeners.get(event) || []
      list.push(handler)
      listeners.set(event, list)
      return () => {}
    },
    get(name) {
      if (name === 'agents') return { list: () => [...agents.values()], get: (id) => agents.get(id) }
      return undefined
    },
    webServer: {
      register({ path, handler }) {
        handlers.set(path, handler)
        return () => handlers.delete(path)
      },
    },
    tools: {
      register(def) {
        tools.set(def.name, def)
        return () => tools.delete(def.name)
      },
    },
    agents: { get: (id) => agents.get(id) },
    commands: {
      register(def) {
        commands.set(def.name, def)
        return () => commands.delete(def.name)
      },
    },
  }
  apply(ctx, config)

  const call = async (path, req) => {
    const res = fakeRes()
    await handlers.get(path)(req, res)
    return { status: res.status, json: res.body ? JSON.parse(res.body) : null }
  }
  return { ctx, handlers, tools, sections, agents, listeners, call, commands }
}

const SESSION = 'session-test-0001'
const headers = (extra = {}) => ({ host: '127.0.0.1:58478', ...extra })

async function state(booted, extraHeaders = {}) {
  return booted.call('/plugins/better-plan/state', fakeReq({ headers: headers(extraHeaders) }))
}
async function post(booted, body, extraHeaders = {}) {
  return booted.call('/plugins/better-plan/state', fakeReq({
    method: 'POST',
    headers: headers({ 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...extraHeaders }),
    body,
  }))
}

test('state is session scoped', async () => {
  const b = boot()
  const a = await state(b, { 'x-better-plan-session': 'session-a' })
  const token = a.json.token
  assert.ok(token, 'a token is handed out')
  await post(b, {
    action: 'publish',
    kind: 'decision',
    items: [{ id: 'Q1', title: 'A only', options: [{ text: 'yes', recommended: true }] }],
  }, { 'x-better-plan-session': 'session-a', 'x-better-plan-token': token })

  const onlyA = await state(b, { 'x-better-plan-session': 'session-a' })
  const otherB = await state(b, { 'x-better-plan-session': 'session-b' })
  assert.equal(onlyA.json.decisions.length, 1)
  assert.equal(otherB.json.decisions.length, 0, 'another session must not see A\'s questions')
  assert.equal(otherB.json.sessionScoped, true)
})

test('mutations are refused without a token or with a cross-site request', async () => {
  const b = boot()
  const token = (await state(b, { 'x-better-plan-session': SESSION })).json.token
  const body = { action: 'reset' }

  const noToken = await b.call('/plugins/better-plan/state', fakeReq({
    method: 'POST',
    headers: headers({ 'content-type': 'application/json', 'x-better-plan-session': SESSION }),
    body,
  }))
  assert.equal(noToken.status, 403)

  const wrongType = await b.call('/plugins/better-plan/state', fakeReq({
    method: 'POST',
    headers: headers({ 'content-type': 'text/plain', 'x-better-plan-session': SESSION, 'x-better-plan-token': token }),
    body,
  }))
  assert.equal(wrongType.status, 415)

  const crossSite = await b.call('/plugins/better-plan/state', fakeReq({
    method: 'POST',
    headers: headers({
      'content-type': 'application/json', 'x-better-plan-session': SESSION,
      'x-better-plan-token': token, 'sec-fetch-site': 'cross-site',
    }),
    body,
  }))
  assert.equal(crossSite.status, 403)

  const foreignOrigin = await b.call('/plugins/better-plan/state', fakeReq({
    method: 'POST',
    headers: headers({
      'content-type': 'application/json', 'x-better-plan-session': SESSION,
      'x-better-plan-token': token, origin: 'https://evil.example',
    }),
    body,
  }))
  assert.equal(foreignOrigin.status, 403)

  const nonLoopback = await b.call('/plugins/better-plan/state', fakeReq({
    method: 'GET', headers: { host: '10.0.0.7:58478' },
  }))
  assert.equal(nonLoopback.status, 403)
})

test('a stale panel revision is refused instead of overwriting newer state', async () => {
  const b = boot()
  const token = (await state(b, { 'x-better-plan-session': SESSION })).json.token
  await post(b, { action: 'publish', kind: 'decision', items: [{ id: 'Q1', title: 't' }] },
    { 'x-better-plan-session': SESSION, 'x-better-plan-token': token })
  const conflict = await post(b, { action: 'reset', revision: 0 },
    { 'x-better-plan-session': SESSION, 'x-better-plan-token': token })
  assert.equal(conflict.status, 409)
  assert.equal(conflict.json.error, 'revision_conflict')
})

test('tools publish into the calling agent\'s session only', async () => {
  const b = boot()
  const tool = b.tools.get('better_plan_publish_decisions')
  const noAgent = await tool.execute({ items: [{ id: 'Q1', title: 't' }] }, {})
  assert.equal(noAgent.ok, false)
  assert.equal(noAgent.code, 'no_session')

  const agentA = { session: { id: 'session-tool-a' } }
  await tool.execute({ items: [{ id: 'Q1', title: 'from tool' }] }, { agent: agentA })
  const a = await state(b, { 'x-better-plan-session': 'session-tool-a' })
  const z = await state(b, { 'x-better-plan-session': 'session-tool-z' })
  assert.equal(a.json.decisions.length, 1)
  assert.equal(a.json.decisions[0].status, 'pending', 'published items are never pre-confirmed')
  assert.equal(z.json.decisions.length, 0)
})

test('the plan tool refuses to skip the asking phase', async () => {
  const b = boot()
  const planTool = b.tools.get('better_plan_publish_items')
  const agent = { session: { id: 'session-gate' } }
  const refused = await planTool.execute({ items: [{ id: 'P1', title: 's', detail: 'd' }] }, { agent })
  assert.equal(refused.ok, false)
  assert.equal(refused.code, 'no_answers')

  const decisionTool = b.tools.get('better_plan_publish_decisions')
  await decisionTool.execute({ items: [{ id: 'Q1', title: 'q', options: [{ text: 'a', recommended: true }] }] }, { agent })
  const stillPending = await planTool.execute({ items: [{ id: 'P1', title: 's', detail: 'd' }] }, { agent })
  assert.equal(stillPending.code, 'questions_pending')
})

test('confirmation wakes the exact agent with plugin-sourced context', async () => {
  const b = boot()
  const token = (await state(b, { 'x-better-plan-session': 'session-wake' })).json.token
  await post(b, {
    action: 'publish',
    kind: 'decision',
    items: [{ id: 'Q1', title: 'q', options: [{ text: 'a', recommended: true }] }],
  }, { 'x-better-plan-session': 'session-wake', 'x-better-plan-token': token })

  const sent = []
  const agent = {
    session: { id: 'session-wake' },
    followup(message) { sent.push(message) },
  }
  b.ctx.agents.get = (id) => (id === 'session-wake' ? agent : undefined)

  const res = await post(b, {
    action: 'confirmAll', kind: 'all', answers: { Q1: 'a' },
  }, { 'x-better-plan-session': 'session-wake', 'x-better-plan-token': token, 'x-better-plan-revision': '1' })
  assert.equal(res.status, 200)
  assert.equal(res.json.woken, true)
  assert.equal(sent.length, 1)
  assert.equal(sent[0].role, 'user')
  assert.equal(sent[0].source.kind, 'better-plan')
  assert.match(sent[0].content[0].text, /user confirmed 1 item/)
})

test('confirmations are not delivered while the feature is off', async () => {
  const b = boot()
  const token = (await state(b, { 'x-better-plan-session': 'session-off' })).json.token
  await post(b, {
    action: 'publish', kind: 'decision', items: [{ id: 'Q1', title: 'q', options: [{ text: 'a', recommended: true }] }],
  }, { 'x-better-plan-session': 'session-off', 'x-better-plan-token': token })

  const sent = []
  b.ctx.agents.get = () => ({ followup: (m) => sent.push(m) })

  const toggled = await b.call('/plugins/better-plan/toggle', fakeReq({
    method: 'POST',
    headers: headers({ 'content-type': 'application/json', 'x-better-plan-token': token }),
    body: { enabled: false },
  }))
  assert.equal(toggled.status, 200)
  assert.equal(toggled.json.enabled, false)

  const res = await post(b, { action: 'confirmAll', answers: { Q1: 'a' } },
    { 'x-better-plan-session': 'session-off', 'x-better-plan-token': token, 'x-better-plan-revision': '1' })
  assert.equal(res.json.woken, false)
  assert.equal(sent.length, 0)
})

test('the discipline section is empty while the feature is off', async () => {
  const b = boot()
  const token = (await state(b, { 'x-better-plan-session': 'session-prompt' })).json.token
  const prompts = []
  const agent = {
    session: { id: 'session-prompt' },
    ctx: { get: (name) => (name === 'systemPrompt' ? { section: (options) => { prompts.push(options); return () => {} } } : undefined) },
  }
  for (const handler of b.listeners.get('agent/created') || []) handler({ agent })
  assert.equal(prompts.length, 1)
  const text = () => prompts[0].text({ scope: agent })
  assert.match(text(), /You are operating with better-plan/)
  await b.call('/plugins/better-plan/toggle', fakeReq({
    method: 'POST',
    headers: headers({ 'content-type': 'application/json', 'x-better-plan-token': token }),
    body: { enabled: false },
  }))
  assert.equal(text(), '')
})

test('settings persist in memory and rebuild the injected discipline', async () => {
  const b = boot()
  const token = (await state(b, { 'x-better-plan-session': 'session-settings' })).json.token
  const prompts = []
  const agent = {
    session: { id: 'session-settings' },
    ctx: { get: () => ({ section: (options) => { prompts.push(options); return () => {} } }) },
  }
  for (const handler of b.listeners.get('agent/created') || []) handler({ agent })

  const saved = await post(b, { action: 'settings', settings: { minPerBatch: 4, maxPerBatch: 6 } },
    { 'x-better-plan-session': 'session-settings', 'x-better-plan-token': token })
  assert.equal(saved.status, 200)
  assert.equal(saved.json.settings.minPerBatch, 4)
  assert.equal(saved.json.settings.maxPerBatch, 6)
  assert.match(prompts[0].text({ scope: agent }), /at most 6, no hard minimum \(4 is only a soft hint\)/)
})

test('state survives a plugin reload through the per-session file', async () => {
  const first = boot()
  const token = (await state(first, { 'x-better-plan-session': 'session-persist' })).json.token
  await post(first, { action: 'publish', kind: 'decision', items: [{ id: 'Q1', title: 'persisted' }] },
    { 'x-better-plan-session': 'session-persist', 'x-better-plan-token': token })

  const second = boot()
  const res = await state(second, { 'x-better-plan-session': 'session-persist' })
  assert.equal(res.json.decisions.length, 1)
  assert.equal(res.json.decisions[0].title, 'persisted')
  assert.equal(res.json.revision, 1)
  // The round and its timeline survive the reload too.
  assert.equal(res.json.round, 1)
  assert.equal(res.json.timeline.length, 1)
  assert.equal(res.json.timeline[0].kind, 'questions')
})

test('a stale legacy shared snapshot is archived, never adopted', async () => {
  const b = boot()
  const res = await state(b, { 'x-better-plan-session': 'session-legacy' })
  assert.equal(res.json.decisions.length, 0)
  assert.equal(res.json.plan.length, 0)
  const archived = readdirSync(join(home, 'better-plan')).filter((f) => f.startsWith('legacy-'))
  assert.ok(archived.length > 0, 'the legacy file is preserved as a copy')
})

test('GET honours the revision cursor', async () => {
  const b = boot()
  await state(b, { 'x-better-plan-session': 'session-since' })
  const fresh = await b.call('/plugins/better-plan/state', fakeReq({
    headers: headers({ 'x-better-plan-session': 'session-since', 'x-better-plan-since': '0' }),
  }))
  assert.equal(fresh.status, 304)
  assert.equal(fresh.json, null)
})

test('republishing questions keeps what the user already confirmed', async () => {
  const b = boot()
  const session = { 'x-better-plan-session': 'session-merge' }
  const token = (await state(b, session)).json.token
  const headers = { ...session, 'x-better-plan-token': token }
  const items = [
    { id: 'Q1', title: 'one', options: [{ text: 'A', recommended: true }] },
    { id: 'Q2', title: 'two', options: [{ text: 'A', recommended: true }] },
  ]

  const first = await post(b, { action: 'publish', kind: 'decision', items }, headers)
  assert.equal(first.status, 200)
  const revision = (await state(b, session)).json.revision

  const confirmed = await post(b, { action: 'confirmAll', answers: { Q1: 'A', Q2: 'A' }, revision }, headers)
  assert.equal(confirmed.status, 200)
  assert.equal(confirmed.json.woken, false)

  const nextRevision = (await state(b, session)).json.revision
  const again = await post(b, { action: 'publish', kind: 'decision', items, revision: nextRevision }, headers)
  assert.equal(again.status, 200)
  assert.equal(again.json.kept, 2)
  assert.deepEqual(again.json.decisions.map((d) => d.status), ['confirmed', 'confirmed'])
  assert.deepEqual(again.json.decisions.map((d) => d.answer), ['A', 'A'])
  assert.equal(again.json.counters.q, 2)
})

test('a changed question keeps its confirmation and answer', async () => {
  const b = boot()
  const session = { 'x-better-plan-session': 'session-reopen' }
  const token = (await state(b, session)).json.token
  const headers = { ...session, 'x-better-plan-token': token }
  const items = [
    { id: 'Q1', title: 'one', options: [{ text: 'A', recommended: true }] },
    { id: 'Q2', title: 'two', options: [{ text: 'A', recommended: true }] },
  ]
  await post(b, { action: 'publish', kind: 'decision', items }, headers)
  const revision = (await state(b, session)).json.revision
  await post(b, { action: 'confirmAll', answers: { Q1: 'A', Q2: 'A' }, revision }, headers)

  const changed = [
    { id: 'Q1', title: 'one (revised)', options: [{ text: 'A', recommended: true }] },
    { id: 'Q2', title: 'two', options: [{ text: 'A', recommended: true }] },
  ]
  const nextRevision = (await state(b, session)).json.revision
  const again = await post(b, { action: 'publish', kind: 'decision', items: changed, revision: nextRevision }, headers)
  assert.equal(again.json.updated, 1)
  assert.equal(again.json.kept, 1)
  assert.deepEqual(again.json.decisions.map((d) => d.status), ['confirmed', 'confirmed'])
  assert.deepEqual(again.json.decisions.map((d) => d.answer), ['A', 'A'])
})

test('tool schemas do not expose the ignored lifecycle inputs', async () => {
  const b = boot()
  const props = (name) => Object.keys(b.tools.get(name).parameters.properties.items.items.properties)
  for (const name of ['better_plan_publish_decisions', 'better_plan_publish_items']) {
    assert.ok(!props(name).includes('status'), `${name} must not accept status`)
    assert.ok(!props(name).includes('answer'), `${name} must not accept answer`)
  }
})

test('a chat question without publishing raises one correction note', async () => {
  const b = boot()
  const sessionId = 'session-notice'
  const prompts = []
  const agent = {
    session: { id: sessionId },
    ctx: { get: (name) => (name === 'systemPrompt' ? { section: (options) => { prompts.push(options); return () => {} } } : undefined) },
  }
  for (const handler of b.listeners.get('agent/created') || []) handler({ agent })
  const text = () => prompts[0].text({ scope: agent })
  const fire = (type, data) => {
    for (const handler of b.listeners.get('session/event') || []) handler({ id: sessionId }, { type, data })
  }

  assert.doesNotMatch(text(), /NOTE:/)
  fire('user/message', {})
  fire('assistant/message', { message: { content: [{ type: 'text', text: 'Q1 — 存储格式：A. SQLite B. Postgres？' }] } })
  assert.match(text(), /NOTE:/)

  // A real publish clears the note.
  fire('tool/call', { name: 'better_plan_publish_decisions' })
  assert.doesNotMatch(text(), /NOTE:/)
})

test('a short factual answer never raises the note', async () => {
  const b = boot()
  const sessionId = 'session-notice-short'
  const prompts = []
  const agent = {
    session: { id: sessionId },
    ctx: { get: () => ({ section: (options) => { prompts.push(options); return () => {} } }) },
  }
  for (const handler of b.listeners.get('agent/created') || []) handler({ agent })
  const fire = (type, data) => {
    for (const handler of b.listeners.get('session/event') || []) handler({ id: sessionId }, { type, data })
  }
  fire('user/message', {})
  fire('assistant/message', { message: { content: [{ type: 'text', text: '可以，当前状态是干净的。' }] } })
  assert.doesNotMatch(prompts[0].text({ scope: agent }), /NOTE:/)
})

test('the /better-plan and /better-plan-off commands are the icon twins', async () => {
  const b = boot()
  const sessionId = 'session-command'
  const prompts = []
  const agent = {
    session: { id: sessionId },
    ctx: { get: () => ({ section: (options) => { prompts.push(options); return () => {} } }) },
  }
  for (const handler of b.listeners.get('agent/created') || []) handler({ agent })
  const text = () => prompts[0].text({ scope: agent })

  assert.match(text(), /You are operating with better-plan/)
  b.commands.get('better-plan-off').handler({ agent, rawInput: '' })
  assert.equal(text(), '')
  b.commands.get('better-plan').handler({ agent, rawInput: '' })
  assert.match(text(), /You are operating with better-plan/)
})

test('a session gets the full discipline once per on-period, then a reminder', async () => {
  const b = boot()
  const sessionId = 'session-two-tier'
  const prompts = []
  const agent = {
    session: { id: sessionId },
    ctx: { get: () => ({ section: (options) => { prompts.push(options); return () => {} } }) },
  }
  for (const handler of b.listeners.get('agent/created') || []) handler({ agent })
  const text = () => prompts[0].text({ scope: agent })

  assert.match(text(), /You are operating with better-plan/)
  const second = text()
  assert.match(second, /BP reminder/)
  assert.doesNotMatch(second, /You are operating with better-plan/)

  // Off and on again starts a new period, so the full text comes back once.
  b.commands.get('better-plan-off').handler({ agent, rawInput: '' })
  b.commands.get('better-plan').handler({ agent, rawInput: '' })
  assert.match(text(), /You are operating with better-plan/)

  // Other sessions keep their own injection state.
  const otherPrompts = []
  const other = {
    session: { id: 'session-two-tier-other' },
    ctx: { get: () => ({ section: (options) => { otherPrompts.push(options); return () => {} } }) },
  }
  for (const handler of b.listeners.get('agent/created') || []) handler({ agent: other })
  assert.match(otherPrompts[0].text({ scope: other }), /You are operating with better-plan/)
})

test('hiding the input icon does not disable the mode', async () => {
  const b = boot({ showInputIcon: false })
  const sessionId = 'session-hidden-icon'
  const prompts = []
  const agent = {
    session: { id: sessionId },
    ctx: { get: () => ({ section: (options) => { prompts.push(options); return () => {} } }) },
  }
  for (const handler of b.listeners.get('agent/created') || []) handler({ agent })
  assert.match(prompts[0].text({ scope: agent }), /You are operating with better-plan/)
})

test('the chat message behind a question batch lands in the timeline first', async () => {
  const b = boot()
  const session = { 'x-better-plan-session': 'session-message-entry' }
  const token = (await state(b, session)).json.token
  for (const handler of b.listeners.get('session/event') || []) {
    handler({ id: 'session-message-entry' }, {
      type: 'user/message',
      data: { role: 'user', content: [{ type: 'text', text: '帮我做个插件' }] },
    })
  }
  const res = await post(b, {
    action: 'publish', kind: 'decision',
    items: [{ id: 'Q1', title: 'one', options: [{ text: 'A', recommended: true }] }],
  }, { ...session, 'x-better-plan-token': token })
  assert.equal(res.status, 200)
  assert.equal(res.json.timeline[0].kind, 'message')
  assert.equal(res.json.timeline[0].text, '帮我做个插件')
  assert.equal(res.json.timeline[1].kind, 'questions')
})
