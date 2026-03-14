---
layout: home

hero:
  name: "TermPilot"
  text: "同一条会话，不换上下文"
  tagline: "面向长期任务的本地优先终端会话连续性工具，在桌面与移动端之间持续接入同一条受管理会话。"
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
    details: 桌面与移动端接入的是同一条会话，不是另一条新 shell。
  - title: relay 仅做中转
    details: relay 托管 Web UI、配对与授权路由，只保留最小元数据。
  - title: 基于 tmux 的当前实现
    details: agent 管理本地 tmux 会话，输出通过 ANSI 快照同步到移动端。
  - title: 设备级加密访问
    details: 已配对浏览器与 agent 之间的会话消息以加密信封传输。
---

## 项目定义

TermPilot 面向的是一个明确场景：

**一条终端会话已经在电脑上运行，而你希望离开桌面后仍继续接入这条原会话。**

## 当前模型

<div class="tp-doc-grid">
  <div class="tp-doc-panel">
    <p class="tp-doc-kicker">Package</p>
    <h3>统一 CLI 发行</h3>
    <p><code>@fengye404/termpilot</code> 统一提供 relay、agent 和会话管理命令。</p>
  </div>
  <div class="tp-doc-panel">
    <p class="tp-doc-kicker">Security</p>
    <h3>本地优先</h3>
    <p>会话标题、cwd、状态细节和终端输出保留在 agent 所在电脑，relay 仅保留最小元数据。</p>
  </div>
  <div class="tp-doc-panel">
    <p class="tp-doc-kicker">Session</p>
    <h3>tmux-backed sessions</h3>
    <p>当前会话后端固定为 <code>tmux</code>，支持普通 shell 会话和托管命令会话。</p>
  </div>
  <div class="tp-doc-panel">
    <p class="tp-doc-kicker">Sync</p>
    <h3>端侧 replay</h3>
    <p>输出同步基于 <code>tmux capture-pane</code> 的快照替换，最近帧回放由 agent 提供。</p>
  </div>
  <div class="tp-doc-panel">
    <p class="tp-doc-kicker">Access</p>
    <h3>设备级配对</h3>
    <p>浏览器通过一次性配对码、访问令牌和设备指纹与 agent 建立绑定。</p>
  </div>
</div>

## 当前特性

- 同一条受管理会话可在桌面与移动端连续接入
- relay 同时提供 Web UI、`/ws` 和配对授权入口
- agent 管理本地 tmux 会话，并保留会话主数据与输出
- 浏览器与 agent 之间的会话消息以加密信封传输

## 核心工作流

1. 运行 `termpilot relay`
2. 运行 `termpilot agent`
3. 在手机端输入一次性配对码
4. 通过 `termpilot run -- <command>` 或 `termpilot create` 启动受管理会话

## 当前边界

- 适合长期运行、需要持续观察的终端任务
- 适合移动端查看、轻输入和快捷控制
- 不做远程桌面、图形界面控制或任意历史标签页导入

## 文档入口

主要文档如下：

- [快速开始](./getting-started.md)
- [CLI 参考](./cli-reference.md)
- [部署与运维指南](./operations-guide.md)
- [安全设计](./security-design.md)
- [代码架构](./architecture.md)
- [协议说明](./protocol.md)
- [持续改进计划](./roadmap.md)
