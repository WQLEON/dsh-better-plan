# 更好的计划模式（Better Plan）

一个 DeepSeek Harness（DSH）Web 客户端插件：把「先提问、再计划」的两阶段协作流程搬到右侧边栏的决策面板里，用**一次点击**确认整批内容。

[English](#english) · 插件源码在 [`better-plan/`](better-plan/) · 可移植技能在 [`better-plan-skill/`](better-plan-skill/) · 变更见 [CHANGELOG.md](CHANGELOG.md) · 第三方来源见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

## 它解决什么

和 AI 协作最常见的失败是**没对齐就动手**。这个插件把对齐过程变成可点选的面板流程：

1. **提问阶段** —— 智能体把设计问题发布到右侧面板，每题带可点选项，推荐项已预选。你在面板底部点一次「全部确认」就整批接受。
2. **计划阶段** —— 所有问题确认后，智能体发布有序计划，同样是面板上点一次确认。
3. **只有计划确认后才开始实施**。

聊天里只报数量（如「已发布 4 条待确认」），问题和计划都在面板上。

## 功能

- **两阶段面板**：问题的推荐项预先选中，整批一次点击确认；点「其他想法…」可写自己的答案，选项不会折叠。
- **会话隔离**：每个会话一份面板状态（`$DSH_HOME/better-plan/<session>.json`），两个窗口不会互相覆盖。
- **不会被绕过**：模型发布的内容一律强制 `pending`；有待确认问题、待跟进要求或未达 `minTotal` 时，计划发布会被拒绝。
- **可控成本**：开启时每次模型请求约多 1.7k 输入 token（纪律文本 + 两个工具），关闭后不再注入。
- **面板体验**：错误可见、冲突提示、草稿按会话保留、`Ctrl+Enter` 提交、方向键选择、本会话重置、条件轮询（无变化回 304）。
- **安全默认值**：写接口只接受本机同源请求，并要求一次性令牌。

## 安装

插件由 DSH 的 `plugin_manager` 安装。`target` 必须是**绝对路径**，指向插件目录本身（`better-plan/`），而不是仓库根目录。

### 从 GitHub 克隆（推荐，便于跟进更新）

```bash
git clone <repo-url> better-plan-workspace
```

然后在 DSH 中调用：

```json
{
  "action": "install_bundle",
  "target": "<克隆目录的绝对路径>/better-plan",
  "enabled": true
}
```

返回 `"application": "applied"` 后重启 DSH（或用 `dsh-unlag` 的刷新按钮），再刷新页面。
开发时该安装方式是**链接**目录，改完代码刷新即可，不需要重新安装。

### 从发行包

解压 `better-plan-workspace-*.zip`，把 `target` 指向解压后的 `better-plan` 目录，其余步骤同上。

安装细节、设置说明与已知限制见 [better-plan/README.md](better-plan/README.md)。

## 可移植技能（任意智能体）

同一套纪律还有一个**不依赖 DSH、不需要任何工具**的纯提示版本：[`better-plan-skill/`](better-plan-skill/)。
它把面板换成对话内的编号选项 + 一次「全部按推荐」确认，适用于 Claude Code、Codex CLI、Cursor 或任意
系统提示，装法见 [better-plan-skill/README.md](better-plan-skill/README.md)。

```text
Q1 — 存储格式
A. SQLite（单文件、零配置）   ← 推荐
B. Postgres（要起服务）
→ 推荐 A：仓库已用 SQLite，没有服务端。

回复「全部按推荐」一次确认，或逐条回答，例如「Q1B」。
```

## 目录结构

```
.
├── AGENTS.md                  # 仓库的智能体协作约定
├── CHANGELOG.md               # 版本变更
├── LICENSE                    # MIT
├── README.md                  # 本文件
├── .editorconfig / .gitattributes
├── .github/workflows/test.yml # CI：语法检查 + node --test
├── THIRD_PARTY_NOTICES.md     # 改写自 mattpocock/skills 的 MIT 声明
├── better-plan-skill/         # 可移植技能（非 DSH 智能体）
│   ├── SKILL.md               # 两阶段流程本体
│   ├── references/            # grilling / domain-modeling
│   └── README.md              # 安装与差异说明
├── docs/agents/               # 领域文档约定
│   └── domain.md
├── docs/audit/                # 工程审计记录（含修复状态）
└── better-plan/               # 插件本体
    ├── index.js               # Host 侧：路由、工具、鉴权、会话状态、持久化
    ├── client.js              # Client 侧：右侧面板、输入框图标
    ├── disciplines.js         # 内置的提问 / 计划纪律文本
    ├── lib/core.js            # 纯状态机（可脱离 Harness 单测）
    ├── test/                  # node --test 用例：core + host
    ├── cordis.patch.yml       # 插件装载行
    ├── package.json
    ├── locale/{en,zh}.json    # 仅 meta（标题 / 描述 / 详情文档）
    ├── docs/DETAIL{,.zh}.md   # 详情页：一张预览图
    ├── docs/preview.svg
    ├── icon.svg
    ├── README.md / README_en.md
    └── node_modules/          # 内置 schemastery（运行期无需联网）
```

## 开发与测试

```bash
cd better-plan
node --check index.js && node --check client.js && node --check lib/core.js
npm test        # 31 个用例：状态机、门禁、CSRF、会话隔离、持久化、304
```

纯逻辑在 [`lib/core.js`](better-plan/lib/core.js)，host 侧 [`index.js`](better-plan/index.js) 只做 I/O 与鉴权，
客户端 [`client.js`](better-plan/client.js) 负责渲染与轮询。CI 在每次 push / PR 时跑同样的检查。

## 来源与致谢

插件内置的纪律文本并非全部原创，表里写明每个部分的出处（完整 MIT 文本见
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)）：

