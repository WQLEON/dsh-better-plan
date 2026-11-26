window.__ModuleLoader__.load({
  id: 'better-plan',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const ROUTE_TOGGLE = '/plugins/better-plan/toggle'
    const ROUTE_STATE = '/plugins/better-plan/state'
    const TAB_ID = 'better-plan/tab'
    const TAB_KIND = 'better-plan'
    /* DSH's own locale service drives every string, so the panel follows the
       interface language the user picked in DSH — not the browser's language. */
    let lang = 'en'
    const langListeners = new Set()
    const subscribeLang = (fn) => { langListeners.add(fn); return () => langListeners.delete(fn) }
    const setLang = (next) => {
      const normalised = typeof next === 'string' && next.startsWith('zh') ? 'zh' : 'en'
      if (normalised === lang) return
      lang = normalised
      for (const fn of langListeners) { try { fn() } catch { /* ignore */ } }
    }

    /* [zh, en] pairs. Reading `T.key` resolves against the live language. */
    const DICT = {
      panel: ['决策面板', 'Decision panel'],
      tab: ['决策面板', 'Decision panel'],
      guide: ['决策面板', 'Decision panel'],
      iconOn: ['better-plan 已开启｜左键：关闭　右键：打开决策面板', 'better-plan on｜Left-click: turn off　Right-click: open the decision panel'],
      iconOff: ['better-plan 已关闭｜左键：开启　右键：打开决策面板', 'better-plan off｜Left-click: turn on　Right-click: open the decision panel'],
      asking: ['阶段一 · 提问', 'Phase 1 · Asking'],
      planning: ['阶段二 · 计划', 'Phase 2 · Plan'],
      questions: ['提问', 'Ask'],
      plan: ['计划', 'Plan'],
      emptyQuestions: ['还没有问题。智能体提出问题时会把可点选项发布到这里。', 'No questions yet. Clickable options appear here when the agent publishes them.'],
      emptyPlan: ['还没有计划。所有问题确认后，智能体会发布有序计划。', 'No plan yet. It appears once every question is settled.'],
      confirmAll: ['全部确认', 'Confirm all'],
      extraLabel: ['其他要求', 'Other requirements'],
      extraPlaceholder: ['如果还有别的想法或要求，写在这里；智能体会据此继续追问并更新计划', 'Anything else you want? The agent will ask follow-ups and revise the plan.'],
      extraHint: ['提交后不会立即实施：智能体会先追问并更新计划，需要你再确认一次', 'Nothing is implemented yet: the agent asks follow-ups and revises the plan for another confirmation.'],
      submitWithExtra: ['提交其他要求', 'Submit requirements'],
      other: ['其他想法…', 'Other idea…'],
      back: ['用推荐选项', 'Use the recommended option'],
      custom: ['输入你的答案', 'Type your answer'],
      refresh: ['刷新', 'Refresh'],
      confirmed: ['已确认', 'Confirmed'],
      rejected: ['已拒绝', 'Rejected'],
      pending: ['待确认', 'Pending'],
      chosen: ['已选答案', 'Chosen'],
      allDone: ['全部确认完毕', 'Everything is confirmed'],
      settings: ['设置', 'Settings'],
      defOn: ['默认开启 Better Plan 模式', 'Default Better Plan mode'],
      minPerRound: ['每轮最少问题数', 'Min questions / round'],
      maxPerRound: ['每轮最多问题数', 'Max questions / round'],
      minTotal: ['问题总量下限', 'Min questions in total'],
      autoOpen: ['有待确认时自动展开面板', 'Auto-open the panel when items arrive'],
      save: ['保存设置', 'Save settings'],
      saved: ['已保存', 'Saved'],
      saveFailed: ['已应用（配置未能写入）', 'Applied (config not written)'],
    }

    const T = new Proxy({}, {
      get: (_target, key) => {
        const pair = DICT[key]
        if (!pair) return undefined
        return lang === 'zh' ? pair[0] : pair[1]
      },
    })

    /* Re-render a component whenever the interface language changes. */
    function useLang() {
      const [, bump] = React.useState(0)
      React.useEffect(() => subscribeLang(() => bump((n) => n + 1)), [])
    }

    function get(path, fallback) {
      return fetch(path, { method: 'GET', headers: { accept: 'application/json' } })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => (d == null ? fallback : d))
        .catch(() => fallback)
    }
    function post(path, body) {
      return fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        .then((r) => (r.ok ? r.json() : null))
    }

    /* DSH's own plan-outline icon (16×16, regular weight). */
    function PlanIcon({ size = 16 }) {
      return h('svg', {
        xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 16 16',
        width: size, height: size, fill: 'none', strokeWidth: 1,
        'aria-hidden': true, style: { display: 'block', flex: '0 0 auto' },
      },
        h('path', { d: 'M4.9375 5.90295H11.0625', stroke: 'currentColor' }),
        h('path', { d: 'M4.9375 9.02991H8.27841', stroke: 'currentColor' }),
        h('path', { d: 'M12.5 1.32617C13.3039 1.32617 14 1.95171 14 2.77637V7.61328L13 8.68164V2.77637C13 2.55186 12.7997 2.32617 12.5 2.32617H3.5C3.1993 2.32617 3 2.55186 3 2.77637V13.2246C3.00044 13.4489 3.19963 13.6738 3.5 13.6738H8.32812L7.39258 14.6738H3.5C2.69637 14.6738 2.00042 14.0489 2 13.2246V2.77637C2 1.95171 2.69613 1.32617 3.5 1.32617H12.5Z', fill: 'currentColor' }),
        h('path', { d: 'M8.97212 14.3693C9.17511 14.5723 9.37811 14.7753 9.5811 14.9783C9.67112 14.8953 9.75914 14.8123 9.84815 14.7293C11.4505 13.2352 13.0528 11.7411 14.6551 10.247C14.7441 10.164 14.8331 10.081 14.9221 9.99803C14.5989 9.6748 14.2756 9.35157 13.9524 9.02834C13.8694 9.11736 13.7864 9.20637 13.7034 9.29539C12.2093 10.8977 10.7152 12.5 9.22113 14.1023C9.13813 14.1913 9.05513 14.2803 8.97212 14.3693Z', fill: 'currentColor' }),
        h('path', { d: 'M11.6323 13.7841C11.6323 14.0395 11.6323 14.295 11.6323 14.5504C11.6812 14.5523 11.7301 14.5543 11.779 14.5562C12.659 14.5913 13.539 14.6263 14.419 14.6614C14.4679 14.6633 14.5168 14.6653 14.5657 14.6672C14.5657 14.3339 14.5657 14.0006 14.5657 13.6672C14.5168 13.6692 14.4679 13.6711 14.419 13.6731C13.539 13.7081 12.659 13.7432 11.779 13.7783C11.7301 13.7802 11.6812 13.7821 11.6323 13.7841Z', fill: 'currentColor' })
      )
    }

    /* One style for every section heading — including 其他要求 — so the three
       can never drift apart. */
    const sectionHeading = { margin: '0 0 8px', fontSize: 13, fontWeight: 600, lineHeight: 1.5, color: 'inherit' }

    const btnBase = {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      borderRadius: 8, fontSize: 12, lineHeight: 1, cursor: 'pointer',
      padding: '7px 14px', border: '1px solid var(--dsw-alias-border-l1, transparent)',
    }
    const primaryBtn = { ...btnBase, background: 'var(--dsw-alias-state-business-primary)', color: 'var(--dsw-alias-label-on-color)', borderColor: 'transparent', fontWeight: 600 }
    const ghostBtn = { ...btnBase, background: 'transparent', color: 'var(--dsw-alias-label-secondary, inherit)' }

    /* Status chips mix the theme's state colour with the surface, so they
       adapt to light and dark instead of painting a fixed tint. */
    function statusStyle(s) {
      const base = { fontSize: 11, padding: '2px 7px', borderRadius: 10, fontWeight: 600 }
      const tint = (token) => `color-mix(in srgb, var(${token}) 15%, transparent)`
      if (s === 'confirmed') {
        return {
          ...base,
          background: tint('--dsw-alias-state-success-primary'),
          color: 'var(--dsw-alias-state-success-primary)',
        }
      }
      if (s === 'rejected') {
        return {
          ...base,
          background: tint('--dsw-alias-state-error-primary'),
          color: 'var(--dsw-alias-state-error-primary)',
        }
      }
      return {
        ...base,
        background: 'var(--dsw-alias-state-business-tertiary)',
        color: 'var(--dsw-alias-state-business-primary)',
      }
    }
    function statusLabel(s) { return s === 'confirmed' ? T.confirmed : s === 'rejected' ? T.rejected : T.pending }

    /* ---------- the single icon button ---------- */
    function PlanIconButton({ feature, openPanel }) {
      useLang()
      const [enabled, setEnabled] = React.useState(true)
      const [pending, setPending] = React.useState(0)
      const [busy, setBusy] = React.useState(false)

      React.useEffect(() => {
        let alive = true
        const load = () => get(ROUTE_STATE, null).then((d) => {
          if (!alive || !d) return
          setEnabled(d.enabled !== false)
          setPending(typeof d.pendingCount === 'number' ? d.pendingCount : 0)
        })
        load()
        const timer = setInterval(load, 3000)
        return () => { alive = false; clearInterval(timer) }
      }, [])

      const onClick = async () => {
        if (busy) return
        setBusy(true)
        try {
          const next = await feature.setEnabled(!enabled)
          if (typeof next === 'boolean') setEnabled(next)
        } finally { setBusy(false) }
      }

      return h('button', {
        type: 'button',
        'aria-label': enabled ? T.iconOn : T.iconOff,
        'aria-pressed': enabled,
        title: enabled ? T.iconOn : T.iconOff,
        disabled: busy,
        onClick,
        onContextMenu: (e) => { e.preventDefault(); openPanel() },
        style: {
          position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 28, height: 28, padding: 0, border: 'none', borderRadius: 6,
          background: 'transparent', cursor: busy ? 'progress' : 'pointer',
          opacity: busy ? 0.6 : 1,
          color: enabled
            ? 'var(--dsw-alias-state-business-primary)'
            : 'var(--dsw-alias-label-tertiary)',
          transition: 'color .15s',
        },
      },
        h(PlanIcon, { size: 16 }),
        pending > 0 ? h('span', {
          'aria-hidden': true,
          style: {
            position: 'absolute', top: -2, right: -3, minWidth: 14, height: 14,
            padding: '0 3px', borderRadius: 7, background: 'var(--dsw-alias-state-business-primary)',
            color: 'var(--dsw-alias-label-on-color)', fontSize: 9, fontWeight: 700, lineHeight: '14px', textAlign: 'center',
          },
        }, pending > 99 ? '99+' : String(pending)) : null
      )
    }

    /* ---------- one question / plan item: selection only, no submit ---------- */
    function ItemCard({ item, kind, draft, onDraft }) {
      useLang()
      const settled = item.status !== 'pending'
      const options = Array.isArray(item.options) ? item.options : []
      const recommendedIndex = Math.max(0, options.findIndex((o) => o.recommended))
      // '' means "not chosen"; only the explicit '1' flag selects the custom row.
      const other = draft?.other === '1'
      const selected = typeof draft?.selected === 'number' ? draft.selected : recommendedIndex

      /* Merge one patch into this item's draft. `other` and `selected` are
         mutually exclusive: picking an option clears the custom answer and
         picking "其他想法" clears the option selection. */
      const setDraft = (patch) => onDraft(item.id, {
        selected,
        other: other ? '1' : '',
        value: draft?.value || '',
        ...patch,
      })

      return h('div', {
        style: {
          border: '1px solid var(--dsw-alias-border-l1, transparent)', borderRadius: 10,
          padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
          background: 'var(--dsw-alias-bg-layer-1, transparent)', opacity: settled ? 0.72 : 1,
        },
      },
        /* One line: "Q1 question content". Title is only a fallback when a
           question body is absent; never fall back to `detail` — the plan row
           below already renders it. */
        h('div', { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 } },
          h('strong', { style: { fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.5 } },
            `${item.id}  ${item.question || item.title || ''}`),
          h('span', { style: { ...statusStyle(item.status), flex: '0 0 auto' } }, statusLabel(item.status))
        ),

        /* Radio rows. Options never fold away: choosing "其他想法" adds one more
           row with an input directly beneath it, and every option stays visible. */
        !settled && options.length > 0 ? h('div', { role: 'radiogroup', style: { display: 'flex', flexDirection: 'column', gap: 6 } },
          options.map((opt, i) => {
            const on = i === selected && !other
            return h('button', {
              key: 'opt-' + i,
              type: 'button', role: 'radio', 'aria-checked': on,
              onClick: () => setDraft({ selected: i, other: '' }),
              style: {
                display: 'flex', alignItems: 'flex-start', gap: 8, textAlign: 'left',
                padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
                border: '1px solid ' + (on ? 'var(--dsw-alias-state-business-primary)' : 'var(--dsw-alias-border-l1)'),
                background: on ? 'var(--dsw-alias-state-business-tertiary)' : 'transparent',
                color: 'inherit', fontSize: 12, lineHeight: 1.5,
              },
            },
              h('span', {
                'aria-hidden': true,
                style: {
                  flex: '0 0 auto', width: 14, height: 14, borderRadius: '50%', marginTop: 2,
                  border: '1px solid ' + (on ? 'var(--dsw-alias-state-business-primary)' : 'var(--dsw-alias-border-l2)'),
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                },
              }, on ? h('span', { style: { width: 7, height: 7, borderRadius: '50%', background: 'var(--dsw-alias-state-business-primary)' } }) : null),
              h('span', null, opt.text)
            )
          }),

          /* The "other" row: same radio geometry, then its input sits below it. */
          h('button', {
            type: 'button', role: 'radio', 'aria-checked': other,
            onClick: () => setDraft({ other: other ? '' : '1', value: draft?.value || '' }),
            style: {
              display: 'flex', alignItems: 'flex-start', gap: 8, textAlign: 'left',
              padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
              border: '1px solid ' + (other ? 'var(--dsw-alias-state-business-primary)' : 'var(--dsw-alias-border-l1)'),
              background: other ? 'var(--dsw-alias-state-business-tertiary)' : 'transparent',
              color: 'inherit', fontSize: 12, lineHeight: 1.5, opacity: other ? 1 : 0.8,
            },
          },
            h('span', {
              'aria-hidden': true,
              style: {
                flex: '0 0 auto', width: 14, height: 14, borderRadius: '50%', marginTop: 2,
                border: '1px solid ' + (other ? 'var(--dsw-alias-state-business-primary)' : 'var(--dsw-alias-border-l2)'),
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              },
            }, other ? h('span', { style: { width: 7, height: 7, borderRadius: '50%', background: 'var(--dsw-alias-state-business-primary)' } }) : null),
            h('span', null, T.other)
          ),

          other ? h('input', {
            type: 'text', value: draft?.value || '', placeholder: T.custom, autoFocus: true,
            onClick: (e) => e.stopPropagation(),
            onChange: (e) => setDraft({ other: '1', value: e.target.value }),
            style: {
              marginLeft: 22, width: 'calc(100% - 22px)', boxSizing: 'border-box',
              padding: '7px 10px', borderRadius: 8, fontSize: 12,
              border: '1px solid var(--dsw-alias-state-business-primary)',
              background: 'transparent', color: 'inherit', outline: 'none',
            },
          }) : null
        ) : null,

        /* Plan items: the detail is the proposal, plus one "其他想法" row with
           its input directly below. The detail never folds away. */
        !settled && kind === 'plan' && options.length === 0 ? h('div', { role: 'radiogroup', style: { display: 'flex', flexDirection: 'column', gap: 6 } },
          h('button', {
            type: 'button', role: 'radio', 'aria-checked': !other,
            onClick: () => setDraft({ other: '' }),
            style: {
              display: 'flex', alignItems: 'flex-start', gap: 8, textAlign: 'left',
              padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
              border: '1px solid ' + (!other ? 'var(--dsw-alias-state-business-primary)' : 'var(--dsw-alias-border-l1)'),
              background: !other ? 'var(--dsw-alias-state-business-tertiary)' : 'transparent',
              color: 'inherit', fontSize: 12, lineHeight: 1.5,
            },
          },
            h('span', {
              'aria-hidden': true,
              style: {
                flex: '0 0 auto', width: 14, height: 14, borderRadius: '50%', marginTop: 2,
                border: '1px solid ' + (!other ? 'var(--dsw-alias-state-business-primary)' : 'var(--dsw-alias-border-l2)'),
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              },
            }, !other ? h('span', { style: { width: 7, height: 7, borderRadius: '50%', background: 'var(--dsw-alias-state-business-primary)' } }) : null),
            h('span', { style: { whiteSpace: 'pre-wrap' } }, item.detail || '')
          ),
          h('button', {
            type: 'button', role: 'radio', 'aria-checked': other,
            onClick: () => setDraft({ other: other ? '' : '1', value: draft?.value || '' }),
            style: {
              display: 'flex', alignItems: 'flex-start', gap: 8, textAlign: 'left',
              padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
              border: '1px solid ' + (other ? 'var(--dsw-alias-state-business-primary)' : 'var(--dsw-alias-border-l1)'),
              background: other ? 'var(--dsw-alias-state-business-tertiary)' : 'transparent',
              color: 'inherit', fontSize: 12, lineHeight: 1.5, opacity: other ? 1 : 0.8,
            },
          },
            h('span', {
              'aria-hidden': true,
              style: {
                flex: '0 0 auto', width: 14, height: 14, borderRadius: '50%', marginTop: 2,
                border: '1px solid ' + (other ? 'var(--dsw-alias-state-business-primary)' : 'var(--dsw-alias-border-l2)'),
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              },
            }, other ? h('span', { style: { width: 7, height: 7, borderRadius: '50%', background: 'var(--dsw-alias-state-business-primary)' } }) : null),
            h('span', null, T.other)
          ),
          other ? h('input', {
            type: 'text', value: draft?.value || '', placeholder: T.custom, autoFocus: true,
            onClick: (e) => e.stopPropagation(),
            onChange: (e) => setDraft({ other: '1', value: e.target.value }),
            style: {
              marginLeft: 22, width: 'calc(100% - 22px)', boxSizing: 'border-box',
              padding: '7px 10px', borderRadius: 8, fontSize: 12,
              border: '1px solid var(--dsw-alias-state-business-primary)',
              background: 'transparent', color: 'inherit', outline: 'none',
            },
          }) : null
        ) : null,

        settled && item.answer
          ? h('div', { style: { fontSize: 12 } },
            h('span', { style: { opacity: 0.7, marginRight: 6 } }, `${T.chosen}:`), item.answer)
          : null
      )
    }

    /* ---------- settings block ---------- */
    function SettingsSection({ settings, onSave }) {
      useLang()
      const [open, setOpen] = React.useState(false)
      const [draft, setDraft] = React.useState(settings)
      const [msg, setMsg] = React.useState('')

      React.useEffect(() => { setDraft(settings) }, [settings])

      const field = (key, label, kind, min, max) => h('label', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 12 },
      },
        h('span', null, label),
        kind === 'bool'
          ? h('input', { type: 'checkbox', checked: draft[key] !== false, onChange: (e) => setDraft({ ...draft, [key]: e.target.checked }) })
          : h('input', {
            type: 'number', min, max, value: draft[key], onChange: (e) => setDraft({ ...draft, [key]: Number(e.target.value) }),
            style: { width: 64, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--dsw-alias-border-l1, transparent)', background: 'transparent', color: 'inherit', fontSize: 12 },
          })
      )

      return h('div', { style: { borderTop: '1px solid var(--dsw-alias-border-l1, transparent)', paddingTop: 10 } },
        h('button', {
          type: 'button',
          onClick: () => setOpen((v) => !v),
          style: { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, color: 'inherit', opacity: 0.75 },
        }, `${open ? '▾' : '▸'} ${T.settings}`),
        open ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 } },
          field('defaultEnabled', T.defOn, 'bool'),
          field('minPerRound', T.minPerRound, 'num', 3, 200),
          field('maxPerRound', T.maxPerRound, 'num', 1, 200),
          field('minTotal', T.minTotal, 'num', 0, 200),
          field('autoOpen', T.autoOpen, 'bool'),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
            h('button', {
              type: 'button', style: primaryBtn,
              onClick: async () => {
                const result = await onSave(draft)
                setMsg(result?.persisted === false ? T.saveFailed : T.saved)
              },
            }, T.save),
            msg ? h('span', { style: { fontSize: 11, opacity: 0.7 } }, msg) : null
          )
        ) : null
      )
    }

    /* ---------- the panel ---------- */
    function DecisionPanel({ sessionId }) {
      useLang()
      const [state, setState] = React.useState({
        mode: 'asking', enabled: true, decisions: [], plan: [], settings: {},
        pendingCount: 0, pendingDecisions: 0, pendingPlan: 0,
      })
      const [drafts, setDrafts] = React.useState({})
      const [extra, setExtra] = React.useState('')
      const [busy, setBusy] = React.useState(false)

      const load = React.useCallback(() => get(ROUTE_STATE, null).then((d) => { if (d) setState(d) }), [])
      React.useEffect(() => {
        let alive = true
        const tick = () => { if (alive && !busy) load() }
        tick()
        const timer = setInterval(tick, 2000)
        return () => { alive = false; clearInterval(timer) }
      }, [load, busy])

      const onDraft = React.useCallback((id, next) => {
        setDrafts((prev) => ({ ...prev, [id]: next }))
      }, [])

      /* Resolve the answer for one item from its draft or its default. */
      const answerOf = (item, kind) => {
        const draft = drafts[item.id]
        const options = Array.isArray(item.options) ? item.options : []
        const custom = draft && draft.other && typeof draft.value === 'string' ? draft.value.trim() : ''
        if (custom) return custom
        if (options.length > 0) {
          const idx = typeof draft?.selected === 'number' ? draft.selected : Math.max(0, options.findIndex((o) => o.recommended))
          return options[idx]?.text ?? ''
        }
        return kind === 'plan' ? (item.detail || '') : (item.recommended || '')
      }

      const confirmBatch = async () => {
        setBusy(true)
        try {
          const answers = {}
          for (const d of state.decisions || []) if (d.status === 'pending') answers[d.id] = answerOf(d, 'decision')
          for (const p of state.plan || []) if (p.status === 'pending') answers[p.id] = answerOf(p, 'plan')
          const typed = extra.trim()
          await post(ROUTE_STATE, {
            action: 'confirmAll', kind: 'all', answers,
            ...(typed ? { extra: typed } : {}),
            ...(typeof sessionId === 'string' && sessionId ? { sessionId } : {}),
          })
          setDrafts({})
          setExtra('')
          await load()
        } finally { setBusy(false) }
      }

      const saveSettings = async (next) => {
        const result = await post(ROUTE_STATE, { action: 'settings', settings: next })
        await load()
        return result
      }

      const decisions = state.decisions || []
      const plan = state.plan || []
      const pendingTotal = (state.pendingDecisions || 0) + (state.pendingPlan || 0)

      return h('div', { style: { padding: 16, display: 'flex', flexDirection: 'column', gap: 14, height: '100%', boxSizing: 'border-box', overflowY: 'auto' } },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } },
          h('h3', { style: { margin: 0, fontSize: 15 } }, T.panel),
          h('button', { type: 'button', style: ghostBtn, onClick: load, disabled: busy }, T.refresh)
        ),

        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
          h('span', { style: statusStyle('pending') }, state.mode === 'plan' ? T.planning : T.asking),
          pendingTotal === 0 && (decisions.length > 0 || plan.length > 0)
            ? h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-success, #2a0)' } }, T.allDone)
            : null
        ),

        h('div', null,
          h('h4', { style: sectionHeading }, T.questions),
          decisions.length === 0
            ? h('div', { style: { opacity: 0.7, fontSize: 12 } }, T.emptyQuestions)
            : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
              decisions.map((d) => h(ItemCard, { key: 'd-' + d.id, item: d, kind: 'decision', draft: drafts[d.id], onDraft }))
            )
        ),

        h('div', null,
          h('h4', { style: sectionHeading }, T.plan),
          plan.length === 0
            ? h('div', { style: { opacity: 0.7, fontSize: 12 } }, T.emptyPlan)
            : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
              plan.map((d) => h(ItemCard, { key: 'p-' + d.id, item: d, kind: 'plan', draft: drafts[d.id], onDraft }))
            )
        ),

        /* Extra requirements sit directly above the single confirm button:
           typing here keeps the loop open, so the agent asks again and
           revises the plan instead of implementing straight away. */
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 } },
          h('div', { style: sectionHeading }, T.extraLabel),
          h('textarea', {
            value: extra,
            placeholder: T.extraPlaceholder,
            rows: 2,
            onChange: (e) => setExtra(e.target.value),
            style: {
              width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: 12,
              borderRadius: 8, resize: 'vertical', minHeight: 46, fontFamily: 'inherit',
              border: '1px solid ' + (extra.trim()
                ? 'var(--dsw-alias-state-business-primary)'
                : 'var(--dsw-alias-border-l1)'),
              background: 'transparent', color: 'inherit', outline: 'none',
            },
          }),
          extra.trim() ? h('div', { style: { fontSize: 11, opacity: 0.7 } }, T.extraHint) : null
        ),

        /* THE single button: after every item has been reviewed, one click
           settles them all. */
        pendingTotal > 0 || extra.trim() ? h('button', {
          type: 'button',
          style: { ...primaryBtn, width: '100%', height: 40, fontSize: 13, marginTop: 2 },
          disabled: busy,
          onClick: confirmBatch,
        }, extra.trim() ? T.submitWithExtra : `${T.confirmAll}（${pendingTotal}）`) : null,

        h(SettingsSection, { settings: state.settings || {}, onSave: saveSettings })
      )
    }

    return {
      inject: ['slots', 'sidebarRightTabs', 'sidebarRight', 'locale'],
      apply(ctx) {
        // Follow the interface language the user picked in DSH.
        const locale = ctx.locale
        setLang(locale?.getSnapshot?.().active)
        ctx.effect(() => locale?.subscribe?.(() => setLang(locale.getSnapshot().active)),
          'better-plan: follow interface language')

        const openPanel = () => {
          try { ctx.sidebarRight.openTab(TAB_KIND) }
          catch (error) { console.warn('[better-plan] could not open panel', error) }
        }

        const feature = {
          setEnabled(next) {
            return post(ROUTE_TOGGLE, { enabled: next }).then((d) => (d ? d.enabled === true : undefined))
          },
        }

        ctx.effect(() => ctx.sidebarRightTabs.register({
          id: TAB_ID,
          kind: TAB_KIND,
          title: () => T.tab,
          guide: [{ id: 'better-plan', order: 100, title: () => T.guide }],
        }), 'better-plan: tab type')

        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab', key: TAB_ID,
          inject: (sessionId) => ({
            // The slot hands us the tab's session, but fall back to the panel's
            // on-screen session so a wake always has a real target.
            sessionId: (typeof sessionId === 'string' && sessionId)
              || ctx.sidebarRight?.mounted?.getSnapshot?.()
              || undefined,
          }),
        }, DecisionPanel)), 'better-plan: tab body')

        // Auto-open once per new batch, when the setting allows it.
        let lastAutoOpened = -1
        const checkAutoOpen = () => {
          get(ROUTE_STATE, null).then((d) => {
            if (!d || !d.settings || d.settings.autoOpen === false) return
            const rev = typeof d.revision === 'number' ? d.revision : -1
            if (d.pending === true && rev !== lastAutoOpened) {
              lastAutoOpened = rev
              openPanel()
            }
          })
        }
        checkAutoOpen()
        ctx.effect(() => {
          const timer = setInterval(checkAutoOpen, 2500)
          return () => clearInterval(timer)
        }, 'better-plan: auto-open panel')

        ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
          name: 'conversation.input.left', id: 'better-plan', order: 50,
          inject: () => ({ feature, openPanel }),
        }, PlanIconButton))
      },
    }
  },
})
