window.__ModuleLoader__.load({
  id: 'better-plan',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const ROUTE_TOGGLE = '/plugins/better-plan/toggle'
    const ROUTE_STATE = '/plugins/better-plan/state'
    const TAB_ID = 'better-plan/tab'
    const TAB_KIND = 'better-plan'
    const SESSION_HEADER = 'x-better-plan-session'
    const TOKEN_HEADER = 'x-better-plan-token'
    const REVISION_HEADER = 'x-better-plan-revision'
    const SINCE_HEADER = 'x-better-plan-since'
    const DRAFT_PREFIX = 'better-plan:drafts:'

    /* DSH's own locale service drives every string, so the panel follows the
       interface language the user picked in DSH — not the browser's language.
       UI copy lives here (the DSH convention for client bundles); locale/*.json
       carries only meta.title / meta.description / meta.detail. */
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
      iconOn: ['更好的计划模式已开启｜左键：关闭　右键：打开决策面板', 'better-plan on｜Left-click: turn off　Right-click: open the decision panel'],
      iconOff: ['更好的计划模式已关闭｜左键：开启　右键：打开决策面板', 'better-plan off｜Left-click: turn on　Right-click: open the decision panel'],
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
      custom: ['输入你的答案（Ctrl+Enter 提交）', 'Type your answer (Ctrl+Enter to submit)'],
      refresh: ['刷新', 'Refresh'],
      confirmed: ['已确认', 'Confirmed'],
      rejected: ['已拒绝', 'Rejected'],
      pending: ['待确认', 'Pending'],
      chosen: ['已选答案', 'Chosen'],
      allDone: ['全部确认完毕', 'Everything is confirmed'],
      settings: ['设置', 'Settings'],
      defOn: ['默认开启更好的计划模式', 'Default Better Plan mode'],
      minPerRound: ['每轮最少问题数', 'Min questions / round'],
      maxPerRound: ['每轮最多问题数', 'Max questions / round'],
      minTotal: ['问题总量下限', 'Min questions in total'],
      autoOpen: ['有待确认时自动展开面板', 'Auto-open the panel when items arrive'],
      save: ['保存设置', 'Save settings'],
      saved: ['已保存', 'Saved'],
      saveFailed: ['已应用（配置未能写入）', 'Applied (config not written)'],
      reset: ['重置本会话面板', 'Reset this session'],
      resetConfirm: ['再点一次确认清空', 'Click again to clear'],
      resetDone: ['已清空', 'Cleared'],
      wakeFailed: ['已确认，但没能唤醒智能体；请手动发送任意消息', 'Confirmed, but the agent could not be woken — send any message to continue'],
      conflict: ['面板内容已更新，请重新查看后再确认', 'The panel was updated — review it again before confirming'],
      loadFailed: ['无法读取面板状态，稍后自动重试', 'Could not read the panel state; retrying automatically'],
      writeFailed: ['提交失败，请稍后重试', 'Submit failed — try again'],
      retry: ['重试', 'Retry'],
      notScoped: ['未绑定会话，显示默认面板', 'No session bound — showing the default panel'],
      unanswered: ['待确认', 'pending'],
      resetHint: ['只清空本会话的内容，不影响其他窗口', 'Clears only this session, never other windows'],
      partial: ['内容较多，超出部分被截断', 'Content was truncated to fit the panel'],
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

    /* ------------------------------------------------------------- transport */

    async function request(path, { method = 'GET', sessionId, token, revision, since, body } = {}) {
      const headers = { accept: 'application/json' }
      if (sessionId) headers[SESSION_HEADER] = sessionId
      if (token) headers[TOKEN_HEADER] = token
      if (revision != null) headers[REVISION_HEADER] = String(revision)
      if (since != null) headers[SINCE_HEADER] = String(since)
      if (body !== undefined) headers['content-type'] = 'application/json'
      try {
        const response = await fetch(path, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        })
        const data = response.status === 304 ? null : await response.json().catch(() => null)
        return { ok: response.ok, status: response.status, data }
      } catch (error) {
        return { ok: false, status: 0, data: null, error }
      }
    }

    /* ---------------------------------------------------------- shared state */

    /**
     * Polls the panel state for one session. `since` makes the common case a
     * 304 with no body, so an idle panel costs one tiny request per tick.
     */
    function usePanelState(sessionId, { interval = 2500, paused = false } = {}) {
      useLang()
      const [state, setState] = React.useState(null)
      const [error, setError] = React.useState('')
      const revisionRef = React.useRef(null)
      const sessionRef = React.useRef(sessionId)
      const pausedRef = React.useRef(paused)
      pausedRef.current = paused

      const adopt = React.useCallback((data) => {
        if (!data) return
        revisionRef.current = data.revision
        setState(data)
        setError('')
      }, [])

      const reload = React.useCallback(async ({ force = false } = {}) => {
        const result = await request(ROUTE_STATE, {
          sessionId,
          since: force ? null : revisionRef.current,
        })
        if (result.status === 304) return result
        if (!result.ok || !result.data) {
          setError('load')
          return result
        }
        adopt(result.data)
        return result
      }, [adopt, sessionId])

      React.useEffect(() => {
        if (sessionRef.current !== sessionId) {
          // A different conversation: never show another session's panel.
          sessionRef.current = sessionId
          revisionRef.current = null
          setState(null)
        }
        let alive = true
        const tick = () => {
          if (!alive || pausedRef.current) return
          if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
          reload()
        }
        tick()
        const timer = setInterval(tick, interval)
        return () => { alive = false; clearInterval(timer) }
      }, [interval, reload, sessionId])

      return { state, error, reload, revisionRef, adopt }
    }

    function tokenOf(state) {
      return state && typeof state.token === 'string' ? state.token : ''
    }

    /* --------------------------------------------------------------- styling */

    const sectionHeading = { margin: '0 0 8px', fontSize: 13, fontWeight: 600, lineHeight: 1.5, color: 'inherit' }
    const btnBase = {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      borderRadius: 8, fontSize: 12, lineHeight: 1, cursor: 'pointer',
      padding: '7px 14px', border: '1px solid var(--dsw-alias-border-l1, transparent)',
    }
    const primaryBtn = { ...btnBase, background: 'var(--dsw-alias-state-business-primary)', color: 'var(--dsw-alias-label-on-color)', borderColor: 'transparent', fontWeight: 600 }
    const ghostBtn = { ...btnBase, background: 'transparent', color: 'var(--dsw-alias-label-secondary, inherit)' }
    const dangerBtn = { ...ghostBtn, color: 'var(--dsw-alias-state-error-primary, inherit)' }

    const visuallyHidden = {
      position: 'absolute', width: 1, height: 1, margin: -1, padding: 0,
      overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
    }

    function ErrorBanner({ message, onRetry }) {
      if (!message) return null
      return h('div', {
        role: 'alert',
        style: {
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          padding: '7px 10px', borderRadius: 8, fontSize: 12,
          border: '1px solid var(--dsw-alias-state-error-primary)',
          color: 'var(--dsw-alias-state-error-primary)',
        },
      },
        h('span', null, message),
        onRetry ? h('button', { type: 'button', onClick: onRetry, style: { ...ghostBtn, padding: '4px 8px' } }, T.retry) : null
      )
    }

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

    /* ------------------------------------------------------------ icon button */

    function PlanIconButton({ feature, openPanel, sessionId }) {
      useLang()
      const [enabled, setEnabled] = React.useState(true)
      const [pending, setPending] = React.useState(0)
      const [busy, setBusy] = React.useState(false)
      const tokenRef = React.useRef('')

      const revisionRef = React.useRef(null)
      React.useEffect(() => {
        let alive = true
        const load = async () => {
          // One request per tick: /state already carries enabled and the token.
          if (sessionId) {
            const result = await request(ROUTE_STATE, { sessionId, since: revisionRef.current })
            if (!alive || result.status === 304) return
            if (!result.ok || !result.data) return
            revisionRef.current = result.data.revision
            setEnabled(result.data.enabled !== false)
            tokenRef.current = typeof result.data.token === 'string' ? result.data.token : ''
            setPending(typeof result.data.pendingCount === 'number' ? result.data.pendingCount : 0)
            return
          }
          const toggle = await request(ROUTE_TOGGLE)
          if (!alive || !toggle.ok || !toggle.data) return
          setEnabled(toggle.data.enabled !== false)
          tokenRef.current = typeof toggle.data.token === 'string' ? toggle.data.token : ''
          setPending(0)
        }
        load()
        const timer = setInterval(load, 3000)
        return () => { alive = false; clearInterval(timer) }
      }, [sessionId])

      const onClick = async () => {
        if (busy) return
        setBusy(true)
        try {
          const result = await feature.setEnabled(!enabled, tokenRef.current)
          if (typeof result === 'boolean') setEnabled(result)
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

    /* -------------------------------------------------------------- one item */

    function ItemCard({ item, kind, draft, onDraft }) {
      useLang()
      const settled = item.status !== 'pending'
      const options = Array.isArray(item.options) ? item.options : []
      const rows = kind === 'plan' && options.length === 0
        ? [{ text: item.detail || '', isOther: false }]
        : options.map((option) => ({ text: option.text, isOther: false }))
      const recommendedIndex = Math.max(0, options.findIndex((o) => o.recommended))
      const other = draft?.other === '1'
      const selected = typeof draft?.selected === 'number' ? draft.selected : recommendedIndex
      const activeRow = other ? rows.length : selected
      const rowRefs = React.useRef([])

      const setDraft = (patch) => onDraft(item.id, {
        selected,
        other: other ? '1' : '',
        value: draft?.value || '',
        ...patch,
      })

      const focusRow = (index) => {
        const target = rowRefs.current[index]
        if (target && typeof target.focus === 'function') target.focus()
      }
      const onRowKeyDown = (event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          const next = event.key === 'ArrowDown'
            ? (activeRow + 1) % (rows.length + 1)
            : (activeRow - 1 + rows.length + 1) % (rows.length + 1)
          focusRow(next)
          if (next === rows.length) setDraft({ other: '1', selected })
          else setDraft({ selected: next, other: '' })
        }
      }

      const radio = ({ row, index, on, onSelect, label, extra }) => h('button', {
        key: 'row-' + index,
        ref: (node) => { rowRefs.current[index] = node },
        type: 'button', role: 'radio', 'aria-checked': on,
        tabIndex: index === activeRow ? 0 : -1,
        onClick: onSelect,
        onKeyDown: onRowKeyDown,
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
        h('span', { style: extra ? { whiteSpace: 'pre-wrap' } : null }, label)
      )

      const body = []
      if (!settled && rows.length > 0) {
        body.push(h('div', { key: 'rows', role: 'radiogroup', 'aria-label': item.title || item.id, style: { display: 'flex', flexDirection: 'column', gap: 6 } },
          rows.map((row, index) => radio({
            row: rows[index], index, on: index === selected && !other, label: row.text,
            onSelect: () => setDraft({ selected: index, other: '' }),
          })),
          radio({
            row: null, index: rows.length, on: other, label: T.other,
            onSelect: () => setDraft({ other: other ? '' : '1', value: draft?.value || '' }),
          }),
          other ? h('textarea', {
            key: 'custom',
            value: draft?.value || '',
            placeholder: T.custom,
            rows: 2,
            autoFocus: true,
            onChange: (e) => setDraft({ other: '1', value: e.target.value }),
            style: {
              marginLeft: 22, width: 'calc(100% - 22px)', boxSizing: 'border-box',
              padding: '7px 10px', borderRadius: 8, fontSize: 12, resize: 'vertical',
              fontFamily: 'inherit', minHeight: 46,
              border: '1px solid var(--dsw-alias-state-business-primary)',
              background: 'transparent', color: 'inherit', outline: 'none',
            },
          }) : null
        ))
      }
      if (settled && item.answer && item.answer !== item.detail) {
        body.push(h('div', { key: 'answer', style: { fontSize: 12 } },
          h('span', { style: { opacity: 0.7, marginRight: 6 } }, T.chosen + ':'), item.answer))
      }

      return h('div', {
        style: {
          border: '1px solid var(--dsw-alias-border-l1, transparent)', borderRadius: 10,
          padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
          background: 'var(--dsw-alias-bg-layer-1, transparent)', opacity: settled ? 0.72 : 1,
        },
      },
        h('div', { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 } },
          h('strong', { style: { fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.5 } },
            `${item.id}  ${item.question || item.title || ''}`),
          h('span', { style: { ...statusStyle(item.status), flex: '0 0 auto' } }, statusLabel(item.status))
        ),
        body
      )
    }

    /* --------------------------------------------------------------- settings */

    function SettingsSection({ settings, onSave }) {
      useLang()
      const [open, setOpen] = React.useState(false)
      const [draft, setDraft] = React.useState(settings)
      const [msg, setMsg] = React.useState('')

      React.useEffect(() => { setDraft(settings) }, [settings])

      const field = (key, label, kind, min, max) => h('label', {
        key,
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 12 },
      },
        h('span', null, label),
        kind === 'bool'
          ? h('input', { type: 'checkbox', checked: draft[key] !== false, onChange: (e) => setDraft({ ...draft, [key]: e.target.checked }) })
          : h('input', {
            type: 'number', min, max, value: draft[key],
            onChange: (e) => setDraft({ ...draft, [key]: Number(e.target.value) }),
            style: { width: 64, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--dsw-alias-border-l1, transparent)', background: 'transparent', color: 'inherit', fontSize: 12 },
          })
      )

      return h('div', { style: { borderTop: '1px solid var(--dsw-alias-border-l1, transparent)', paddingTop: 10 } },
        h('button', {
          type: 'button',
          'aria-expanded': open,
          onClick: () => setOpen((v) => !v),
          style: { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, color: 'inherit', opacity: 0.75 },
        }, `${open ? '▾' : '▸'} ${T.settings}`),
        open ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 } },
          field('defaultEnabled', T.defOn, 'bool'),
          field('minPerRound', T.minPerRound, 'num', 3, 200),
          field('maxPerRound', T.maxPerRound, 'num', 3, 200),
          field('minTotal', T.minTotal, 'num', 0, 200),
          field('autoOpen', T.autoOpen, 'bool'),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
            h('button', {
              type: 'button', style: primaryBtn,
              onClick: async () => {
                const result = await onSave(draft)
                setMsg(result && result.persisted === false ? T.saveFailed : result && result.ok ? T.saved : T.writeFailed)
              },
            }, T.save),
            msg ? h('span', { role: 'status', style: { fontSize: 11, opacity: 0.7 } }, msg) : null
          )
        ) : null
      )
    }

    /* ----------------------------------------------------------------- panel */

    function DecisionPanel({ sessionId }) {
      useLang()
      const [busy, setBusy] = React.useState(false)
      const { state, error, reload, revisionRef, adopt } = usePanelState(sessionId, { paused: busy })
      const [drafts, setDrafts] = React.useState({})
      const [extra, setExtra] = React.useState('')
      const [notice, setNotice] = React.useState('')
      const [resetArmed, setResetArmed] = React.useState(false)
      const draftKey = DRAFT_PREFIX + (sessionId || 'default')

      // Drafts survive a panel remount (same tab, same session).
      React.useEffect(() => {
        try {
          const raw = sessionStorage.getItem(draftKey)
          if (!raw) return
          const saved = JSON.parse(raw)
          if (saved && typeof saved === 'object') {
            if (saved.items && typeof saved.items === 'object') setDrafts(saved.items)
            if (typeof saved.extra === 'string') setExtra(saved.extra)
          }
        } catch { /* storage unavailable */ }
      }, [draftKey])

      React.useEffect(() => {
        try { sessionStorage.setItem(draftKey, JSON.stringify({ items: drafts, extra })) } catch { /* quota */ }
      }, [draftKey, drafts, extra])

      const onDraft = React.useCallback((id, next) => {
        setDrafts((prev) => ({ ...prev, [id]: next }))
      }, [])

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

      const submit = async (body) => {
        setBusy(true)
        setNotice('')
        try {
          const result = await request(ROUTE_STATE, {
            method: 'POST',
            sessionId,
            token: tokenOf(state),
            revision: revisionRef.current,
            body,
          })
          if (result.status === 409) {
            if (result.data) adopt(result.data)
            setNotice(T.conflict)
            return result
          }
          if (!result.ok || !result.data) {
            setNotice(T.writeFailed)
            return result
          }
          adopt(result.data)
          if (result.data.woken === false) setNotice(T.wakeFailed)
          return result
        } finally { setBusy(false) }
      }

      const confirmBatch = async () => {
        const answers = {}
        for (const d of state?.decisions || []) if (d.status === 'pending') answers[d.id] = answerOf(d, 'decision')
        for (const p of state?.plan || []) if (p.status === 'pending') answers[p.id] = answerOf(p, 'plan')
        const typed = extra.trim()
        const result = await submit({
          action: 'confirmAll', kind: 'all', answers,
          ...(typed ? { extra: typed } : {}),
        })
        if (result && result.ok) {
          setDrafts({})
          setExtra('')
          try { sessionStorage.removeItem(draftKey) } catch { /* ignore */ }
        }
      }

      const reset = async () => {
        if (!resetArmed) {
          setResetArmed(true)
          setTimeout(() => setResetArmed(false), 3000)
          return
        }
        setResetArmed(false)
        const result = await submit({ action: 'reset', revision: revisionRef.current })
        if (result && result.ok) {
          setDrafts({})
          setExtra('')
          try { sessionStorage.removeItem(draftKey) } catch { /* ignore */ }
        }
      }

      const saveSettings = async (next) => {
        const result = await request(ROUTE_STATE, {
          method: 'POST',
          sessionId,
          token: tokenOf(state),
          revision: revisionRef.current,
          body: { action: 'settings', settings: next },
        })
        if (result.ok && result.data) adopt(result.data)
        return result.ok ? { ok: true, persisted: result.data?.persisted !== false } : { ok: false }
      }

      const decisions = state?.decisions || []
      const plan = state?.plan || []
      const pendingTotal = state ? (state.pendingDecisions || 0) + (state.pendingPlan || 0) : 0
      const mode = state?.mode || 'asking'
      const announcement = state
        ? `${pendingTotal} ${T.unanswered}`
        : ''

      return h('div', {
        style: { height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' },
        onKeyDown: (event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && (pendingTotal > 0 || extra.trim())) {
            event.preventDefault()
            confirmBatch()
          }
        },
      },
        h('div', {
          style: { flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 14 },
        },
        h('div', { 'aria-live': 'polite', style: visuallyHidden }, announcement),
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } },
          h('h3', { style: { margin: 0, fontSize: 15 } }, T.panel),
          h('div', { style: { display: 'flex', gap: 6 } },
            h('button', { type: 'button', style: ghostBtn, onClick: () => reload({ force: true }), disabled: busy }, T.refresh),
            h('button', {
              type: 'button',
              style: resetArmed ? dangerBtn : ghostBtn,
              title: T.resetHint,
              onClick: reset,
              disabled: busy,
            }, resetArmed ? T.resetConfirm : T.reset)
          )
        ),

        error ? h(ErrorBanner, { message: T.loadFailed, onRetry: () => reload({ force: true }) }) : null,
        notice ? h('div', { role: 'alert', style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, notice) : null,
        state && state.sessionScoped === false ? h('div', { style: { fontSize: 11, opacity: 0.6 } }, T.notScoped) : null,

        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
          h('span', { style: statusStyle('pending') }, mode === 'plan' ? T.planning : T.asking),
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

        h(SettingsSection, { settings: state?.settings || {}, onSave: saveSettings })
        ),
        h('div', {
          style: { flex: 'none', borderTop: '1px solid var(--dsw-alias-border-l1, transparent)', background: 'var(--dsw-alias-bg-layer-1, transparent)', padding: '10px 16px 16px', display: 'flex', flexDirection: 'column', gap: 6 },
        },
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
          extra.trim() ? h('div', { style: { fontSize: 11, opacity: 0.7 } }, T.extraHint) : null,

        pendingTotal > 0 || extra.trim() ? h('button', {
          type: 'button',
          style: { ...primaryBtn, width: '100%', height: 40, fontSize: 13, marginTop: 2 },
          disabled: busy,
          'aria-busy': busy,
          onClick: confirmBatch,
        }, extra.trim() ? T.submitWithExtra : `${T.confirmAll}（${pendingTotal}）`) : null
        )
      )
    }

    /* ------------------------------------------------------------- placement */

    return {
      inject: ['slots', 'sidebarRightTabs', 'sidebarRight', 'locale'],
      apply(ctx) {
        // Follow the interface language the user picked in DSH.
        const locale = ctx.locale
        setLang(locale?.getSnapshot?.().active)
        ctx.effect(() => locale?.subscribe?.(() => setLang(locale.getSnapshot().active)),
          'better-plan: follow interface language')

        const currentSession = () => {
          try {
            const fromSidebar = ctx.sidebarRight?.mounted?.getSnapshot?.()
            if (typeof fromSidebar === 'string' && fromSidebar) return fromSidebar
            const sessions = ctx.get?.('sessions') ?? ctx.sessions
            const current = sessions?.getSnapshot?.()?.current
            return typeof current === 'string' && current ? current : undefined
          } catch { return undefined }
        }

        const openPanel = () => {
          try { ctx.sidebarRight.openTab(TAB_KIND) }
          catch (error) { console.warn('[better-plan] could not open panel', error) }
        }

        const feature = {
          async setEnabled(next, token) {
            const result = await request(ROUTE_TOGGLE, { method: 'POST', token, body: { enabled: next } })
            return result.ok && result.data ? result.data.enabled === true : undefined
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
            sessionId: (typeof sessionId === 'string' && sessionId) || currentSession(),
          }),
        }, DecisionPanel)), 'better-plan: tab body')

        // Auto-open once per new batch of pending items. The signature is the
        // pending ids, so saving settings or settling an item never re-opens it.
        let lastSignature = ''
        let lastSession
        let lastRevision = null
        const checkAutoOpen = async () => {
          const session = currentSession()
          if (!session) return
          if (session !== lastSession) {
            lastSession = session
            lastSignature = ''
            lastRevision = null
          }
          const result = await request(ROUTE_STATE, { sessionId: session, since: lastRevision })
          if (result.status === 304) return
          if (!result.ok || !result.data) return
          lastRevision = result.data.revision
          if (result.data.settings && result.data.settings.autoOpen === false) return
          const pendingIds = [
            ...(result.data.decisions || []).filter((d) => d.status === 'pending').map((d) => 'd:' + d.id),
            ...(result.data.plan || []).filter((d) => d.status === 'pending').map((d) => 'p:' + d.id),
          ].join(',')
          if (!pendingIds || pendingIds === lastSignature) {
            lastSignature = pendingIds
            return
          }
          lastSignature = pendingIds
          openPanel()
        }
        checkAutoOpen()
        ctx.effect(() => {
          const timer = setInterval(() => {
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
            checkAutoOpen()
          }, 2500)
          return () => clearInterval(timer)
        }, 'better-plan: auto-open panel')

        ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
          name: 'conversation.input.left', id: 'better-plan', order: 50,
          inject: (sessionId) => ({ feature, openPanel, sessionId: (typeof sessionId === 'string' && sessionId) || currentSession() }),
        }, PlanIconButton))
      },
    }
  },
})
