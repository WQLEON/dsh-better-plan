# better-plan 审计：可完善项

审计对象：`better-plan/`（index.js 575 行、client.js 605 行、disciplines.js 80 行）
方法：通读全部源码；对照运行中的真实状态（`GET /plugins/better-plan/state`、`$DSH_HOME/better-plan-state.json`、本机 session 日志）。
标注：**[实测]** = 已在运行环境复现；**[代码]** = 静态可确认；**[待验证]** = 需一次重载/联调确认。

## A. 架构：状态作用域（P0）

1. **[实测] 全局单文件状态导致跨会话/跨工作区串台**
   `snapshotPath()` 固定为 `$DSH_HOME/better-plan-state.json`（index.js:30-33），所有会话、所有工作区共用一份 `decisions/plan/feedback`。
   证据：本工作区（插件仓库）调用 `/state` 返回的计划是另一个 DSH 窗口的（`app/version.js`、`tools/bump-version.js`、版本 `0.7.0.20261126`），并且这份计划被当作本会话「已确认计划」注入系统提示。
   影响：面板内容错乱、feedback 张冠李戴、两个窗口互相覆盖、无法按会话重置。
   建议：状态按 `sessionId`（或 `sessionId+workspace`）分键；文件按会话命名；面板请求必须带 `sessionId`。

2. **[代码] 陈旧 feedback 永久驻留**
   `feedback` 只在三条确认分支赋值（index.js:498/503/505），只有 `DELETE /state` 清空（index.js:558）；`publish` 成功也不清。
   后果：一次确认后，后续每个请求都带着「Begin implementation…」的旧指令（本会话即如此）。

3. **[代码] 关闭开关不停止 feedback 注入**
   discipline 段判断了 `enabled`（index.js:227），feedback 段没有（index.js:231）→ 左键关掉图标后，旧的确认指令仍然每轮注入。

## B. 状态机与协议正确性（P0/P1）

4. **[代码] 发布信任模型给的 `status`/`answer` → 可绕过确认门**
   `sanitize()` 原样保留 `status`（index.js:167），`publish`（index.js:434-460）与两个 tool（index.js:277-295、322-328）都直接采用。
   模型可以发布 `status:"confirmed"` 的条目，面板显示「已确认」，`hasPending()` 为 false，用户从未点过任何东西。
   建议：publish 路径强制 `status='pending'`、清空 `answer`。

5. **[代码] `minTotal`、`minPerRound`、`awaitingFollowup` 门禁可绕过**
   - `minTotal` 只在 `recomputeMode()` 里检查（index.js:388）；而 plan 发布无条件 `mode='plan'`（index.js:437-439、324），tool 路径完全不校验阶段。
   - `minPerRound` 只写进纪律文本（disciplines.js:66-73），发布 1 条不会被拒，只按 `maxPerRound` 静默截断（index.js:148）。
   建议：`publishItems` 前置校验（有待确认问题 / 未满足 minTotal / awaitingFollowup 时拒绝并返回原因）。

6. **[代码] 选择非推荐预设选项 = 「自定义答案」→ 多一轮**
   `confirmAll` 把「与推荐项文本不同」一律算自定义（index.js:476-478），于是用户点第 2 个预设选项也会触发 follow-up 轮。
   实测代价：每多一轮 = 多一次整段提示（本机中位 50k tokens）。
   建议：客户端显式传 `custom: true`（只有「其他想法」输入框算），或按 option 下标判断。

7. **[代码] `planDone` 不检查仍有待确认问题**
   index.js:496 只看 `plan`，用户可以在提问未答完时确认计划，随后被告知「Every plan item is confirmed，开始实施」。

8. **[代码] 单条 `confirm`/`reject` 通道无人收**
   index.js:540-554 不设置 `feedback`、不 `wakeAgent`；客户端也从不调用（client.js:456、467 只有 `confirmAll`/`settings`）→ 死接口，语义与批量路径不一致。

9. **[代码] `wakeAgent` 静默失败**
   index.js:336-359 必须拿到 `sessionId`；client.js:571-577 用 `sidebarRight.mounted` 兜底。拿不到时确认成功但智能体不继续，用户必须再打字；失败只返回 `woken:false`，界面不提示。

10. **[代码] 发布通道重复实现**
    HTTP `action:'publish'` 与两个 tool 各写一遍，行为不同：route 返回 `truncated`、decisions 分支 `commit()`，plan 分支不重新计算 mode；tool 的 plan 版本不返回 `truncated`。建议抽 `publishDecisions()/publishPlan()` 单一实现，tool 与 route 都调用。

