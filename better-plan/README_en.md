# better-plan

A DeepSeek Harness (DSH) web client plugin: a right-sidebar decision panel with a chat-input toggle.

## What changed in 1.6.0

- **Per-session state**: every conversation gets its own snapshot (`$DSH_HOME/better-plan/<session>.json`), so two windows can never share or overwrite questions. The old shared snapshot is archived once and never read.
- **No permanent "plan confirmed" prompt block**: a confirmation is delivered once as a `source.kind = better-plan` message to the owning session instead of being re-injected into every later request.
- **Phase gates enforced on the host**: `minTotal`, `minPerRound` and `awaitingFollowup` are checked before a plan can be published; a model can no longer publish `status:"confirmed"` items to skip the user's click.
- **Security**: mutating endpoints require same-origin JSON plus a per-process token, bodies are capped at 64 KB, and state files are written 0600.
- **Panel UX**: visible errors, 409 conflict handling, drafts kept per tab, `Ctrl+Enter` submit, arrow-key option navigation, per-session reset, session-scoped pending badge.
- **Confirmed items are never asked twice**: republishing keeps every item whose id and content are unchanged, and reopens only the new or changed ones; plan items behave the same way.
- **Numbering continues**: questions are always Q1, Q2, …, plans P1, P2, …; new items continue from the highest number used and numbers are never reused.
- **Fixed footer**: "Other requirements" and "Confirm all" stay pinned to the bottom of the panel while the content scrolls.
- **Fixed cost halved**: discipline text 1,196 → 379 tokens and the two tool schemas 496 → 349, about 0.73k input tokens per request (o200k measurement).
- **Tool inputs trimmed**: the ignored `status` / `answer` fields are gone and descriptions are shorter; behaviour is unchanged.
- **"Confirm all" never disappears**: disabled and grey when nothing is pending (label "Confirm all"), enabled as "Submit requirements" once you type one.
- **Chat template**: 「已提出 X 条问题待回复，请查看决策面板。」 / 「已发布 X 条计划待确认，请查看决策面板。」
- The hint line under "Other requirements" is gone, and the panel's Refresh button now explains itself (it re-reads panel state, not the plugin) and flashes "Refreshed".
- **Soft "strict panel" guard**: when the model writes question/option content in chat without publishing, the next request carries a one-line correction (about 40 tokens, only on a violation, cleared by the next publish).
- **Question field rule**: `question` holds only the question; options live in `options` (no hard length cap).
- The panel's Refresh button gives feedback in place: its label becomes "Refreshed" for about 1.5 s, with no extra notice line.
- **`/better-plan` command**: with the icon off (or hidden), arms exactly the next message; reverts at turn end and never changes the icon state. With the icon on it is a silent no-op.
- **Input-icon setting**: `showInputIcon` (default on). Hiding the icon counts as the mode being off; `/better-plan` still arms one request.
- **Sidebar icon**: the panel's guide entry shows the plugin icon instead of the default placeholder.
- The "Submit requirements" button is now "Confirm all and submit requirements".
- **Execution report card**: the recorded report renders as a card with time, a small Markdown subset and the plan ids it closed; reports over 800 characters collapse behind an expand toggle.
- **Round timeline**: the header shows "Round N" with prev/next buttons; each round mixes questions, plans and requirements in publish order, separated by "Questions #n" / "Plan #n" dividers; past rounds are read-only. A round closes only after its execution report is recorded; confirmed items are never reopened, only flagged "Updated" when their text changed.
- **Two-tier injection**: the full discipline once per activation (~0.38k tokens), then a ~0.05k reminder.
- **Commands**: `/better-plan` and `/better-plan-off` match the input icon.
- `lib/core.js` holds the pure state machine; 50 tests run with `npm test`.

## Install from source (development, recommended)

```bash
git clone <repo-url> better-plan-workspace
```

Point `plugin_manager`'s `install_bundle` `target` at the cloned **absolute path** of the `better-plan`
directory, restart DSH (or use `dsh-unlag`'s reload), then refresh the page. A linked install picks up
code changes without reinstalling. `plugin_manager` installs through pnpm, which may need the network;
the plugin itself never does.

## Install from a release zip

1. Unzip `better-plan-workspace-*.zip` anywhere.
2. Run `plugin_manager` with `action: "install_bundle"` and an **absolute** `target` pointing at the `better-plan` directory.
3. Restart DSH (or use the `dsh-unlag` reload button) and refresh the page.

Verify: the input-box icon appears (with a badge when items wait), right-click opens the panel, and
`curl http://127.0.0.1:<port>/plugins/better-plan/state` returns `{"ok":true,...}`.

## Usage

| Action | Effect |
|---|---|
| Left-click the icon | Turn the discipline on/off (blue = on) |
| Right-click the icon | Open the decision panel |
| "Confirm all" | Accept every pre-selected answer at once |
| Pick a non-recommended option | Treated as a custom answer, so the agent asks one more round — **kept on purpose** |
| "Other idea…" | Write your own answer; options stay visible |
| `Ctrl+Enter` | Same as "Confirm all" |
| "Other requirements" | The agent asks follow-ups before revising the plan |
| "Reset this session" | Clears this conversation's questions/plan (click twice), never other windows |

## State and privacy

State lives per session under `$DSH_HOME/better-plan/`, is written atomically (mode 0600 requested; Windows ignores POSIX mode and relies on the profile ACL), and is not removed by uninstalling the plugin. Writes are loopback-only, same-origin, and token-guarded, so a cross-site page cannot forge a confirmation.

## Settings

Live from the panel, no restart: default enabled state, min/max questions per round (min 3), minimum total confirmed questions, auto-open on new pending items.

## Tests

```bash
cd better-plan && npm test
```

`lib/core.js` is the tested state machine; `index.js` is I/O plus guards; `client.js` renders and polls with conditional GETs.

## Sources

The grilling and domain-modeling disciplines are adapted from
[mattpocock/skills](https://github.com/mattpocock/skills) (MIT, Copyright © 2026 Matt Pocock); the
two-phase shape corresponds to that repository's `grill-with-docs` (grilling + domain-modeling),
while the plan mode and the "plan → confirm → implement" step are original. See
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) for the line-by-line mapping and the full license.
A tool-free, panel-free version of the same discipline ships in
[`better-plan-skill/`](../better-plan-skill/).

## Known limits

- Chinese and English UI copy (follows the DSH interface language, other languages fall back to English); strings live in `client.js` per the DSH client-bundle convention, `locale/*.json` carries only `meta`.
- Remote (non-loopback) access is refused by design; the panel is local-only.
- The icon toggle is app-wide, not per session.
- Poll intervals: panel 2.5 s, icon 3 s, auto-open 2.5 s; paused while the page is hidden.
- A dsh-unlag hot reload swaps code only: sessions that already exist may keep the prompt sections injected by the previous instance until DSH is restarted once.
