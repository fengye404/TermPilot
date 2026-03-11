---
layout: home

hero:
  name: "TermPilot"
  text: "手机和电脑共享同一个 tmux 会话"
  tagline: "一个 npm 包，两个命令，手机浏览器直接接管你的长期任务。"
  actions:
    - theme: brand
      text: 5 分钟快速上手
      link: /getting-started
    - theme: alt
      text: 部署与运维
      link: /operations-guide
    - theme: alt
      text: GitHub
      link: https://github.com/fengye404/TermPilot

features:
  - title: 一个包
    details: 服务器和电脑都使用同一个 npm 包，对外只暴露 `termpilot relay` 和 `termpilot agent` 两个主命令。
  - title: 手机不安装
    details: relay 同时托管网页和中继层，手机直接打开域名即可，不需要 App Store 或安卓安装包。
  - title: 同一个会话
    details: 电脑和手机看到的是同一批 tmux 会话，创建、查看、关闭和输入都互通。
  - title: 面向长期任务
    details: 适合 Claude Code、OpenCode、脚本批处理和各种需要离开电脑后继续观察的任务。
---

## 你会怎么用它

最短路径只有四步：

1. 在服务器执行 `termpilot relay`
2. 在电脑执行 `termpilot agent`
3. 手机上打开 relay 域名并输入配对码
4. 在电脑执行 `termpilot claude code`

之后你会得到：

- 电脑和手机同步看到同一个会话输出
- 手机上能补命令、发快捷键、关闭会话
- 电脑离开当前桌面后，任务仍然在 `tmux` 里继续运行

## 文档地图

- [快速开始](/getting-started)
- [部署与运维指南](/operations-guide)
- [代码架构](/architecture)
- [协议说明](/protocol)
- [开发文档](/development)

## 推荐阅读顺序

1. 先看 [快速开始](/getting-started)
2. 准备长期部署时再看 [部署与运维指南](/operations-guide)
3. 想改代码时看 [代码架构](/architecture) 和 [开发文档](/development)
