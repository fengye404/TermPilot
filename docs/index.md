---
layout: home

hero:
  name: "TermPilot"
  text: "同一条终端会话，跨端连续可见"
  tagline: "一个本地优先的终端会话连续性工具，在桌面与移动端之间共享同一条受管理会话。"
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
  - title: relay 仅做中转
    details: relay 托管 Web UI、配对与授权路由，不保存会话内容。
  - title: 基于 tmux 的当前实现
    details: agent 管理本地 tmux 会话，输出通过 ANSI 快照同步到移动端。
  - title: 端到端加密
    details: 已配对浏览器与 agent 之间的会话消息采用端到端加密。
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
    <p class="tp-doc-kicker">Security</p>
    <h3>本地优先</h3>
    <p>会话标题、cwd、状态细节和终端输出保留在 agent 所在电脑，不写入 relay。</p>
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
</div>

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
