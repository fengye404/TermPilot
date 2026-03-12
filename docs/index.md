---
layout: home

hero:
  name: "TermPilot"
  text: "把同一条终端会话继续带到手机上"
  tagline: "一个面向长期任务的终端会话连续性工具。当前实现基于 tmux、relay 和移动端 Web UI。"
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
      text: 演进路线图
      link: /roadmap

features:
  - title: 同一条会话，不是第二条 shell
    details: 手机和电脑看到的是同一条受 TermPilot 管理的会话，适合 Claude Code、部署、迁移和批处理这类长期任务。
  - title: 一个 relay，内建网页和 WebSocket
    details: relay 同时负责静态 Web UI 托管、WebSocket 中继、一次性配对、授权、审计和最近输出缓冲。
  - title: 当前底座是 tmux
    details: agent 在电脑上创建和管理本地 tmux 会话，并通过 capture-pane 抓取 ANSI 快照同步到移动端。
  - title: 长期方向是本地优先和 E2EE
    details: 当前实现仍是 relay 可见明文和最近缓冲的模型，长期目标是本地优先、零知识 relay 和端到端加密。
---

## 当前实现一览

如果你想快速判断这个项目现在到底“已经做到哪一步”，可以先看这几条：

- 发行形态是一个 npm 包：`@fengye404/termpilot`
- 外部入口是统一 CLI：`termpilot`
- 当前会话后端固定为 `tmux`
- relay 同时提供 HTTP 页面、`/ws` WebSocket 和若干 `/api/*` 管理接口
- 移动端是由 relay 托管的 React PWA
- 输出同步方式是 `tmux capture-pane` 快照替换，relay 负责缓存最近帧用于 replay
- relay 默认使用内存存储；设置 `DATABASE_URL` 后会切到 PostgreSQL 存储会话元数据、配对授权和审计

这些都是“现在代码里已经存在的东西”，不是路线图里的未来目标。

## 最短路径

第一次真正跑起来，最短链路通常只有四步：

1. 在服务器执行 `termpilot relay`
2. 在电脑执行 `termpilot agent`
3. 手机上打开 relay 域名并输入配对码
4. 在电脑执行 `termpilot claude code` 或 `termpilot run -- <command>`

如果你更喜欢先手动建一条 shell 会话，也可以：

```bash
termpilot create --name my-task --cwd /path/to/project
termpilot list
termpilot attach --sid <sid>
```

## 文档怎么读

按使用顺序推荐这样看：

- 想先跑通：看 [快速开始](./getting-started.md)
- 想知道每个命令怎么用、怎么退出：看 [CLI 参考](./cli-reference.md)
- 想部署到服务器并长期运行：看 [部署与运维指南](./operations-guide.md)
- 想理解代码边界和数据流：看 [代码架构](./architecture.md) 和 [协议说明](./protocol.md)
- 想看未来主线：看 [产品演进路线图](./roadmap.md)

## 现在它不做什么

TermPilot 当前不是：

- 远程桌面
- 图形界面控制
- 任意 Terminal / iTerm 历史标签页导入器
- 完整终端日志归档系统
- 通用多租户运维平台

如果一个任务希望在手机端持续可见、可控制，就应该从一开始运行在 TermPilot 管理的会话里。

## 文档地图

- [Why TermPilot](./why-termpilot.md)
- [快速开始](./getting-started.md)
- [CLI 参考](./cli-reference.md)
- [部署与运维指南](./operations-guide.md)
- [代码架构](./architecture.md)
- [协议说明](./protocol.md)
- [开发文档](./development.md)
- [技术选型](./tech-selection-2026.md)
- [设计系统](./design-system.md)
- [产品演进路线图](./roadmap.md)
