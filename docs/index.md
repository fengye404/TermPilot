---
layout: home

hero:
  name: "TermPilot"
  text: "同一条终端会话，跨端连续可见"
  tagline: "一个面向长期任务的终端会话连续性工具，用于在桌面与移动端之间共享同一条受管理会话。"
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
    details: 桌面与移动端连接的是同一条会话，不是另一条新 shell。
  - title: 一个入口，三段运行时
    details: 同一个 npm 包提供 relay、agent 和移动端 Web UI。
  - title: 基于 tmux 的当前实现
    details: agent 管理本地 tmux 会话，输出通过 ANSI 快照同步到移动端。
  - title: 边界明确，不做大而全
    details: 当前产品聚焦终端会话连续性，不扩展成远程桌面或通用运维平台。
---

## 项目定义

TermPilot 解决的不是“重新进入一台机器”，而是：

**让一条已经在电脑上运行的终端会话，在离开桌面之后仍可被移动端继续接入。**

## 当前特性

<div class="tp-doc-grid">
  <div class="tp-doc-panel">
    <p class="tp-doc-kicker">Package</p>
    <h3>统一 CLI 发行</h3>
    <p><code>@fengye404/termpilot</code> 统一提供 relay、agent 和会话管理命令。</p>
  </div>
  <div class="tp-doc-panel">
    <p class="tp-doc-kicker">Runtime</p>
    <h3>relay / agent / app</h3>
    <p>relay 托管 Web UI 并提供 WebSocket，agent 管理本地会话，app 直接运行在浏览器中。</p>
  </div>
  <div class="tp-doc-panel">
    <p class="tp-doc-kicker">Session</p>
    <h3>tmux-backed sessions</h3>
    <p>当前会话后端固定为 <code>tmux</code>，支持普通 shell 会话和托管命令会话。</p>
  </div>
  <div class="tp-doc-panel">
    <p class="tp-doc-kicker">Sync</p>
    <h3>ANSI snapshot replay</h3>
    <p>输出同步基于 <code>tmux capture-pane</code> 的快照替换，relay 负责最近帧 replay。</p>
  </div>
</div>

## 核心工作流

最小工作流如下：

1. 在服务器执行 `termpilot relay`
2. 在电脑执行 `termpilot agent`
3. 手机上打开 relay 域名并输入配对码
4. 在电脑执行 `termpilot claude code` 或 `termpilot run -- <command>`

```bash
termpilot relay
termpilot agent
termpilot claude code
```

## 当前范围

当前产品适合：

- Claude Code 与其他长期运行的终端任务
- 部署、迁移、抓取、批处理等需要持续观察的工作流
- 以查看和轻控制为主的移动端接入

当前产品不覆盖：

- 远程桌面
- 图形界面控制
- 任意 Terminal / iTerm 历史标签页导入
- 手机端重度终端编辑

## 文档入口

主要文档如下：

- [快速开始](./getting-started.md)
- [CLI 参考](./cli-reference.md)
- [部署与运维指南](./operations-guide.md)
- [代码架构](./architecture.md)
- [协议说明](./protocol.md)
- [持续改进计划](./roadmap.md)
