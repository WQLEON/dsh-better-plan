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
      extraLabel: ['提出要求', 'Propose requirements'],
      extraPlaceholder: ['如果还有别的想法或要求，写在这里；智能体会据此继续追问并更新计划', 'Anything else? The agent asks follow-ups and revises the plan.'],
      submitWithExtra: ['全部确认并提出要求', 'Confirm all and propose requirements'],
      other: ['其他想法…', 'Other idea…'],
      custom: ['输入你的答案（Ctrl+Enter 提交）', 'Type your answer (Ctrl+Enter to submit)'],
      refresh: ['刷新', 'Refresh'],
      refreshHint: ['重新读取面板状态（不会重载插件）', 'Re-read the panel state (this does not reload the plugin)'],
      refreshed: ['已刷新', 'Refreshed'],
      confirmed: ['已确认', 'Confirmed'],
      rejected: ['已拒绝', 'Rejected'],
      pending: ['待确认', 'Pending'],
      chosen: ['回答', 'Answer'],
      allDone: ['全部确认完毕', 'Everything is confirmed'],
      settings: ['设置', 'Settings'],
      defOn: ['默认开启更好的计划模式', 'Default Better Plan mode'],
      minPerBatch: ['每次最少问题数', 'Min questions / batch'],
      maxPerBatch: ['每次最多问题数', 'Max questions / batch'],
      minTotal: ['问题总量下限', 'Min questions in total'],
      autoOpen: ['有待确认时自动展开面板', 'Auto-open the panel when items arrive'],
      showIcon: ['在输入框显示图标', 'Show the icon in the chat input'],
      save: ['保存设置', 'Save settings'],
      saved: ['已保存', 'Saved'],
      saveFailed: ['已应用（配置未能写入）', 'Applied (config not written)'],
      reset: ['重置本会话面板', 'Reset this session'],
      resetConfirm: ['再点一次确认清空', 'Click again to clear'],
      resetDone: ['已清空', 'Cleared'],
      wakeFailed: ['已确认，但没能唤醒智能体；请手动发送任意消息', 'Confirmed, but the agent could not be woken — send any message to continue'],
      round: ['第 {n} 轮', 'Round {n}'],
      prevRound: ['查看上一轮', 'Previous round'],
      nextRound: ['查看下一轮', 'Next round'],
      history: ['历史轮次（只读）', 'Past round (read-only)'],
      backToCurrent: ['回到当前轮', 'Back to the current round'],
      batchQuestions: ['第 {n} 次提问', 'Questions #{n}'],
      batchPlan: ['第 {n} 次计划', 'Plan #{n}'],
      requirementEntry: ['提出要求', 'Requirement'],
      messageEntry: ['会话消息', 'Message'],
      reportEntry: ['执行报告', 'Execution report'],
      expand: ['展开', 'Expand'],
      collapse: ['收起', 'Collapse'],
      relatedPlans: ['对应计划', 'Plans'],
      discard: ['丢弃本轮', 'Discard round'],
      discardConfirm: ['再点一次丢弃', 'Click again to discard'],
      discardEntry: ['本轮已丢弃', 'Round discarded'],
      updatedMark: ['内容已更新', 'Updated'],
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
    const dividerStyle = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, opacity: 0.8, margin: '6px 0 2px' }
    const KIND_STYLE = {
      questions: { line: '#247bbf', tint: 'rgba(36,123,191,0.07)' },
      plan: { line: '#2e9e5b', tint: 'rgba(46,158,91,0.08)' },
      requirement: { line: '#b47a10', tint: 'rgba(180,122,16,0.10)' },
      message: { line: '#b47a10', tint: 'rgba(180,122,16,0.08)' },
      report: { line: '#7b5cc4', tint: 'rgba(123,92,196,0.10)' },
      discard: { line: '#8a8a8a', tint: 'rgba(138,138,138,0.08)' },
    }
    const btnBase = {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      borderRadius: 8, fontSize: 12, lineHeight: 1, cursor: 'pointer',
      padding: '7px 14px', border: '1px solid var(--dsw-alias-border-l1, transparent)',
    }
    const primaryBtn = { ...btnBase, background: 'var(--bp-primary-bg, var(--dsw-alias-state-business-primary))', color: 'var(--dsw-alias-label-on-color)', borderColor: 'transparent', fontWeight: 600 }
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
      const [visible, setVisible] = React.useState(true)
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
          setVisible(toggle.data.settings?.showInputIcon !== false)
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

      if (!visible) return null
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

    function ItemCard({ item, kind, draft, onDraft, readOnly = false }) {
      useLang()
      const palette = kind === 'plan' ? KIND_STYLE.plan : KIND_STYLE.questions
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
          border: '1px solid ' + (on ? palette.line : 'var(--dsw-alias-border-l1)'),
          userSelect: 'text',
          background: on ? palette.tint : 'transparent',
          color: 'inherit', fontSize: 12, lineHeight: 1.5,
        },
      },
        h('span', {
          'aria-hidden': true,
          style: {
            flex: '0 0 auto', width: 14, height: 14, borderRadius: '50%', marginTop: 2,
            border: '1px solid ' + (on ? palette.line : 'var(--dsw-alias-border-l2)'),
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          },
        }, on ? h('span', { style: { width: 7, height: 7, borderRadius: '50%', background: palette.line } }) : null),
        h('span', { style: extra ? { whiteSpace: 'pre-wrap' } : null }, label)
      )

      const body = []
      if (!settled && !readOnly && rows.length > 0) {
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
              border: '1px solid ' + palette.line,
              background: 'transparent', color: 'inherit', outline: 'none',
            },
          }) : null
        ))
      }
      if (settled && kind === 'plan' && item.detail) {
        body.push(h('div', {
          key: 'detail',
          style: { fontSize: 12, whiteSpace: 'pre-wrap', lineHeight: 1.6, opacity: 0.9 },
        }, item.detail))
      }
      if (settled && item.answer && item.answer !== item.detail) {
        body.push(h('div', { key: 'answer', style: { fontSize: 12 } },
          h('span', { style: { opacity: 0.7, marginRight: 6 } }, T.chosen + ':'), item.answer))
      }

      return h('div', {
        style: {
          border: '1px solid var(--dsw-alias-border-l1, transparent)',
          borderLeft: '3px solid ' + palette.line,
          borderRadius: 10,
          padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
          background: palette.tint, opacity: settled ? 0.9 : 1,
        },
      },
        h('div', { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 } },
          h('strong', { style: { fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.5 } },
            `${item.id}  ${item.question || item.title || ''}`),
          h('div', { style: { display: 'flex', gap: 6, alignItems: 'center', flex: '0 0 auto' } },
            item.updated === true ? h('span', { style: { fontSize: 10, opacity: 0.65 } }, T.updatedMark) : null,
            h('span', { style: { ...statusStyle(item.status), flex: '0 0 auto' } }, statusLabel(item.status)))
        ),
        body
      )
    }

    /** Very small Markdown subset: headings, bullets, bold, inline code, fences. */
    function renderMarkdown(source) {
      const lines = String(source ?? '').split('\n')
      const out = []
      let fence = null
      let list = null
      const flushList = () => {
        if (list) { out.push(h('ul', { key: 'ul-' + out.length, style: { margin: '4px 0', paddingLeft: 18 } }, list)); list = null }
      }
      for (const line of lines) {
        if (/^\s*```/.test(line)) {
          flushList()
          if (fence === null) fence = { key: 'code-' + out.length, lines: [] }
          else { out.push(h('pre', { key: fence.key, style: { margin: '6px 0', padding: 8, borderRadius: 6, background: 'var(--dsw-alias-bg-layer-2, rgba(0,0,0,0.04))', overflowX: 'auto', fontSize: 11 } }, fence.lines.join('\n'))); fence = null }
          continue
        }
        if (fence) { fence.lines.push(line); continue }
        if (/^\s*$/.test(line)) { flushList(); continue }
        const heading = /^(#{1,4})\s+(.*)$/.exec(line)
        if (heading) {
          flushList()
          out.push(h('div', { key: 'h-' + out.length, style: { fontWeight: 600, fontSize: heading[1].length <= 2 ? 13 : 12, margin: '6px 0 2px' } }, inline(heading[2])))
          continue
        }
        const bullet = /^\s*[-*]\s+(.*)$/.exec(line)
        if (bullet) {
          list = list || []
          list.push(h('li', { key: 'li-' + out.length + '-' + list.length, style: { margin: '2px 0' } }, inline(bullet[1])))
          continue
        }
        const ordered = /^\s*\d+\.\s+(.*)$/.exec(line)
        if (ordered) {
          list = list || []
          list.push(h('li', { key: 'li-' + out.length + '-' + list.length, style: { margin: '2px 0' } }, inline(ordered[1])))
          continue
        }
        flushList()
        out.push(h('div', { key: 'p-' + out.length, style: { margin: '2px 0' } }, inline(line)))
      }
      flushList()
      return out
    }

    function inline(source) {
      const parts = String(source).split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
      return parts.map((part, index) => {
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
          return h('code', { key: 'c' + index, style: { fontFamily: 'ui-monospace, monospace', fontSize: 11, padding: '0 3px', borderRadius: 4, background: 'var(--dsw-alias-bg-layer-2, rgba(0,0,0,0.05))' } }, part.slice(1, -1))
        }
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
          return h('strong', { key: 'b' + index }, part.slice(2, -2))
        }
        return part
      })
    }

    function ReportCard({ entry, planIds }) {
      useLang()
      const [open, setOpen] = React.useState(false)
      const text = String(entry.text || '').replace(/^\s*#{1,4}\s*(执行报告|Execution report)\s*(\r?\n|$)/i, '').trim()
      const long = text.length > 800
      const shown = long && !open ? text.slice(0, 300) + '…' : text
      const pad = (value) => String(value).padStart(2, '0')
      const when = entry.at ? new Date(entry.at) : null
      const time = when
        ? `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} ${pad(when.getHours())}:${pad(when.getMinutes())}:${pad(when.getSeconds())}`
        : ''
      return h('div', {
        style: {
          border: '1px solid var(--dsw-alias-border-l1, transparent)',
          borderLeft: '3px solid ' + KIND_STYLE.report.line,
          borderRadius: 10,
          padding: 12, display: 'flex', flexDirection: 'column', gap: 6,
          background: KIND_STYLE.report.tint, fontSize: 12, lineHeight: 1.6,
        },
      },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } },
          h('strong', null, T.reportEntry),
          h('span', { style: { fontSize: 10, opacity: 0.6 } }, time)),
        h('div', null, renderMarkdown(shown)),
        long ? h('button', {
          type: 'button',
          onClick: () => setOpen((v) => !v),
          style: { alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11, color: 'var(--dsw-alias-state-business-primary, inherit)' },
        }, open ? T.collapse : T.expand) : null,
        planIds && planIds.length > 0
          ? h('div', { style: { fontSize: 10, opacity: 0.6 } }, T.relatedPlans + ': ' + planIds.join('、'))
          : null
      )
    }

    /* --------------------------------------------------------------- settings */

    function SettingsSection({ settings, onSave, expanded = false }) {
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

      return h('div', { style: expanded ? {} : { borderTop: '1px solid var(--dsw-alias-border-l1, transparent)', paddingTop: 10 } },
        expanded ? null : h('button', {
          type: 'button',
          'aria-expanded': open,
          onClick: () => setOpen((v) => !v),
          style: { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, color: 'inherit', opacity: 0.75 },
        }, `${open ? '▾' : '▸'} ${T.settings}`),
        expanded || open ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: expanded ? 0 : 10 } },
          field('defaultEnabled', T.defOn, 'bool'),
          field('minPerBatch', T.minPerBatch, 'num', 3, 200),
          field('maxPerBatch', T.maxPerBatch, 'num', 3, 200),
          field('minTotal', T.minTotal, 'num', 0, 200),
          field('autoOpen', T.autoOpen, 'bool'),
          field('showInputIcon', T.showIcon, 'bool'),
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
      const [refreshing, setRefreshing] = React.useState(false)
      const [resetArmed, setResetArmed] = React.useState(false)
      const [discardArmed, setDiscardArmed] = React.useState(false)
      const [settingsOpen, setSettingsOpen] = React.useState(false)
      const headerRef = React.useRef(null)
      const rootRef = React.useRef(null)
      const maxBarHeight = () => {
        const node = rootRef.current
        const host = node && node.parentElement
        const viewport = typeof window !== 'undefined' ? window.innerHeight : 800
        const measured = host && host.clientHeight > 0 ? host.clientHeight : (node && node.clientHeight > 0 ? node.clientHeight : viewport)
        return Math.max(140, Math.min(measured, viewport) - 56)
      }
      const barKey = 'better-plan:bar-height'
      const [barHeight, setBarHeight] = React.useState(() => {
        try {
          const saved = Number(localStorage.getItem(barKey))
          return Number.isFinite(saved) && saved >= 140 ? saved : 190
        } catch { return 190 }
      })
      const [panelHeight, setPanelHeight] = React.useState(null)
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

      const startBarResize = (event) => {
        event.preventDefault()
        const startY = event.clientY
        const startHeight = barHeight
        const onMove = (move) => {
          const next = Math.min(Math.max(startHeight - (move.clientY - startY), 140), maxBarHeight())
          setBarHeight(next)
          try { localStorage.setItem(barKey, String(next)) } catch { /* ignore */ }
        }
        const onUp = () => {
          document.removeEventListener('mousemove', onMove)
          document.removeEventListener('mouseup', onUp)
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
      }

      const discard = async () => {
        if (!discardArmed) {
          setDiscardArmed(true)
          setTimeout(() => setDiscardArmed(false), 3000)
          return
        }
        setDiscardArmed(false)
        const result = await submit({ action: 'discardRound' })
        if (result && result.ok) {
          setDrafts({})
          setExtra('')
          setViewRound(null)
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
      const timeline = Array.isArray(state?.timeline) ? state.timeline : []
      const currentRound = state?.round || 1
      const [viewRound, setViewRound] = React.useState(null)
      const shownRound = viewRound === null ? currentRound : viewRound
      const isCurrent = shownRound === currentRound
      const scrollRef = React.useRef(null)
      const stickRef = React.useRef(true)

      React.useEffect(() => { setViewRound(null) }, [sessionId])
      React.useEffect(() => {
        const clamp = () => {
          const cap = maxBarHeight()
          if (cap < 260) return
          setBarHeight((current) => Math.min(current, cap))
        }
        clamp()
        window.addEventListener('resize', clamp)
        return () => window.removeEventListener('resize', clamp)
      }, [])

      React.useLayoutEffect(() => {
        const node = rootRef.current
        if (!node) return undefined
        const measure = () => {
          const viewport = typeof window !== 'undefined' ? window.innerHeight : 800
          let el = node.parentElement
          let found = 0
          while (el && el !== document.body) {
            const style = window.getComputedStyle(el)
            const height = el.clientHeight
            const scrolls = el.scrollHeight > height + 4
            if (height > 0 && (scrolls || style.overflowY !== 'visible')) { found = height; break }
            el = el.parentElement
          }
          setPanelHeight(found > 0 ? Math.min(found, viewport) : viewport)
        }
        measure()
        window.addEventListener('resize', measure)
        return () => window.removeEventListener('resize', measure)
      }, [])

      React.useEffect(() => {
        if (!settingsOpen) return undefined
        const onDown = (event) => {
          const node = headerRef.current
          if (node && node.contains(event.target)) return
          setSettingsOpen(false)
        }
        document.addEventListener('mousedown', onDown)
        return () => document.removeEventListener('mousedown', onDown)
      }, [settingsOpen])
      React.useEffect(() => {
        if (viewRound !== null && (viewRound > currentRound || viewRound < 1)) setViewRound(null)
      }, [currentRound, viewRound])
      React.useEffect(() => {
        const node = scrollRef.current
        if (node && stickRef.current) node.scrollTop = node.scrollHeight
      }, [state?.revision, shownRound])

      const entries = timeline.filter((entry) => entry.round === shownRound)
      const liveById = (id) => decisions.find((d) => d.id === id) || plan.find((p) => p.id === id)
      const planIdsOf = (entry) => {
        const ids = []
        for (const item of timeline) {
          if (item.round !== entry.round || item.kind !== 'plan') continue
          for (const planItem of item.items || []) {
            if (planItem?.id && !ids.includes(planItem.id)) ids.push(planItem.id)
          }
        }
        return ids
      }
      const fill = (template, n) => String(template).replace('{n}', String(n))
      const renderEntry = (entry) => {
        const key = `${entry.round}-${entry.kind}-${entry.batch}-${entry.at}`
        if (entry.kind === 'report') {
          return h(ReportCard, { key, entry, planIds: planIdsOf(entry) })
        }
        if (entry.kind === 'discard') {
          return h('div', { key }, h('div', { style: { ...dividerStyle, color: KIND_STYLE.discard.line } }, T.discardEntry))
        }
        if (entry.kind === 'requirement' || entry.kind === 'message') {
          const message = entry.kind === 'message'
          const accent = message ? KIND_STYLE.message : KIND_STYLE.requirement
          const body = message
            ? String(entry.text || '')
              .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, '')
              .split('\n')
              .filter((line) => !/^\s*(Time sampled|Elapsed since|Browser time zone)/i.test(line))
              .join('\n')
              .trim()
            : (entry.text || '')
          return h('div', {
            key,
            style: {
              borderLeft: '3px solid ' + accent.line,
              background: accent.tint,
              borderRadius: 8, padding: '8px 10px',
            },
          },
            h('div', { style: { ...dividerStyle, margin: 0, color: accent.line } }, message ? T.messageEntry : T.requirementEntry),
            h('div', { style: { fontSize: 12, whiteSpace: 'pre-wrap', lineHeight: 1.6 } }, body))
        }
        const questions = entry.kind === 'questions'
        const accent = questions ? KIND_STYLE.questions.line : KIND_STYLE.plan.line
        return h('div', { key },
          h('div', { style: { ...dividerStyle, color: accent } }, fill(questions ? T.batchQuestions : T.batchPlan, entry.batch)),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
            (entry.items || []).map((snap) => {
              const live = liveById(snap.id)
              const item = isCurrent && live ? live : snap
              return h(ItemCard, {
                key: key + '-' + snap.id,
                item,
                kind: questions ? 'decision' : 'plan',
                draft: isCurrent ? drafts[item.id] : undefined,
                onDraft,
                readOnly: !isCurrent,
              })
            })))
      }
      const announcement = state
        ? `${pendingTotal} ${T.unanswered}`
        : ''

      return h('div', {
        ref: rootRef,
        style: { height: panelHeight ? panelHeight + 'px' : '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', position: 'relative' },
        onKeyDown: (event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && (pendingTotal > 0 || extra.trim())) {
            event.preventDefault()
            confirmBatch()
          }
        },
      },
        h('style', null, [
          ':root { --bp-primary-bg: var(--dsw-alias-state-business-primary); }',
          'body[data-ds-dark-theme] { --bp-primary-bg: color-mix(in srgb, var(--dsw-alias-state-business-primary) 70%, #000); }',
          '.bp-bar-btn { background: rgba(127,127,127,0.12); border: 1px solid rgba(127,127,127,0.28); border-radius: 8px; padding: 5px 9px; font-size: 12px; line-height: 1; cursor: pointer; color: inherit; }',
          '.bp-bar-btn:hover:not(:disabled) { background: rgba(127,127,127,0.22); }',
          '.bp-bar-btn:disabled { opacity: 0.4; cursor: not-allowed; }',
          '.bp-danger { color: var(--dsw-alias-state-error-primary, #d33); border-color: currentColor; }',
          '.bp-round { font-size: 11px; padding: 3px 8px; border-radius: 999px; background: rgba(127,127,127,0.12); }',
          '.bp-primary { transition: filter 0.15s ease; }',
          '.bp-primary:hover:not(:disabled) { filter: brightness(1.08); }',
        ].join('\n')),
        h('div', {
          ref: headerRef,
          style: {
            flex: 'none', display: 'flex', alignItems: 'center', gap: 6,
            padding: '10px 16px 8px',
            borderBottom: '1px solid var(--dsw-alias-border-l1, transparent)',
            background: 'var(--dsw-alias-bg-layer-1, transparent)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
            position: 'relative', zIndex: 2,
          },
        },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
            h('h3', { style: { margin: 0, fontSize: 15 } }, T.panel),
            h('button', {
              type: 'button', className: 'bp-bar-btn', title: T.prevRound,
              disabled: shownRound <= 1, onClick: () => setViewRound(Math.max(1, shownRound - 1)),
            }, '‹'),
            h('button', {
              type: 'button', className: 'bp-bar-btn', title: T.nextRound,
              disabled: shownRound >= currentRound, onClick: () => setViewRound(Math.min(currentRound, shownRound + 1)),
            }, '›'),
            h('span', { className: 'bp-round' }, fill(T.round, shownRound))),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' } },
          h('button', {
            type: 'button',
            className: discardArmed ? 'bp-bar-btn bp-danger' : 'bp-bar-btn',
            title: T.discard,
            onClick: discard,
            disabled: busy,
          }, discardArmed ? T.discardConfirm : T.discard),
          h('button', {
            type: 'button',
            className: 'bp-bar-btn',
            title: T.resetHint,
            onClick: reset,
            disabled: busy,
          }, resetArmed ? T.resetConfirm : T.reset),
          h('button', {
            type: 'button',
            className: 'bp-bar-btn',
            title: T.refreshHint,
            disabled: busy || refreshing,
            onClick: async () => {
              if (refreshing) return
              setRefreshing(true)
              await reload({ force: true })
              setTimeout(() => setRefreshing(false), 1500)
            },
          }, refreshing ? T.refreshed : T.refresh),
          h('button', {
            type: 'button',
            className: 'bp-bar-btn',
            'aria-expanded': settingsOpen,
            onClick: () => setSettingsOpen((value) => !value),
          }, `${settingsOpen ? '▾' : '▸'} ${T.settings}`)
          ),
          settingsOpen ? h('div', {
            style: {
              position: 'absolute', top: '100%', right: 12, zIndex: 20, width: 280,
              background: 'var(--dsw-alias-bg-layer-1, #fff)',
              border: '1px solid var(--dsw-alias-border-l1, transparent)',
              borderRadius: 10, padding: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            },
          }, h(SettingsSection, { settings: state?.settings || {}, onSave: saveSettings, expanded: true })) : null
        ),

        h('div', {
          ref: scrollRef,
          onScroll: (event) => {
            const node = event.currentTarget
            stickRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 40
          },
          style: { flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '16px 16px 0', paddingBottom: 16, display: 'flex', flexDirection: 'column', gap: 14 },
        },
        h('div', { 'aria-live': 'polite', style: visuallyHidden }, announcement),

        error ? h(ErrorBanner, { message: T.loadFailed, onRetry: () => reload({ force: true }) }) : null,
        notice ? h('div', { role: 'alert', style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, notice) : null,
        state && state.sessionScoped === false ? h('div', { style: { fontSize: 11, opacity: 0.6 } }, T.notScoped) : null,

        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
          entries.length > 0
            ? entries.map(renderEntry)
            : decisions.length === 0 && plan.length === 0
              ? h('div', { style: { opacity: 0.7, fontSize: 12 } }, T.emptyQuestions)
              : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
                [
                  ...decisions.map((d) => h(ItemCard, { key: 'd-' + d.id, item: d, kind: 'decision', draft: drafts[d.id], onDraft, readOnly: !isCurrent })),
                  ...plan.map((p) => h(ItemCard, { key: 'p-' + p.id, item: p, kind: 'plan', draft: drafts[p.id], onDraft, readOnly: !isCurrent })),
                ])
        ),

        ),
        !isCurrent ? h('div', {
          style: { flex: 'none', height: 64, boxSizing: 'border-box', borderTop: '1px solid var(--dsw-alias-border-l1, transparent)', background: 'var(--dsw-alias-bg-layer-1, transparent)', padding: '8px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center', boxShadow: '0 -2px 8px rgba(0,0,0,0.10)' },
        },
          h('div', { style: { fontSize: 12, opacity: 0.75, marginBottom: 8 } }, T.history),
          h('button', { type: 'button', className: 'bp-primary', style: { ...primaryBtn, width: '100%', height: 36 }, onClick: () => setViewRound(null) }, T.backToCurrent)
        ) : h('div', {
          style: { flex: 'none', minHeight: 140, height: barHeight, maxHeight: 'calc(100% - 56px)', position: 'relative', overflow: 'hidden', boxSizing: 'border-box', borderTop: '1px solid var(--dsw-alias-border-l1, transparent)', background: 'var(--dsw-alias-bg-layer-1, transparent)', padding: '10px 16px 68px', display: 'flex', flexDirection: 'column', gap: 6, boxShadow: '0 -2px 8px rgba(0,0,0,0.10)' },
        },
          h('div', {
            onMouseDown: startBarResize,
            style: { flex: 'none', height: 10, margin: '-10px -16px 0', cursor: 'row-resize', display: 'flex', alignItems: 'center', justifyContent: 'center' },
          }, h('div', { style: { width: 36, height: 3, borderRadius: 2, background: 'rgba(127,127,127,0.35)' } })),
          h('div', { style: sectionHeading }, T.extraLabel),
          h('textarea', {
            value: extra,
            placeholder: T.extraPlaceholder,
            rows: 2,
            onChange: (e) => setExtra(e.target.value),
            style: {
              width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: 12,
              borderRadius: 8, resize: 'none', flex: '1 1 auto', minHeight: 40, overflowY: 'auto', fontFamily: 'inherit',
              border: '1px solid ' + (extra.trim()
                ? 'var(--dsw-alias-state-business-primary)'
                : 'var(--dsw-alias-border-l1)'),
              background: 'transparent', color: 'inherit', outline: 'none',
            },
          }),

        (() => {
          const canSubmit = !busy && (pendingTotal > 0 || Boolean(extra.trim()))
          const label = extra.trim() ? T.submitWithExtra : T.confirmAll
          return h('div', {
            style: { position: 'absolute', left: 16, right: 16, bottom: 12 },
          }, h('button', {
            type: 'button',
            className: 'bp-primary',
            style: {
              ...primaryBtn, width: '100%', height: 40, fontSize: 13, marginTop: 2, flex: 'none',
              ...(canSubmit ? {} : {
                background: 'var(--dsw-alias-bg-layer-3, transparent)',
                color: 'var(--dsw-alias-label-tertiary, inherit)',
                borderColor: 'var(--dsw-alias-border-l1, transparent)',
                cursor: 'not-allowed',
                opacity: 0.6,
              }),
            },
            disabled: !canSubmit,
            'aria-disabled': !canSubmit,
            'aria-busy': busy,
            onClick: confirmBatch,
          }, label))
        })()
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
          guide: [{
            id: 'better-plan', order: 100, title: () => T.guide,
            icon: (props) => h(PlanIcon, { size: props?.size ?? 16 }),
          }],
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
