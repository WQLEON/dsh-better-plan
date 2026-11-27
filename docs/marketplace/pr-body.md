# Add better-plan to the list / 收录 better-plan

Adds one entry: `data/plugins/WQLEON__dsh-better-plan--better-plan.yml`.

- **Repository**: https://github.com/WQLEON/dsh-better-plan/tree/main/better-plan
- **Category**: `workflow` — a two-phase ask-then-plan discipline with a confirmation panel.
- **Installable**: `better-plan/package.json` declares `dsh.bundle`, and `cordis.patch.yml` sits next to it.
- **Topic**: the repository already carries the `dsh-plugin` topic.
- **Icon**: `assets/icon-180.png` (180×180 PNG, transparent background), referenced through its raw.githubusercontent URL.

The entry points at the `better-plan/` subdirectory because that is the installable package (`dsh plugin add` target); the repository root is a workspace holding the plugin plus its portable skill.

> Note on repo age: the repository was created at 2026-11-27T10:14Z, so at the time of this PR it is under the 1-day bar. The gate's re-run should clear that by itself once it passes 24 hours; nothing else here depends on the age check.
