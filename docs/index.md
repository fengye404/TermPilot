---
layout: home

hero:
  name: "TermPilot"
  text: "手机和电脑共享同一个 tmux 会话"
  tagline: "为 Claude Code、OpenCode 和长期命令行任务设计的跨端终端控制工具。"
  actions:
    - theme: alt
      text: Why TermPilot
      link: /why-termpilot
    - theme: brand
      text: 快速开始
      link: /getting-started
    - theme: alt
      text: 部署与运维
      link: /operations-guide
    - theme: alt
      text: GitHub
      link: https://github.com/fengye404/TermPilot

features:
  - title: 一个包，两端通用
    details: 服务器和电脑都安装同一个 npm 包。对外只需要记住 `termpilot relay` 和 `termpilot agent`。
  - title: 手机不安装
    details: relay 同时托管网页和 WebSocket，中转层和 Web UI 在一起，手机浏览器直接打开域名即可。
  - title: 共享同一个会话
    details: 电脑和手机看到的是同一批 tmux 会话，不是“一边一个独立终端”。
  - title: 面向长期任务
    details: 特别适合需要离开电脑后继续观察 AI 编码、脚本、部署或批处理任务的场景。
---

## TermPilot 解决什么问题

很多“手机控制电脑”的工具，本质上是远程桌面或者远程 SSH。

它们的问题是：

- 远程桌面太重，不适合只看终端任务
- 远程 SSH 开出来的是另一条新会话，不是电脑前那一条
- AI 编码或长时间脚本任务最需要的是“同一个会话继续活着”

TermPilot 的解法很直接：

**把电脑上的 tmux 会话变成手机和电脑都能接上的共享终端。**

如果你想先看这个判断背后的完整分析，而不是直接看安装步骤，先读：

- [Why TermPilot](/why-termpilot)

## 你会怎么用它

最常见的一条路径只有四步：

1. 在服务器执行 `termpilot relay`
2. 在电脑执行 `termpilot agent`
3. 手机上打开 relay 域名并输入配对码
4. 在电脑执行 `termpilot claude code`

之后你会得到：

- 电脑和手机同步看到同一个会话输出
- 手机上可以补命令、发快捷键、关闭会话
- 电脑离开当前桌面以后，任务仍然在 `tmux` 里继续运行

## 选择阅读路径

### 我只想先跑起来

先看 [快速开始](/getting-started)。

这份文档会带你完成：

- 安装
- 启动 relay
- 启动 agent
- 手机配对
- 跑第一个可同步任务

### 我准备长期部署

看 [部署与运维指南](/operations-guide)。

它会覆盖：

- 推荐拓扑
- 域名和 HTTPS/WSS
- 生产部署
- 运维动作
- 排障与安全边界

### 我准备改代码

先看这几份：

- [代码架构](/architecture)
- [协议说明](/protocol)
- [开发文档](/development)

## 这套系统的边界

TermPilot 目前专注于一个明确问题：

- 终端会话跨端共享

它不解决这些事情：

- 远程桌面
- 图形界面控制
- 自动接管任意历史终端标签页

如果一个任务要被手机继续看和控制，就应该从一开始运行在 TermPilot 管理的会话里。

## 文档地图

- [Why TermPilot](/why-termpilot)
- [快速开始](/getting-started)
- [部署与运维指南](/operations-guide)
- [代码架构](/architecture)
- [协议说明](/protocol)
- [开发文档](/development)
