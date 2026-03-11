# TermPilot

[![npm version](https://img.shields.io/npm/v/%40fengye404%2Ftermpilot)](https://www.npmjs.com/package/@fengye404/termpilot)
[![npm downloads](https://img.shields.io/npm/dm/%40fengye404%2Ftermpilot)](https://www.npmjs.com/package/@fengye404/termpilot)
[![GitHub Actions](https://img.shields.io/github/actions/workflow/status/fengye404/TermPilot/docs.yml?branch=main&label=docs)](https://github.com/fengye404/TermPilot/actions)

TermPilot 把电脑上的终端任务带到手机浏览器里。你在电脑上继续跑 `Claude Code`、`OpenCode`、脚本任务，出门以后用手机打开一个网页，就能继续看输出、补命令、关会话。

它不是“远程桌面”，也不是“手机新开一个独立终端”。

它的核心模型只有一句话：

**电脑和手机共享同一条终端上下文。**

如果你想先看这个项目的核心优势、适合什么工作流，再看：

- [Why TermPilot](/Users/fengye/workspace/TermPilot/docs/why-termpilot.md)

## 为什么值得用

- 一个包：服务器和电脑都安装同一个 npm 包
- 两个主命令：`termpilot relay` 和 `termpilot agent`
- 手机不安装：直接打开 relay 域名
- 会话不分叉：电脑和手机看到的是同一批任务
- 面向长期任务：尤其适合需要离开电脑后继续观察的 AI 编码场景

## 最短工作流

```bash
# 服务器
termpilot relay

# 电脑
termpilot agent

# 电脑里直接跑任务
termpilot claude code
```

然后：

1. 手机上打开 relay 域名
2. 输入电脑上打印的一次性配对码
3. 进入会话列表
4. 打开刚才那个会话，继续看输出和补命令

## 5 分钟快速开始

### 1. 安装

服务器和电脑都执行：

```bash
npm install -g @fengye404/termpilot
```

电脑还需要提前安装：

- `tmux`（TermPilot 当前用它来承载长期会话）
- `Node.js 22+`

### 2. 启动 relay

在服务器执行：

```bash
termpilot relay
```

默认行为：

- 后台启动
- 默认监听 `0.0.0.0:8787`
- 同时提供网页和 `/ws` WebSocket

如果要停止：

```bash
termpilot relay stop
```

如果要前台看日志：

```bash
termpilot relay run
```

### 3. 启动 agent

在电脑执行：

```bash
termpilot agent
```

第一次运行时，它会交互式询问：

1. relay 域名或 IP
2. relay 端口

然后自动完成这些事：

- 保存本地配置
- 后台启动 agent
- 为这台电脑生成唯一设备名
- 打印一次性配对码

以后日常再执行 `termpilot agent`，它会直接启动或显示当前状态，不会重复初始化。

### 4. 手机完成配对

手机浏览器打开：

- `http://your-domain.com:8787`
- 或者配置好反代后的 `https://your-domain.com`

未配对时，首页只做一件事：

- 输入电脑端打印出来的配对码

配对成功后，会直接进入会话列表。

### 5. 直接跑任务

如果你平时主要跑 Claude Code：

```bash
termpilot claude code
```

如果你主要跑 OpenCode：

```bash
termpilot open code
```

这两条命令都会：

- 创建一个受 TermPilot 管理的任务会话
- 把命令写进这个会话
- 当前终端直接接到这条会话

手机上看到的是同一条会话，不是另开一份。底层当前用 `tmux` 实现。

## 核心能力

### 共享会话，而不是接管屏幕

TermPilot 只关心进入它体系内的终端会话。  
电脑和手机都围绕这批会话工作，不做桌面像素级同步。

### 后台常驻，前台干净

- `termpilot relay` 默认后台运行
- `termpilot agent` 默认后台运行
- 只有你明确排查问题时，才用 `termpilot relay run`

### 单设备配对，按设备授权

手机不是通过“全局密码”看所有终端，而是通过配对码换取某一台电脑的访问令牌。  
新版默认还会为每台电脑生成唯一设备名，避免多台机器都落到 `pc-main` 上发生串台。

## 常用命令

```bash
termpilot relay
termpilot relay stop
termpilot relay run

termpilot agent
termpilot agent --pair
termpilot agent status
termpilot agent stop

termpilot claude code
termpilot open code
termpilot create --name my-task --cwd /path/to/project
termpilot list
termpilot attach --sid <sid>
termpilot kill --sid <sid>
```

## 最佳实践

1. 需要跨端同步的任务，一开始就用 `termpilot claude code`、`termpilot open code` 或 `termpilot create` 启动。
2. 不要让多台电脑复用同一个 `deviceId`。默认自动生成的唯一设备名就够用。
3. 正式使用时优先给 relay 配域名和 HTTPS/WSS，不要长期直接暴露裸 IP。
4. 手机适合看输出、补短命令、发快捷键；大量输入还是建议在电脑完成。
5. 只有你明确需要“管理端查看所有设备”时，才配置 `TERMPILOT_CLIENT_TOKEN`。

## 常见问题

### 为什么普通 Terminal/iTerm 标签页不会自动出现在手机上

因为只有 TermPilot 管理的会话才会同步。  
普通终端标签页不是它的会话源。

### 为什么 `termpilot agent` 没有一直停在前台

这是设计行为。它默认是后台守护进程。  
再次执行时，主要作用是显示状态、重新配对或按配置重启。

### 为什么更新后手机页面像没变

通常是两种情况：

- 服务器或电脑上的 npm 包还没更新
- 手机端 PWA 或浏览器缓存还在吃旧资源

这时先升级并重启：

```bash
npm install -g @fengye404/termpilot@latest
termpilot relay stop && termpilot relay
termpilot agent stop && termpilot agent
```

再清掉手机端这个站点的缓存或重新打开。

## 文档

- [Why TermPilot](/Users/fengye/workspace/TermPilot/docs/why-termpilot.md)
- [文档首页](/Users/fengye/workspace/TermPilot/docs/index.md)
- [快速开始](/Users/fengye/workspace/TermPilot/docs/getting-started.md)
- [部署与运维指南](/Users/fengye/workspace/TermPilot/docs/operations-guide.md)
- [当前架构](/Users/fengye/workspace/TermPilot/docs/architecture.md)
- [协议说明](/Users/fengye/workspace/TermPilot/docs/protocol.md)
- [开发文档](/Users/fengye/workspace/TermPilot/docs/development.md)

## 本地开发

```bash
pnpm install
pnpm build
pnpm docs:dev
pnpm test:ui-smoke
pnpm check:stability
pnpm test:isolation
```
