# 更好的计划模式（Better Plan）

一个 DeepSeek Harness（DSH）Web 客户端插件。先提问、再计划，反复追问避免执行跑偏，一切由你在右侧面板进行决策。该插件整合 grill-me 等技能，参考 DSH 的 Plan 模式，让你的智能体更加懂你。

[English](#english) · 插件源码在 [`better-plan/`](better-plan/) · 可移植技能在 [`better-plan-skill/`](better-plan-skill/) · 变更见 [CHANGELOG.md](CHANGELOG.md)

## 流程

1. **提问** —— 智能体把设计问题发布到右侧面板，每题带可点选项，推荐项已预选。
2. **确认** —— 面板底部点一次「全部确认」，整批接受。
3. **计划** —— 智能体发布有序计划，同样一次确认。
4. **实施** —— 只有计划确认后才开始动手。

## 做什么

- 问题和计划都留在面板上，聊天只回一句进度。
- 每个会话一份状态，两个窗口不串台；已确认的条目不会在下一轮重复询问。
- 问题按 Q1、Q2…，计划按 P1、P2… 续号，旧号不复用。
- 开启时每次请求约多 0.73k 输入 token，关闭后不再注入。
- 写接口只接受本机同源请求；输入框图标可隐藏，`/better-plan` 可只对下一条消息启用。

## 安装

```bash
git clone <repo-url> better-plan-workspace
```

在 DSH 用 `plugin_manager` 的 `install_bundle`，`target` 指向克隆目录下的 `better-plan`（绝对路径），重启 DSH 后刷新页面。发行包 zip 解压后同样把 `target` 指到 `better-plan/`。

要求 DSH ≥ 0.2.2-rc.5、Node 22+。详见 [better-plan/README.md](better-plan/README.md)。

## 可移植技能

同一套纪律的纯提示版本在 [`better-plan-skill/`](better-plan-skill/)，不依赖 DSH，可用于 Claude Code、Codex CLI、Cursor 或任意系统提示。

## 目录

```text
better-plan/        插件本体（index.js / client.js / lib / test / locale / docs）
better-plan-skill/  不依赖 DSH 的可移植技能
docs/               领域约定与审计记录
assets/             市场卡片图标
```

## 开发与测试

```bash
cd better-plan
node --check index.js && node --check client.js
npm test   # 46 个用例
```

## 来源

grilling 与 domain-modeling 改写自 [mattpocock/skills](https://github.com/mattpocock/skills)（MIT）；两阶段流程与 plan mode 为本项目原创。逐条对照与许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 许可

MIT，见 [LICENSE](LICENSE)。

## English

A DeepSeek Harness (DSH) web client plugin. Ask first, then plan, with repeated follow-ups so execution never drifts — every decision is yours, made on the right-sidebar panel. It brings grill-me-style skills together with a DSH-plan-mode-inspired discipline, so your agent understands you better.
