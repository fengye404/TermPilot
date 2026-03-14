---
layout: home

hero:
  name: "TermPilot"
  text: "共享同一条终端会话，不丢上下文"
  tagline: "面向 Claude Code、部署和长期任务的跨端终端连续性工具。当前产品已经具备完整主路径，而不是概念原型。"
  actions:
    - theme: brand
      text: 快速开始
      link: /getting-started
    - theme: alt
      text: CLI 参考
      link: /cli-reference
    - theme: alt
      text: 代码架构
      link: /architecture
    - theme: alt
      text: 部署与运维
      link: /operations-guide

features:
  - title: 同一条受管理会话
    details: 手机和电脑看到的是同一条会话，不是第二条新 shell，适合 Claude Code、部署、迁移和批处理这类长期任务。
  - title: 一个入口，三段运行时
    details: 同一个 npm 包提供 relay、agent 和移动端 Web UI，主路径简单，部署边界清楚。
  - title: 当前实现可直接使用
    details: 当前版本已经覆盖 relay、配对、共享会话、移动端查看与轻控制，不需要先等待大改版。
  - title: 边界明确，不做大而全
    details: 它专注终端会话连续性，不扩展成远程桌面、GUI 控制层或通用多租户运维平台。
---

## 当前定位

TermPilot 的核心不是“远程进入一台机器”，而是：

**让一条已经在电脑上运行的终端会话，可以被手机继续接上，并保持同一条上下文。**

从当前代码看，它已经是一个完整产品，而不是只有想法的实验：

<div class="tp-doc-grid">
  <div class="tp-doc-panel">
    <p class="tp-doc-kicker">Product Shape</p>
    <h3>一个 npm 包，一个统一 CLI</h3>
    <p>发行形态是 <code>@fengye404/termpilot</code>，对外入口统一收敛为 <code>termpilot</code>。</p>
  </div>
  <div class="tp-doc-panel">
    <p class="tp-doc-kicker">Runtime</p>
    <h3>relay、agent、app 三段运行时</h3>
    <p>relay 提供网页和 WebSocket，agent 管理本地会话，移动端直接使用浏览器接入。</p>
  </div>
  <div class="tp-doc-panel">
    <p class="tp-doc-kicker">Session Model</p>
    <h3>当前底座是 tmux</h3>
    <p>会话由 agent 创建和管理，输出通过 ANSI 快照同步，移动端聚焦查看和轻控制。</p>
  </div>
  <div class="tp-doc-panel">
    <p class="tp-doc-kicker">Persistence</p>
    <h3>默认内存，PostgreSQL 可选</h3>
    <p>不配 <code>DATABASE_URL</code> 时用内存模式；需要更长期的服务端状态时再接 PostgreSQL。</p>
  </div>
</div>

## 核心工作流

第一次跑通，主路径通常只有四步：

1. 在服务器执行 `termpilot relay`
2. 在电脑执行 `termpilot agent`
3. 手机上打开 relay 域名并输入配对码
4. 在电脑执行 `termpilot claude code` 或 `termpilot run -- <command>`

最小命令序列：

```bash
termpilot relay
termpilot agent
termpilot claude code
```

如果你更喜欢先手动建一条 shell 会话，也可以：

```bash
termpilot create --name my-task --cwd /path/to/project
termpilot list
termpilot attach --sid <sid>
```

## 适合什么

TermPilot 当前最适合这些场景：

- Claude Code、AI 编码 agent 持续运行
- 部署、迁移、抓取、批处理等长期任务
- 你离开工位后，只需要继续观察进度并做轻量控制

它当前不试图解决：

- 远程桌面
- 图形界面控制
- 任意 Terminal / iTerm 历史标签页导入
- 手机端重度终端编辑

## 从哪开始

按阅读顺序推荐：

- 先想跑通：看 [快速开始](./getting-started.md)
- 先想查命令：看 [CLI 参考](./cli-reference.md)
- 先想长期部署：看 [部署与运维指南](./operations-guide.md)
- 先想理解实现：看 [代码架构](./architecture.md) 和 [协议说明](./protocol.md)
- 先想看后续打磨方向：看 [持续改进计划](./roadmap.md)
