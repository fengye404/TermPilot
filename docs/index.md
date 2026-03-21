---
layout: home

hero:
  name: "TermPilot"
  text: "让同一条终端会话持续可达"
  tagline: "面向长期任务的本地优先终端会话连续性工具。电脑继续运行原会话，手机继续接入同一条上下文。"
  actions:
    - theme: brand
      text: 快速开始
      link: /getting-started
    - theme: alt
      text: 部署指南
      link: /deployment-guide
    - theme: alt
      text: 产品概览
      link: /why-termpilot
    - theme: alt
      text: CLI 参考
      link: /cli-reference

features:
  - title: 同一条受管理会话
    details: 桌面和移动端接入的是同一条会话，不需要重新开一个 shell。
  - title: 本地优先的数据归属
    details: 会话标题、cwd、状态详情和终端输出保留在 agent 所在电脑，relay 只保留最小元数据。
  - title: relay 与 agent 分层
    details: relay 负责入口、配对、授权和加密路由；agent 负责本地 tmux 会话和输出同步。
  - title: 面向长期任务
    details: 适合 Claude Code、部署、迁移、脚本执行等需要离开桌面后继续查看和轻控制的任务。
  - title: 移动端终端工作区
    details: 手机端提供终端键盘、快速输入、快捷控制和专注模式，适合轻量查看与补命令。
---

## 产品定位

TermPilot 面向的是一个很明确的使用场景：

**一条终端任务已经在你的电脑上运行，而你希望在离开桌面之后，继续从手机接入这条原会话。**

它围绕同一条长期任务在多端之间持续可达来设计。

## 当前产品形态

<div class="tp-doc-grid">
  <div class="tp-doc-panel">
    <p class="tp-doc-kicker">发行</p>
    <h3>统一 CLI</h3>
    <p><code>@fengye404/termpilot</code> 统一提供 relay、agent、配对和会话管理命令。</p>
  </div>
  <div class="tp-doc-panel">
    <p class="tp-doc-kicker">会话</p>
    <h3>tmux 作为当前后端</h3>
    <p>agent 管理本地 <code>tmux</code> 会话，当前支持普通 shell 会话和托管命令会话。</p>
  </div>
  <div class="tp-doc-panel">
    <p class="tp-doc-kicker">同步</p>
    <h3>端侧输出回放</h3>
    <p>输出同步由 agent 提供，页面回到前台后会主动补齐缺失输出，保持当前会话尽快追平。</p>
  </div>
  <div class="tp-doc-panel">
    <p class="tp-doc-kicker">安全</p>
    <h3>设备级配对</h3>
    <p>浏览器通过一次性配对码、访问令牌和设备指纹与 agent 建立绑定。</p>
  </div>
  <div class="tp-doc-panel">
    <p class="tp-doc-kicker">部署</p>
    <h3>单机长期运行</h3>
    <p>relay 默认使用 SQLite 持久化最小元数据，适合一条命令启动和单机长期运行。</p>
  </div>
</div>

## 典型路径

1. 在服务器或可访问机器上启动 `relay`
2. 在你的电脑上启动 `agent`
3. 手机浏览器输入一次性配对码
4. 用 `termpilot run -- <command>` 或 `termpilot create` 启动受管理会话
5. 在桌面和手机之间继续接入同一条上下文

## 文档地图

<div class="tp-doc-links">
  <a class="tp-doc-link" href="/why-termpilot">
    <span class="tp-doc-link-title">产品概览</span>
    <span class="tp-doc-link-body">理解它解决什么问题、适合什么任务，以及当前的产品边界。</span>
  </a>
  <a class="tp-doc-link" href="/getting-started">
    <span class="tp-doc-link-title">快速开始</span>
    <span class="tp-doc-link-body">用当前主路径完成 relay、agent、配对和第一条受管理会话。</span>
  </a>
  <a class="tp-doc-link" href="/deployment-guide">
    <span class="tp-doc-link-title">部署指南</span>
    <span class="tp-doc-link-body">选择 npm CLI 或 Docker 部署 relay，并配置公网入口、SQLite 和反向代理。</span>
  </a>
  <a class="tp-doc-link" href="/agent-operations">
    <span class="tp-doc-link-title">Agent 运维</span>
    <span class="tp-doc-link-body">管理 agent、配对、授权、本地状态目录、日志和会话治理。</span>
  </a>
  <a class="tp-doc-link" href="/troubleshooting">
    <span class="tp-doc-link-title">故障排查</span>
    <span class="tp-doc-link-body">按症状定位“打不开页面、配对失败、看不到设备、看不到会话”等常见问题。</span>
  </a>
  <a class="tp-doc-link" href="/cli-reference">
    <span class="tp-doc-link-title">CLI 参考</span>
    <span class="tp-doc-link-body">查看命令面、退出语义、配对命令和会话管理入口。</span>
  </a>
  <a class="tp-doc-link" href="/security-design">
    <span class="tp-doc-link-title">安全设计</span>
    <span class="tp-doc-link-body">查看数据归属、密钥绑定、加密信封和 relay 的安全职责边界。</span>
  </a>
  <a class="tp-doc-link" href="/architecture">
    <span class="tp-doc-link-title">代码架构</span>
    <span class="tp-doc-link-body">理解仓库结构、运行时数据流、状态持久化和当前架构取舍。</span>
  </a>
  <a class="tp-doc-link" href="/protocol">
    <span class="tp-doc-link-title">协议说明</span>
    <span class="tp-doc-link-body">查看配对流程、WebSocket 消息、加密信封和 HTTP 接口。</span>
  </a>
  <a class="tp-doc-link" href="/roadmap">
    <span class="tp-doc-link-title">持续改进计划</span>
    <span class="tp-doc-link-body">了解围绕现有主路径的稳定性、体验、运维和安全增强方向。</span>
  </a>
</div>
