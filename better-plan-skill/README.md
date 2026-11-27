# better-plan-skill

「先提问、再计划、后实施」的可移植技能包——**不依赖 DSH 插件、不需要任何工具**，任何会读
`SKILL.md` / `AGENTS.md` / 系统提示的智能体都能用。

和 DSH 插件版是同一套纪律，区别只有交付方式：插件把问题和计划发布到右侧面板点选确认；这里
把它们直接问在对话里，用编号选项 + 一次「全部按推荐」完成整批确认。

## 一轮长什么样

```text
Q1 — 存储格式
A. SQLite（单文件、零配置、备份简单）   ← 推荐
B. Postgres（要起服务，并发更好）
C. JSONL（最简单，但没有查询）

→ 推荐 A：仓库里已经有 SQLite，且没有服务端。

Q2 — 迁移策略
A. 停机一次性迁移   ← 推荐
B. 双写 + 回填
C. 只迁新数据

→ 推荐 A：数据量小（<1GB），停机窗口可接受。

回复「全部按推荐」一次确认，或逐条回答，例如「Q1A Q2B」；
某一项有别的想法就直接写，例如「Q2：先双写一周再切」。
```

用户答完（或点了「全部按推荐」）后，智能体给出一份带验证方式的计划，等一句 `confirm` 才动手。
**选非推荐项 = 自定义答案**，会再多问一轮确认理解，然后才进计划。

## 文件

```
better-plan-skill/
├── SKILL.md                        # 技能本体：两阶段流程、轮次规则、确认语义
├── README.md                       # 本文件：安装与示例
└── references/
    ├── grilling.md                 # 设计树 / 前沿 / 事实与决策的分工
    └── domain-modeling.md          # 术语校准、GLOSSARY 与 ADR
```

## 安装

### Claude Code（Agent Skills）

```bash
mkdir -p .claude/skills
cp -r <repo>/better-plan-skill .claude/skills/better-plan
```

`SKILL.md` 的 frontmatter（`name` / `description`）会让 Claude Code 在非平凡任务上自动调用它，
也可以显式 `/better-plan`。

### Codex CLI / 支持 AGENTS.md 的智能体

把下面一行加进仓库根的 `AGENTS.md`（或 `~/.codex/AGENTS.md`）：

```markdown
## 计划纪律

任何非平凡改动先走 `better-plan-skill/SKILL.md` 的两阶段流程：一轮 3–10 个带推荐项的问题 →
一次确认 → 有序计划 → 再确认 → 才实施。
```

需要更强制时，直接把 `SKILL.md` 的内容粘进 `AGENTS.md`。

### Cursor

新建 `.cursor/rules/better-plan.mdc`，`description` 写触发条件，正文粘贴 `SKILL.md`：

```markdown
---
description: 非平凡任务先提问再计划，确认后才实施
alwaysApply: false
---
<粘贴 SKILL.md 正文>
```

### 任意系统提示 / 自建智能体

把 `SKILL.md` 作为 system prompt 的一段注入即可；`references/` 里的两篇按需加载
（设计任务重时再读，避免每次都占上下文）。

## 与 DSH 插件版的差异

| | 插件版（`better-plan/`） | 本技能包 |
|---|---|---|
| 问题与计划 | 右侧面板，点选 + 一次批量确认 | 对话内编号选项 + 「全部按推荐」 |
| 提醒/唤醒 | 面板确认后自动唤醒智能体 | 用户回答后自然继续 |
| 状态 | 每会话一份 JSON，可重载恢复 | 会话内上下文，无持久化 |
| 额外能力 | 图标开关、设置项、重置、令牌鉴权的本地接口 | 无 |
| 依赖 | DSH ≥ 0.2.2-rc.5 | 无 |

## 来源

`SKILL.md` 与 `references/` 的提问、领域建模部分改写自
[mattpocock/skills](https://github.com/mattpocock/skills)（MIT，Copyright © 2026 Matt Pocock）；
两阶段流程、计划确认与「自定义答案必须追问」为原创。逐条对照与完整 MIT 文本见仓库根的
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。

本技能包与仓库整体一样使用 [MIT](../LICENSE)。
