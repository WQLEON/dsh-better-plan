# better-plan

DSH Web 客户端插件：右侧边栏的决策面板 + 输入框功能开关图标。

## 安装到另一台电脑

前提：那台机器已装 DeepSeek Harness（Desktop 或 Web 均可），并能访问 `plugin_manager`。

### 1. 解压

把 `better-plan-workspace-*.zip` 解压到任意位置，例如：

```
D:\plugins\better-plan-workspace
```

解压后应能看到 `better-plan/` 目录与它旁边的 `README.md`、`LICENSE`、`AGENTS.md`。

### 2. 安装插件

用 `plugin_manager` 工具，`action = install_bundle`，`target` 必须是**绝对路径**，指向插件目录本身（不是工作区根）：

```json
{
  "action": "install_bundle",
  "target": "D:\\plugins\\better-plan-workspace\\better-plan",
  "enabled": true
}
```

返回 `"application": "applied"` 即为成功。若返回 `failed`，diagnostic 字段会给出原因。

> 注意：`target` 不能是相对路径，也不能用 `~`。Windows 下请写成完整的盘符路径。

### 3. 重启并刷新

Host 侧与客户端代码都需要重新加载：

1. 完全退出 DSH
2. 重新启动
3. 在浏览器里刷新页面（Ctrl+R / F5）

### 4. 验证

- 输入框最左侧出现 better-plan 图标
- 右键图标，或等待自动展开，右侧出现「决策面板」
- 面板里能看到「提问」「计划」「其他要求」三个区块

命令行验证（端口以你本机实际为准）：

```bash
curl http://127.0.0.1:<port>/plugins/better-plan/state
# 期望：{"mode":"asking","enabled":true,...}
```

## 使用

| 操作 | 效果 |
|---|---|
| 左键点图标 | 开启 / 关闭 Better Plan 纪律（浅蓝=开，灰=关） |
| 右键点图标 | 打开决策面板 |
| 面板底部「全部确认」 | 一次接受所有预选答案 |
| 某条点「其他想法…」 | 展开输入框写自己的答案，选项不会被折叠 |
| 面板底部「其他要求」 | 写补充要求；提交后智能体会先追问，不会直接实施 |

## 设置

面板底部的可折叠「设置」区：

- **默认开启 Better Plan 模式** —— 只决定插件激活时的初始状态，不影响当前开关
- **每轮最少 / 最多问题数** —— 下限 3，上限默认 10
- **问题总量下限** —— 0 表示不限
- **有待确认时自动展开面板**

## 卸载

```json
{ "action": "remove_bundle", "target": "better-plan" }
```

或运行 `/plugin` 相关命令在插件管理页移除。

## 已知限制

- 面板文案支持中文与英文，跟随 DSH 界面语言；其他语言回落英文
- `$DSH_HOME/better-plan-state.json` 是**本机运行时数据**（提问与计划），不属于安装包内容，也不会随 zip 转移
