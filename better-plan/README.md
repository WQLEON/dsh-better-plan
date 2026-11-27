# 更好的计划模式（better-plan）

DSH Web 客户端插件：右侧边栏的决策面板 + 输入框功能开关图标。

## 版本

当前版本 **1.3.1**；变更记录见仓库根 [CHANGELOG.md](../CHANGELOG.md)。

## 从源码仓库安装（开发用，推荐）

```bash
git clone <repo-url> better-plan-workspace
```

把 `plugin_manager` 的 `install_bundle` 的 `target` 指向 clone 出来的 `better-plan` 目录（**绝对路径**），
返回 `applied` 后重启 DSH（或用 `dsh-unlag` 刷新），再刷新页面。链接安装的目录改代码即生效，
不需要重新安装。安装过程由 `plugin_manager` 调用 pnpm 完成，可能仍需要网络；插件运行期不联网。

## 从发行包安装到另一台电脑

前提：那台机器已装 DeepSeek Harness（Desktop 或 Web 均可），并能访问 `plugin_manager`。

### 1. 解压

把 `better-plan-workspace-*.zip` 解压到任意位置，例如 `D:\plugins\better-plan-workspace`。
解压后应能看到 `better-plan/` 目录与它旁边的 `README.md`、`LICENSE`、`AGENTS.md`。

### 2. 安装插件

```json
{
  "action": "install_bundle",
  "target": "D:\\plugins\\better-plan-workspace\\better-plan",
  "enabled": true
}
```

`target` 必须是**绝对路径**，指向插件目录本身（不是工作区根），不能用 `~`。
返回 `"application": "applied"` 即为成功；`failed` 时诊断字段会给出原因。

### 3. 重启并刷新

Host 侧与客户端代码都需要重新加载：完全退出 DSH → 重新启动 → 浏览器刷新（Ctrl+R / F5）。
若本机启用了 `dsh-unlag` 的热重载，用它的刷新按钮即可，无需退出应用。

### 4. 验证

- 输入框最左侧出现 better-plan 图标，有待确认条目时带数字徽标
- 右键图标（或等它自动展开）打开「决策面板」
- 命令行验证（端口以本机为准）：

```bash
curl -s http://127.0.0.1:<port>/plugins/better-plan/state
# 期望：{"ok":true,"sessionScoped":false,"enabled":true,"revision":0,...}
```

不带 `x-better-plan-session` 头时读到的是 `default` 桶，仅用于调试；面板始终带会话头。

## 使用

| 操作 | 效果 |
|---|---|
| 左键点图标 | 开启 / 关闭更好的计划模式（浅蓝=开，灰=关） |
| 右键点图标 | 打开决策面板 |
| 面板底部「全部确认」 | 一次接受所有预选答案 |
| 点某个非推荐选项 | 会被当成自定义答案，智能体再追问一轮（**这是刻意保留的行为**） |
| 「其他想法…」 | 展开输入框写自己的答案，选项不会被折叠 |
| `Ctrl+Enter` | 等同于点「全部确认」 |
| 「其他要求」 | 提交后智能体先追问，不会直接实施 |
| 「重置本会话面板」 | 清空当前会话的问题与计划（连点两次确认），不影响其他窗口 |
| 无待确认项时 | 「全部确认」仍显示在底栏，灰色不可点 |
| 面板右上「刷新」 | 重新读取面板状态（不重载插件），完成后短暂显示「已刷新」 |
| 已确认的条目 | 下一轮重新发布时保持「已确认」（灰显），不会被再次要求确认 |
| 「其他要求」+「全部确认」 | 固定在面板底部，内容区独立滚动，始终可达 |

## 状态与隐私

- 面板状态按会话保存在 `$DSH_HOME/better-plan/`，一个会话一个文件（含 `revision`），原子写入、写入时请求 0600；Windows 上 POSIX 权限位不生效，实际由用户目录 ACL 决定。
- 插件卸载后这些文件不会自动删除；确认不再需要后可整目录删除。
- 纪律文本只在开关打开时注入系统提示；开关关闭后不再注入，确认也不会唤醒智能体。
- 写接口只接受 loopback 且同源的请求，并需要 GET `/state` 返回的一次性令牌，跨站页面无法伪造确认。

## 设置

面板底部可折叠「设置」区（保存后立即生效，无需重启）：

- **默认开启更好的计划模式** —— 只决定插件激活时的初始状态，不影响当前开关
- **每轮最少 / 最多问题数** —— 下限 3，上限默认 10
- **问题总量下限** —— 0 表示不限；大于 0 时未达标不能发布计划
- **有待确认时自动展开面板** —— 只在「待确认条目集合变化」时自动展开，保存设置不会弹面板

## 开发与测试

```bash
cd better-plan
npm test          # node --test，41 个用例：状态机/合并/续号 + host 路由/门禁/CSRF/会话隔离
```

纯逻辑在 `lib/core.js`，host 侧 `index.js` 只做 I/O 与鉴权，客户端 `client.js` 负责渲染与轮询（条件 GET，空闲时返回 304）。

## 来源

纪律文本不是全部原创：grilling 与 domain-modeling 改写自
[mattpocock/skills](https://github.com/mattpocock/skills)（MIT，Copyright © 2026 Matt Pocock），
两阶段的组合方式对应上游 `grill-with-docs`（grilling + domain-modeling），plan mode 与
「计划 → 确认 → 实施」为本项目原创。逐条对照与完整 MIT 文本见仓库根
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。

不想装插件、只想用这套纪律？见不依赖 DSH 的可移植版本 [../better-plan-skill/](../better-plan-skill/)。

## 已知限制

- 面板文案支持中文与英文，跟随 DSH 界面语言；其他语言回落英文（字符串在 `client.js`，符合 DSH 客户端插件的惯例，`locale/*.json` 只放 `meta`）
- 远程访问（非 loopback）场景下写接口按设计返回 403，面板只在本机可用
- 图标开关是应用级设置，不是按会话的
- 轮询间隔：面板 2.5s、图标 3s、自动展开 2.5s；页面隐藏时暂停
- 用 dsh-unlag 热重载只替换代码：已经存在的会话在重启前可能仍带着旧实例注入的系统提示段落，重启一次 DSH 后彻底干净
