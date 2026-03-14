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
    <p class="tp-doc-kicker">发行</p>
    <h3>统一 CLI 发行</h3>
    <p><code>@fengye404/termpilot</code> 统一提供 relay、agent 和会话管理命令。</p>
  </div>
  <div class="tp-doc-panel">
    <p class="tp-doc-kicker">安全</p>
    <h3>本地优先</h3>
    <p>会话标题、cwd、状态细节和终端输出保留在 agent 所在电脑，relay 仅保留最小元数据。</p>
  </div>
  <div class="tp-doc-panel">
    <p class="tp-doc-kicker">会话</p>
    <h3>基于 tmux 的会话</h3>
    <p>当前会话后端固定为 <code>tmux</code>，支持普通 shell 会话和托管命令会话。</p>
  </div>
  <div class="tp-doc-panel">
    <p class="tp-doc-kicker">同步</p>
    <h3>端侧 replay</h3>
    <p>输出同步基于 <code>tmux capture-pane</code> 的快照替换，最近帧回放由 agent 提供。</p>
  </div>
  <div class="tp-doc-panel">
    <p class="tp-doc-kicker">访问</p>
    <h3>设备级配对</h3>
    <p>浏览器通过一次性配对码、访问令牌和设备指纹与 agent 建立绑定。</p>
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

<div class="tp-doc-links">
  <a class="tp-doc-link" href="./getting-started.md">
    <span class="tp-doc-link-title">快速开始</span>
    <span class="tp-doc-link-body">用当前主路径完成 relay、agent、配对和第一条受管理会话。</span>
  </a>
  <a class="tp-doc-link" href="./cli-reference.md">
    <span class="tp-doc-link-title">CLI 参考</span>
    <span class="tp-doc-link-body">查看命令面、退出语义、配对命令和会话管理入口。</span>
  </a>
  <a class="tp-doc-link" href="./operations-guide.md">
    <span class="tp-doc-link-title">部署与运维</span>
    <span class="tp-doc-link-body">部署 relay、管理 agent、本地状态、授权和常见排障路径。</span>
  </a>
  <a class="tp-doc-link" href="./security-design.md">
    <span class="tp-doc-link-title">安全设计</span>
    <span class="tp-doc-link-body">查看当前安全模型、数据归属、密钥绑定和 relay 职责边界。</span>
  </a>
  <a class="tp-doc-link" href="./architecture.md">
    <span class="tp-doc-link-title">代码架构</span>
    <span class="tp-doc-link-body">理解当前仓库结构、数据流、状态持久化和运行模型。</span>
  </a>
  <a class="tp-doc-link" href="./protocol.md">
    <span class="tp-doc-link-title">协议说明</span>
    <span class="tp-doc-link-body">查看配对流程、WebSocket 消息、加密信封和 HTTP 接口。</span>
  </a>
  <a class="tp-doc-link" href="./roadmap.md">
    <span class="tp-doc-link-title">持续改进计划</span>
    <span class="tp-doc-link-body">了解围绕现有主路径的稳定性、体验、运维与安全强化方向。</span>
  </a>
</div>
