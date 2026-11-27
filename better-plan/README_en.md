# better-plan

A DeepSeek Harness (DSH) web client plugin: a right-sidebar decision panel with a chat-input toggle.

## What changed in 1.1.0

- **Per-session state**: every conversation gets its own snapshot (`$DSH_HOME/better-plan/<session>.json`), so two windows can never share or overwrite questions. The old shared snapshot is archived once and never read.
- **No permanent "plan confirmed" prompt block**: a confirmation is delivered once as a `source.kind = better-plan` message to the owning session instead of being re-injected into every later request.
- **Phase gates enforced on the host**: `minTotal`, `minPerRound` and `awaitingFollowup` are checked before a plan can be published; a model can no longer publish `status:"confirmed"` items to skip the user's click.
- **Security**: mutating endpoints require same-origin JSON plus a per-process token, bodies are capped at 64 KB, and state files are written 0600.
- **Panel UX**: visible errors, 409 conflict handling, drafts kept per tab, `Ctrl+Enter` submit, arrow-key option navigation, per-session reset, session-scoped pending badge.
- `lib/core.js` holds the pure state machine; 31 tests run with `npm test`.

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
plan mode and the two-phase flow are original. See
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) for the line-by-line mapping and the full license.
A tool-free, panel-free version of the same discipline ships in
[`better-plan-skill/`](../better-plan-skill/).

## Known limits

- Chinese and English UI copy (follows the DSH interface language, other languages fall back to English); strings live in `client.js` per the DSH client-bundle convention, `locale/*.json` carries only `meta`.
- Remote (non-loopback) access is refused by design; the panel is local-only.
- The icon toggle is app-wide, not per session.
- Poll intervals: panel 2.5 s, icon 3 s, auto-open 2.5 s; paused while the page is hidden.
- A dsh-unlag hot reload swaps code only: sessions that already exist may keep the prompt sections injected by the previous instance until DSH is restarted once.
