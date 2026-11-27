# Changelog

本项目的版本变化。版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## 1.1.0 — 2026-11-27

### 修复

- **会话隔离**：面板状态按会话保存到 `$DSH_HOME/better-plan/<session>.json`，两个窗口不再共享或覆盖同一份问题与计划；旧的共享 `better-plan-state.json` 只做一次性归档。
- **确认不再常驻**：确认改为一次性 `source.kind = better-plan` 消息投递给对应会话，不再永久写入系统提示；关闭开关后不再注入纪律文本，确认也不会唤醒智能体。
- **防绕过**：发布内容一律强制 `status = pending` 并清空 `answer`，模型无法自行确认；计划发布校验「有待确认问题 / 待跟进要求 / minTotal」。
- **单条确认通道**：单条 confirm/reject 也会产生反馈并唤醒对应会话；唤醒失败返回 `woken:false`，面板提示手动继续。
- **热重载**：系统提示段落登记 disposer，并用 WeakSet 去重，插件热重载后不再重复挂载纪律段。

### 安全

- 写接口要求 loopback Host、`application/json`（跨站 no-cors 被预检拦截）、同源 Origin/Sec-Fetch-Site，以及 GET 下发的一次性令牌。
- 请求体上限 64 KB，非法 JSON 返回 400，过大返回 413；状态文件写入时请求 0600。
- 非 loopback 访问明确返回 403，并在文档中说明面板仅限本机使用。

### 变更

- 面板：错误横幅与重试、409 冲突提示、草稿按会话保存在 `sessionStorage`、`Ctrl+Enter` 提交、选项方向键导航、`aria-live` 播报、本会话重置、条件 GET（304）与页面隐藏时暂停轮询。
- 自动展开改为按「待确认条目集合变化」判重，保存设置不再弹出面板。
- `minPerRound` 下限统一为 3（schema / 运行时 / 客户端 / 文档一致）。

### 工程

- 抽出 `better-plan/lib/core.js` 纯状态机，新增 31 个 `node --test` 用例（状态机、门禁、CSRF、会话隔离、持久化、304）。
- 新增 `.github/workflows/test.yml`（语法检查 + 测试）。
- `package.json`：补 `engines.dsh` / `license` / `icon` / `scripts.test` / `files` / `exports`。
- 详情页资源：`docs/DETAIL.md`、`docs/DETAIL.zh.md`、`docs/preview.svg`；`locale/*.json` 只保留 `meta`。

## 1.0.0 — 2026-11-27

- 首个版本：两阶段（提问 → 计划）决策面板、输入框开关图标、内置提问与领域建模纪律文本、面板设置、状态持久化。
