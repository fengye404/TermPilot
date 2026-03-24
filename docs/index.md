---
layout: home

hero:
  name: "TermPilot"
  text: "把电脑上的终端会话继续带到手机上"
  tagline: "它不是远控桌面，也不是在手机上重开一个 shell。TermPilot 做的是另一件事：电脑上那条已经跑起来的会话，离开工位之后还能继续接上。"
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
  - title: 接的是原会话
    details: 桌面和手机看到的是同一条受管理会话，不是后来又开的第二个终端。
  - title: 数据留在电脑侧
    details: 会话标题、cwd、状态和终端输出都保留在 agent 所在电脑，relay 只管入口、授权和路由。
  - title: 适合长任务
    details: Claude Code、部署、迁移、批处理这类会跑很久的任务，才是它真正想解决的场景。
  - title: 手机端只做必要的事
    details: 查看输出、补一条命令、发快捷键、切专注模式，这些都行；重度终端编辑不是它的目标。
  - title: 部署路径短
    details: 一个 relay，一个 agent，一部手机浏览器，主路径收敛得很短，适合个人长期使用。
---

## 它解决的是什么问题

TermPilot 对准的是一个很具体的场景：

**一条终端任务已经在你的电脑上跑起来了，你离开桌面之后，还想继续看这条会话，并在必要时补一点轻量操作。**

很多远程方案解决的是“怎么再进一台机器”。TermPilot 解决的是另一件事：怎么把原来那条上下文继续接住。

## 它现在是什么

<div class="tp-doc-grid">
  <div class="tp-doc-panel">
    <p class="tp-doc-kicker">发行</p>
    <h3>统一 CLI</h3>
    <p><code>@fengye404/termpilot</code> 统一提供 relay、agent、配对和会话管理命令。</p>
  </div>
  <div class="tp-doc-panel">
    <p class="tp-doc-kicker">会话</p>
    <h3>tmux 作为当前后端</h3>
    <p>agent 管理本地 <code>tmux</code> 会话，当前覆盖普通 shell 会话和托管命令两条主路径。</p>
  </div>
  <div class="tp-doc-panel">
    <p class="tp-doc-kicker">同步</p>
    <h3>端侧输出回放</h3>
    <p>输出同步由 agent 提供，页面回到前台后会补齐缺失输出，尽快把会话追平。</p>
  </div>
  <div class="tp-doc-panel">
    <p class="tp-doc-kicker">安全</p>
    <h3>设备级配对</h3>
    <p>浏览器通过一次性配对码、访问令牌和设备指纹与 agent 建立绑定。</p>
  </div>
  <div class="tp-doc-panel">
    <p class="tp-doc-kicker">部署</p>
    <h3>单机长期运行</h3>
    <p>relay 默认用 SQLite 持久化最小元数据，适合个人部署和一条命令长期跑着。</p>
  </div>
</div>

## 主路径

1. 在服务器或可访问机器上启动 `relay`
2. 在你的电脑上启动 `agent`
3. 手机浏览器输入一次性配对码
4. 用 `termpilot run -- <command>` 或 `termpilot create` 启动受管理会话
5. 桌面和手机继续接入同一条会话

## 文档地图

<div class="tp-doc-links">
  <a class="tp-doc-link" href="/why-termpilot">
    <span class="tp-doc-link-title">产品概览</span>
    <span class="tp-doc-link-body">先看清楚它和 SSH、远控、手机终端到底有什么边界差异。</span>
  </a>
  <a class="tp-doc-link" href="/getting-started">
    <span class="tp-doc-link-title">快速开始</span>
    <span class="tp-doc-link-body">按最短路径跑通 relay、agent、配对和第一条共享会话。</span>
  </a>
  <a class="tp-doc-link" href="/deployment-guide">
    <span class="tp-doc-link-title">部署指南</span>
    <span class="tp-doc-link-body">只看 relay 怎么长期部署、怎么挂公网、怎么验收。</span>
  </a>
  <a class="tp-doc-link" href="/agent-operations">
    <span class="tp-doc-link-title">Agent 运维</span>
    <span class="tp-doc-link-body">看 agent 怎么托管、配对、看日志，以及怎么处理本地会话。</span>
  </a>
  <a class="tp-doc-link" href="/troubleshooting">
    <span class="tp-doc-link-title">故障排查</span>
    <span class="tp-doc-link-body">按症状排查页面打不开、配对失败、设备不见了、会话不同步这些问题。</span>
  </a>
  <a class="tp-doc-link" href="/cli-reference">
    <span class="tp-doc-link-title">CLI 参考</span>
    <span class="tp-doc-link-body">集中看命令面，尤其是最容易搞混的退出语义。</span>
  </a>
  <a class="tp-doc-link" href="/security-design">
    <span class="tp-doc-link-title">安全设计</span>
    <span class="tp-doc-link-body">看数据留在哪里、配对怎么建绑定、relay 到底能看到什么。</span>
  </a>
  <a class="tp-doc-link" href="/architecture">
    <span class="tp-doc-link-title">代码架构</span>
    <span class="tp-doc-link-body">看代码组织、运行时数据流和现在这套拆分背后的取舍。</span>
  </a>
  <a class="tp-doc-link" href="/protocol">
    <span class="tp-doc-link-title">协议说明</span>
    <span class="tp-doc-link-body">看配对流程、WebSocket 消息分层和几个关键 HTTP 接口。</span>
  </a>
  <a class="tp-doc-link" href="/roadmap">
    <span class="tp-doc-link-title">持续改进计划</span>
    <span class="tp-doc-link-body">看这条主路径接下来优先补哪些稳定性、体验和安全问题。</span>
  </a>
</div>
