---
layout: home

hero:
  name: "TermPilot"
  text: "手机和电脑共享同一条终端上下文"
  tagline: "为 Claude Code、OpenCode 和长期命令行任务设计的跨端终端控制工具。"
  actions:
    - theme: brand
      text: 快速开始
      link: /getting-started
    - theme: alt
      text: 演进路线图
      link: /roadmap
    - theme: alt
      text: Why TermPilot
      link: /why-termpilot
    - theme: alt
      text: 部署与运维
      link: /operations-guide

features:
  - title: 同一个会话
    details: 电脑和手机看到的是同一条受管理终端会话，不是重新开出来的另一条 shell。
  - title: 一个 relay，两端接入
    details: relay 同时负责 Web UI、WebSocket 中继、配对、授权和最近输出缓冲。
  - title: 当前底座是 tmux
    details: agent 在电脑上管理本地 tmux 会话，并把状态和输出同步到 relay。
  - title: 面向长期任务
    details: 更适合 AI 编码、部署、迁移、批处理这类会持续运行的终端工作流。
---

## TermPilot 解决什么问题

很多“手机控制电脑”的工具，本质上是远程桌面或者远程 SSH。

它们的问题是：

- 远程桌面太重，不适合只看终端任务
- 远程 SSH 开出来的是另一条新会话，不是电脑前那一条
- AI 编码或长时间脚本任务最需要的是“同一个会话继续活着”

TermPilot 的解法很直接：

**把电脑上的长期终端任务，变成手机和电脑都能接上的共享会话。**

如果你想先看这个项目的核心优势，而不是直接看安装步骤，先读：

- [Why TermPilot](/why-termpilot)

如果你想看这个项目未来一年最重要的演进方向，尤其是安全、本地优先、E2EE 和 relay 零知识形态，先读：

- [产品演进路线图](/roadmap)

## 你应该先看哪份文档

- 想最快跑通：看 [快速开始](/getting-started)
- 想长期部署：看 [部署与运维指南](/operations-guide)
- 想理解实现：看 [代码架构](/architecture) 和 [协议说明](/protocol)
- 想看未来方向：看 [产品演进路线图](/roadmap)
- 想保持界面一致：看 [设计系统](/design-system)

## 你会怎么用它

最常见的一条路径只有四步：

1. 在服务器执行 `termpilot relay`
2. 在电脑执行 `termpilot agent`
3. 手机上打开 relay 域名并输入配对码
4. 在电脑执行 `termpilot claude code`

之后你会得到：

- 电脑和手机同步看到同一个会话输出
- 手机上可以补命令、发快捷键、关闭会话
- 电脑离开当前桌面以后，任务仍然会继续运行

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
- [产品演进路线图](/roadmap)
- [设计系统](/design-system)
- [开发文档](/development)