11. **[待验证] 设置改了但纪律文本不重建**
    `const disciplines = buildDisciplines(settings)` 在加载时求值一次（index.js:202），`settings` action 只改内存/配置（index.js:523-537）。若 `configEditor.edit` 不触发 fiber 重启，「每轮最少/最多问题数」要重启才生效。

12. **[代码] 落盘失败被忽略**
    `saveSnapshot()` 返回布尔（index.js:55-65），`commit()`（index.js:394-397）无视它；`revision` 照增。用户以为已发布，重载后丢失。

13. **[代码] `extraRequirements` 只增不减**
    index.js:488 无上限追加（只在加载时 `slice(0,50)`，index.js:43-48），GET 全量返回，面板无清理入口。

## C. 安全（P1）

14. **[代码] CSRF：状态接口可被任意网页驱动**
    `isLoopback()` 只看 Host 头（index.js:114-117）；浏览器访问 `http://127.0.0.1:58478` 时 Host 正好是 `127.0.0.1:58478`，必然通过。POST 不校验 `content-type`（index.js:118-122），`fetch(..., {mode:'no-cors', headers:{'content-type':'text/plain'}, body:'{"action":"confirmAll"}'})` 无需预检即可触发确认/发布/改设置。
    建议：强制 `application/json`（触发预检）+ 校验 `Origin` + 每个面板实例一次性 token。

15. **[代码] `readBody` 无体积上限**（index.js:118-122），JSON 解析失败返回 500（index.js:410、564），应为 400 并限 64KB。

16. **[实测] 状态文件权限过宽**：`better-plan-state.json` 为 `-rwxrwxrwx`，含项目计划正文；建议收紧 ACL 且不加可执行位。

17. **[代码] 无调用方鉴权**：任何本机进程都能 publish/confirm；同时 remote-access 场景下 `isLoopback` 会 403，面板在远端完全不可用且界面无提示。

## D. 客户端 UX / 可访问性（P2）

18. **[代码] 三处轮询**：图标 3s（client.js:154）、面板 2s（427）、auto-open 2.5s（594）；每次全量返回（最坏 200 条 × 4000 字符 ≈ 800KB），`revision` 已存在却未做条件 GET/ETag 或 SSE。

19. **[代码] 失败全静默**：`get()/post()` 把非 2xx/异常吞成 `null`（client.js:74-83）；`confirmBatch` 不检查结果就清草稿（452-462）→ 确认失败时面板无任何提示。

20. **[代码] 草稿只在内存**（client.js:418）：面板卸载或刷新即丢；智能体重发同 id 时旧草稿残留。

21. **[代码] 自定义答案用单行 `input`**（client.js:286-296），服务端允许 4000 字符；无 Enter 提交、长文本体验差。

22. **[代码] 可访问性**：`role="radio"` 的 `button` 无方向键/roving tabindex（client.js:236-284），新条目到达无 `aria-live` 播报；面板只能靠右键打开，没有键盘入口或命令。

23. **[代码] 自动展开过敏感**：以 `revision` 判重（client.js:581-591），但保存设置、单条确认同样 bump revision → 无关操作也会弹面板。

24. **[代码] 无面板内重置**：只有 `DELETE /state`；卸载插件后状态文件残留，重装会看到上次的条目。

## E. i18n / 打包 / 工程化（P2）

25. **[代码] i18n 双源**：`locale/{en,zh}.json` 只有 `meta/on/off/panel`，面板 40+ 文案硬编码在 client.js 的 `DICT`（23-58）；新增语言要改代码，且 locale 的 `on/off/panel` 客户端并未使用。建议面板文案走 `ctx.locale` 资源。

26. **[代码] `package.json`**：缺 `engines.dsh`（无兼容性校验）、`license`（虽有 LICENSE 文件）、`repository`、`scripts`；`files` 未含 README；`exports` 无 `./package.json`。

27. **[代码] 文档**：`docs/DETAIL.md` 仅 10 行、无 `preview.svg`（详情页图片）、无中文详情；README 未说明：关闭开关仍注入 feedback、状态是全局共享、卸载残留。

28. **[代码] 无测试/CI/lint**：`sanitize`、`recomputeMode`、`confirmAll` 语义、`cordis.patch.yml` 与 `package.json` 的一致性均无回归保护；无 `test` 脚本。

