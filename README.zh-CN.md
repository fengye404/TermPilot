# <img src="docs/public/favicon.svg" alt="TermPilot logo" width="28" valign="middle" /> TermPilot

[English](./README.md) | 简体中文

[![npm version](https://img.shields.io/npm/v/%40fengye404%2Ftermpilot)](https://www.npmjs.com/package/@fengye404/termpilot)
[![npm downloads](https://img.shields.io/npm/dm/%40fengye404%2Ftermpilot)](https://www.npmjs.com/package/@fengye404/termpilot)
[![GitHub Actions](https://img.shields.io/github/actions/workflow/status/fengye404/TermPilot/docs.yml?branch=main&label=docs)](https://github.com/fengye404/TermPilot/actions)

让同一条受管理终端会话在电脑和手机之间持续可见、可控制。

TermPilot 是一个本地优先的终端会话连续性工具。它让你在不把会话内容搬进 relay 的前提下，继续从手机访问电脑上那条已经运行中的受管理会话。

> [!TIP]
> 文档站: [TermPilot Docs](https://fengye404.top/TermPilot/) · [快速开始](https://fengye404.top/TermPilot/getting-started) · [CLI 参考](https://fengye404.top/TermPilot/cli-reference) · [部署与运维](https://fengye404.top/TermPilot/operations-guide) · [安全设计](https://fengye404.top/TermPilot/security-design) · [架构](https://fengye404.top/TermPilot/architecture) · [协议](https://fengye404.top/TermPilot/protocol)

> [!IMPORTANT]
> TermPilot 不会自动导入任意 Terminal 或 iTerm 标签页。只有由 TermPilot 创建或管理的会话，才能在手机端继续访问。

## 它是什么

TermPilot 围绕一条很明确的主路径设计：

- 电脑上已经有一条受管理会话在运行
- 你离开了工位
- 你仍然想在手机上继续接入这条原会话

这条会话可以是 Claude Code、部署流程、迁移任务，或者任何长期运行的终端任务。它解决的是会话连续性，不是远程桌面访问。

## 架构

```text
手机浏览器 / PWA  -- https / wss -->  relay  <-- ws / wss -- 电脑上的 agent
                                                   |
                                                   +-- 配对、授权路由、
                                                       审计元数据、Web UI
```

运行时由三部分组成:

- `relay`: HTTP + WebSocket 入口，负责 Web UI 托管、配对、权限控制和加密信封转发
- `agent`: 跑在电脑上的守护进程，负责管理本地会话，并把敏感会话数据留在端侧
- `app`: 由 relay 提供的移动端 Web UI

## 当前模型

- 一个统一 CLI，同时提供 relay、agent 和会话管理命令
- 基于 `tmux` 的受管理会话，输出回放由 agent 提供
- 本地优先的会话状态模型，会话标题、cwd、状态细节和终端输出保留在 agent 所在电脑
- 设备级配对与授权模型，用于浏览器与 agent 之间的加密通信
- relay 持久化默认只保留配对、grant 与审计元数据，长期运行默认使用 SQLite，也可通过 `DATABASE_URL` 切换到 PostgreSQL
- 一个面向移动端的 Web UI，聚焦查看、轻输入和快捷控制
- 托管命令会话带有轻量残留治理，会自动回收长期无人附着且无输出的会话

这是一条刻意收窄的产品边界。TermPilot 解决的是会话连续性，不是桌面远控或通用运维平台。

如果你是从旧版本升级、且本地绑定里还没有本地密钥，需要重新配对一次。

## 快速开始

### 环境要求

服务器和电脑都需要:

- `Node.js 22+`
- `@fengye404/termpilot`

电脑还需要:

- `tmux`

安装:

```bash
npm install -g @fengye404/termpilot
```

### 1. 启动 relay

在服务器或一台手机可访问的机器上执行:

```bash
termpilot relay
```

常用变体:

```bash
termpilot relay start
termpilot relay stop
termpilot relay run
```

默认情况下，relay 会后台启动，监听 `0.0.0.0:8787`，同时提供 Web UI 和 `/ws`，并把 relay 元数据持久化到 `~/.termpilot/relay.db`。

### 2. 启动 agent

在你的电脑上执行:

```bash
termpilot agent
```

首次运行时，agent 会询问 relay 主机和端口，然后:

- 保存本地配置
- 启动后台守护进程
- 打印一次性配对码

如果你希望 agent 长期常驻，更推荐交给系统进程管理器托管：

```bash
termpilot agent --foreground --relay wss://your-domain.com/ws
```

### 3. 手机完成配对

在手机浏览器打开:

- `http://your-domain.com:8787`
- 或反向代理后的 `https://your-domain.com`

输入电脑端打印出来的配对码，随后进入该设备的会话列表。

### 4. 启动受管理会话

如果你主要跑 Claude Code:

```bash
termpilot claude code
```

如果你要跑其他托管命令:

```bash
termpilot run -- opencode
```

如果你想先创建一条普通 shell 会话:

```bash
termpilot create --name my-task --cwd /path/to/project
```

然后再显式接入它:

```bash
termpilot list
termpilot attach --sid <sid>
```

如果你只记一条规则，记这个就够了:

- `termpilot run -- <command>` 表示“围绕这个命令启动一条受管理会话”
- `termpilot create` + `termpilot attach` 表示“先建一条普通 shell 会话，再按需回到它”

## CLI 参考

```bash
termpilot relay
termpilot relay stop
termpilot relay run

termpilot agent
termpilot agent --pair
termpilot agent status
termpilot agent stop

termpilot pair
termpilot create --name my-task --cwd /path/to/project
termpilot list
termpilot attach --sid <sid>
termpilot kill --sid <sid>
termpilot grants
termpilot audit --limit 20
termpilot revoke --token <accessToken>
termpilot doctor

termpilot claude code
termpilot run -- <command>
```

## 配置

默认本地状态目录:

```text
~/.termpilot
```

常见文件:

- `config.json`: agent 保存的 relay 配置
- `agent-runtime.json`: 后台 agent 运行状态
- `relay-runtime.json`: 后台 relay 运行状态
- `state.json`: 本地受管理会话状态
- `device-key.json`: agent 本地设备密钥
- `agent.log` / `relay.log`: 日志

常用环境变量:

- `TERMPILOT_HOME`
- `TERMPILOT_RELAY_URL`
- `TERMPILOT_DEVICE_ID`
- `TERMPILOT_AGENT_TOKEN`
- `TERMPILOT_RELAY_STORE`
- `TERMPILOT_SQLITE_PATH`
- `TERMPILOT_ORPHAN_WARNING_MS`
- `TERMPILOT_MANAGED_SESSION_AUTOCLEANUP_MS`
- `HOST`
- `PORT`
- `DATABASE_URL`
- `TERMPILOT_PAIRING_TTL_MINUTES`

托管命令自动治理默认值:

- `TERMPILOT_ORPHAN_WARNING_MS`: detached 且无输出的预警阈值，默认 `3600000`（1 小时）
- `TERMPILOT_MANAGED_SESSION_AUTOCLEANUP_MS`: detached 且无输出的自动清理阈值，默认 `43200000`（12 小时）

relay 存储默认值:

- `TERMPILOT_RELAY_STORE`: 默认 `sqlite`，可显式设成 `memory`
- `TERMPILOT_SQLITE_PATH`: SQLite 文件路径，默认 `~/.termpilot/relay.db`

示例:

```bash
TERMPILOT_HOME=/data/termpilot termpilot agent
TERMPILOT_RELAY_URL=wss://your-domain.com/ws termpilot agent
HOST=0.0.0.0 PORT=8787 termpilot relay
```

## 部署说明

如果只是快速试通:

- 在一台可访问机器上直接运行 `termpilot relay`
- 手机上打开 `http://your-ip:8787`
- 让 agent 连接 `ws://your-ip:8787/ws`

如果准备长期使用:

- 在服务器上运行 `termpilot relay`
- 前面放一个反向代理
- 手机上使用 `https://your-domain.com`
- agent 使用 `wss://your-domain.com/ws`
- relay 元数据尽量放在 SQLite 或 PostgreSQL 上，而不是易失的内存存储

最小 Caddy 示例:

```caddyfile
your-domain.com {
    reverse_proxy 127.0.0.1:8787
}
```

### relay Docker 镜像

直接使用已经发布好的 relay 镜像:

```bash
docker pull fengye404/termpilot-relay:latest
```

使用持久化卷启动:

```bash
docker run -d \
  --name termpilot-relay \
  -p 8787:8787 \
  -e TERMPILOT_AGENT_TOKEN=change-me \
  -v termpilot-relay-data:/var/lib/termpilot \
  fengye404/termpilot-relay:latest
```

容器内默认把 relay 元数据持久化到 `/var/lib/termpilot/relay.db`。如果你希望固定版本，可以改成 `fengye404/termpilot-relay:0.3.9` 这样的 tag。

## 非目标

TermPilot 明确不打算变成:

- 远程桌面
- 图形界面控制层
- 任意现有终端标签页导入器
- 完整终端日志归档系统
- 通用型多租户运维平台

如果一个任务希望在手机端持续可见、可控制，就应该从一开始运行在 TermPilot 管理的会话里。

## 仓库结构

这个仓库是一个 pnpm workspace monorepo:

- [`src/cli.ts`](./src/cli.ts): 顶层 CLI 入口
- [`agent/`](./agent): 桌面端 agent 与本地会话管理
- [`relay/`](./relay): relay 服务端
- [`app/`](./app): 移动端 Web UI
- [`packages/protocol/`](./packages/protocol): 共享协议定义
- [`docs/`](./docs): VitePress 文档站

## 开发

本地运行:

```bash
pnpm install
pnpm dev:relay
pnpm dev:app
pnpm dev:agent
```

常用检查:

```bash
pnpm typecheck
pnpm build
pnpm test:ui-smoke
pnpm check:stability
pnpm test:isolation
```

## 文档

- [文档站](https://fengye404.top/TermPilot/)
- [Why TermPilot](./docs/why-termpilot.md)
- [快速开始](./docs/getting-started.md)
- [CLI 参考](./docs/cli-reference.md)
- [部署与运维指南](./docs/operations-guide.md)
- [当前架构](./docs/architecture.md)
- [协议说明](./docs/protocol.md)
- [持续改进计划](./docs/roadmap.md)
- [开发文档](./docs/development.md)
- [技术选型记录（2026）](./docs/tech-selection-2026.md)