| 纪律 | 出处 | 在本仓库哪里 |
|---|---|---|
| **grilling**（设计树 / 前沿 / 分轮提问） | [mattpocock/skills `skills/productivity/grilling`](https://github.com/mattpocock/skills/blob/main/skills/productivity/grilling/SKILL.md)（MIT） | [disciplines.js](better-plan/disciplines.js) 的 `GRILLING_ASKING`；[better-plan-skill/references/grilling.md](better-plan-skill/references/grilling.md) |
| **domain-modeling**（术语校准 / GLOSSARY / ADR） | [mattpocock/skills `skills/engineering/domain-modeling`](https://github.com/mattpocock/skills/blob/main/skills/engineering/domain-modeling/SKILL.md)（MIT） | [disciplines.js](better-plan/disciplines.js) 的 `DOMAIN_MODELING`；[better-plan-skill/references/domain-modeling.md](better-plan-skill/references/domain-modeling.md) |
| **grill-with-docs**（组合：grilling + domain-modeling） | [mattpocock/skills `skills/engineering/grill-with-docs`](https://github.com/mattpocock/skills/blob/main/skills/engineering/grill-with-docs/SKILL.md)（MIT） | 两阶段流程的编排来源；本插件在其后加了「计划 → 确认 → 实施」第三段 |
| **grill-me**（只调用 grilling 的简写入口） | [mattpocock/skills `skills/productivity/grill-me`](https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md)（MIT） | 触发用语与对应关系参考 |
| **plan mode**（有序计划 + 验证方式 + 确认后才实施） | 本项目原创 | [disciplines.js](better-plan/disciplines.js) 的 `PLAN_MODE` |
| **两阶段流程 / 面板确认 / 自定义答案必须追问 / 聊天只报数量** | 本项目原创 | 面板与 [better-plan/lib/core.js](better-plan/lib/core.js)、[better-plan/client.js](better-plan/client.js) |

两点说明：

- 改写方式：去掉上游 frontmatter，把「在聊天里提问」改写成「发布到右侧面板、预选选项、一次批量确认」，
  并把推荐答案变成预选选项；领域建模部分压缩为可注入的系统提示。上游 `grill-with-docs` 本身只是
  「依次调用 grilling 与 domain-modeling」，本插件在组合之外补了「计划 → 确认 → 实施」两步。
- 文本**冻结在编写时的时间点**，上游更新不会自动同步；需要跟进时按上表逐段 diff。

## 安全模型

- 面板写接口只服务 loopback Host，要求 `application/json`（跨站 `no-cors` 请求会被预检拦截）、
  同源 `Origin` / `Sec-Fetch-Site`，以及 `GET /state` 下发的一次性令牌（同源才可读）。
- 请求体上限 64 KB；状态文件写入时请求 `0600`（Windows 上由用户目录 ACL 决定）。
- 非 loopback 访问按设计返回 403：面板只在本机可用，远程接入场景请在 DSH 侧另行处理。

## 兼容性

- DSH `>= 0.2.2-rc.5`（见 `better-plan/package.json` 的 `engines.dsh`）
- Node `^22.19.0 || >=24.0.0`

## 许可

MIT，见 [LICENSE](LICENSE)。

## English

Better Plan is a DeepSeek Harness (DSH) web client plugin that turns agent collaboration into a
two-phase, click-to-confirm flow in the right sidebar: the agent publishes design questions with
pre-selected options, you confirm the whole batch with one click, then it publishes an ordered plan
you confirm the same way — nothing is implemented before that.

Highlights: per-session panel state (two windows never share questions), server-side phase gates the
model cannot skip, a one-time confirmation message instead of a permanent prompt block, a token-guarded
same-origin write API, and 31 tests covering the state machine, gates, CSRF and session isolation.

Install with `plugin_manager`'s `install_bundle`, pointing `target` at the absolute path of the
`better-plan/` directory, then restart DSH and refresh the page. See [better-plan/README_en.md](better-plan/README_en.md).

A tool-free, panel-free version of the same discipline ships in [`better-plan-skill/`](better-plan-skill/)
for Claude Code, Codex CLI, Cursor or any system prompt. The grilling and domain-modeling disciplines
are adapted from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT); see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