29. **[代码] 死代码/泄漏**：`loadSnapshot()` 返回的 `mode` 未使用（index.js:39 vs 203-213）；`attach()` 里的 `prompt.section()` 未登记 disposer（index.js:222-235），插件热重载可能重复挂载。

30. **[代码] 兼容性脆弱**：手工复制 host 内部消息结构（index.js:78-94），`deepFreeze(structuredClone())` 双重开销；host 改结构会静默失效。

31. **[代码] `minPerRound` 口径不一致**：Config schema `min(1)`（index.js:70）、运行时 floor 3（193）、客户端 min=3（client.js:393）、README 写「下限 3」。

32. **[代码] 无并发控制**：发布与确认都是读改写，没有版本比较/CAS（index.js:422-462 vs 464-520），并发时后写覆盖先写。

## 优先级建议

| 优先级 | 条目 |
|---|---|
| P0 | 1、2、3、4、5、6 |
| P1 | 7-13、14-17 |
| P2 | 18-32 |

## 修复状态（2026-11-27，v1.1.0）

| 条目 | 状态 | 落点 |
|---|---|---|
| 1 跨会话共享状态 | 已修 | 会话级快照 `$DSH_HOME/better-plan/<session>.json`；旧文件一次性归档 |
| 2 陈旧 feedback 常驻 | 已修 | 删除 feedback 系统提示段；确认改为一次性 `followup` 消息 |
| 3 关闭开关仍注入 feedback | 已修 | feedback 段已删除；唤醒前检查 `enabled` |
| 4 发布信任 status/answer | 已修 | `sanitizeItems` 强制 pending、清空 answer |
| 5 门禁可绕过 | 已修 | `publishPlan` 检查 awaitingFollowup / 待确认 / minTotal；工具与路由共用 |
| 6 A3 非推荐项追问 | **保留（按要求）** | `confirmAll` 注释标明“刻意保留” |
| 7 计划确认未检查待答问题 | 已修 | `planDone` 增加 `!hasPending(decisions)` |
| 8 单条 confirm/reject 无人收 | 已修 | 两条路径都产生 feedback 并唤醒 |
| 9 wake 静默失败 | 已修 | 返回 `woken:false`，面板提示「请手动发送任意消息」 |
| 10 发布通道重复 | 已修 | `publishThroughTool` 单一实现；路由复用 core |
| 11 截断静默 | 已修 | `truncated` / `belowMinPerRound` 进入工具结果 |
| 12 设置不重建纪律 | 已修 | `refreshDisciplines()`；测试覆盖 |
| 13 落盘失败被忽略 | 已修 | `persisted` 进入所有响应，面板显示失败 |
| 14 extraRequirements 只增不减 | 已修 | 上限 50、响应可清除 |
| 15 CSRF | 已修 | JSON content-type + Origin/Sec-Fetch-Site + 每进程令牌 |
| 16 readBody 无上限/500 | 已修 | 64 KB 上限、400/413 |
| 17 文件权限 | 已修 | 0600 写入 + chmod |
| 18 无调用方鉴权 | 已修 | 令牌；非 loopback 403 且文档说明 |
| 19 三处轮询 | 已修 | 条件 GET（304）、页面隐藏暂停 |
| 20 错误静默 | 已修 | 错误横幅 + 重试 + 409 冲突提示 |
| 21 草稿只存内存 | 已修 | sessionStorage 按会话保留 |
| 22 单行输入框 | 已修 | textarea + Ctrl+Enter |
| 23 可访问性 | 已修 | 方向键/roving tabindex、aria-live、aria-busy |
| 24 自动展开过敏 | 已修 | 以“待确认 id 集合”判重 |
| 25 无面板内重置 | 已修 | 两步确认的重置按钮 |
| 26 i18n 双源 | 已修 | locale JSON 只留 meta（符合 DSH 惯例），文案单一来源在 client |
| 27 package.json 元数据 | 已修 | engines.dsh / license / icon / scripts / files / exports |
| 28 文档与预览 | 已修 | DETAIL + DETAIL.zh + preview.svg + README_en |
| 29 零测试 | 已修 | `lib/core.js` + 31 个 node:test 用例 + CI |
| 30 死代码/泄漏 | 已修 | 移除未用 mode；section 登记 disposer |
| 31 createUserMessage 脆弱 | 已缓解 | 去掉 structuredClone 双开销，保留最小冻结构造 |
| 32 minPerRound 口径 | 已修 | schema/运行时/客户端/README 统一为 3 |
| 33 无并发控制 | 已修 | `x-better-plan-revision` 乐观锁，冲突返回 409 |
