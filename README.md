# Better Plan

一个 DeepSeek Harness（DSH）Web 客户端插件：把「先提问、再计划」的两阶段协作流程搬到右侧边栏的决策面板里，用**一次点击**确认整批内容。

## 它解决什么

和 AI 协作最常见的失败是**没对齐就动手**。这个插件把对齐过程变成可点选的面板流程：

1. **提问阶段** —— 智能体把设计问题发布到右侧面板，每题带可点选项，推荐项已预选。你在面板底部点一次「全部确认」就整批接受。
2. **计划阶段** —— 所有问题确认后，智能体发布有序计划，同样是面板上点一次确认。
3. **只有计划确认后才开始实施**。

聊天里只报数量（如「已发布 4 条待确认」），问题和计划都在面板上。

## 目录结构

```
.
├── AGENTS.md                  # 仓库的智能体协作约定
├── LICENSE                    # MIT
├── README.md                  # 本文件
├── docs/agents/               # 领域文档与 issue tracker 约定
│   ├── domain.md
│   └── issue-tracker.md
└── better-plan/               # 插件本体
    ├── index.js               # Host 侧：工具、路由、状态机、持久化
    ├── client.js              # Client 侧：右侧面板、输入框图标
    ├── disciplines.js         # 内置的提问 / 计划纪律文本
    ├── cordis.patch.yml       # 插件装载行
    ├── package.json
    ├── locale/{en,zh}.json
    ├── docs/DETAIL.md
    ├── icon.svg
    ├── README.md              # 安装细节
    └── node_modules/          # 内置 schemastery，离线可用
```

## 安装

见 [better-plan/README.md](better-plan/README.md)。简版三步：

1. 解压到任意目录
2. 用 `plugin_manager` 的 `install_bundle`，`target` 指向解压后的 `better-plan` 目录（必须是**绝对路径**）
3. 重启 DSH，刷新页面

## 转移到另一台电脑

把整包 zip 拷过去，解压即是一个可用的 git 仓库（`.git` 保留在包内），并已内置依赖，无需联网。

## 许可

MIT，见 [LICENSE](LICENSE)。
