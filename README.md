# <img src="docs/public/favicon.svg" alt="TermPilot logo" width="28" valign="middle" /> TermPilot

[![npm version](https://img.shields.io/npm/v/%40fengye404%2Ftermpilot)](https://www.npmjs.com/package/@fengye404/termpilot)
[![npm downloads](https://img.shields.io/npm/dm/%40fengye404%2Ftermpilot)](https://www.npmjs.com/package/@fengye404/termpilot)
[![GitHub Actions](https://img.shields.io/github/actions/workflow/status/fengye404/TermPilot/docs.yml?branch=main&label=docs)](https://github.com/fengye404/TermPilot/actions)

把电脑上的长期终端任务带到手机浏览器里。

TermPilot 不是远程桌面，也不是“手机重新 SSH 开一条新会话”。它的目标更窄，也更实用: 让电脑和手机共享同一条终端上下文，继续查看输出、补命令、关闭会话。

它尤其适合这些场景:

- 电脑上跑 `Claude Code`、`OpenCode`、部署脚本、批处理任务
- 人离开工位以后，想在手机上继续盯输出和做轻操作
- 希望电脑端和手机端看到的是同一条会话，而不是两条分叉终端

> [!IMPORTANT]
> 只有通过 TermPilot 创建或接管的会话会同步到手机。普通 Terminal / iTerm 标签页不会自动出现。

## 为什么是它

- 一个 npm 包，同时覆盖 relay、agent 和 Web UI
- 手机上不安装 App，直接打开 relay 域名
- 电脑和手机共享同一个会话，不做屏幕级像素同步
- 默认面向长期任务，适合 AI 编码和长时间命令行工作流
- 设备按配对码授权，不靠一个全局密码暴露所有终端

如果你想先理解产品定位和边界，先看 [Why TermPilot](./docs/why-termpilot.md)。

## 工作方式

```text
手机浏览器  -- https / wss -->  relay  <-- ws / wss -- 电脑上的 agent
                                      |
                                      +-- 配对、授权、会话元数据、输出转发、Web UI
```

运行模型只有三个角色:

- `relay`: 跑在服务器或局域网机器上，提供网页、WebSocket 中继、配对和权限控制
- `agent`: 跑在你的电脑上，管理本地 `tmux` 会话并连接 relay
- `app`: 手机浏览器访问的前端，不需要单独安装

## 快速开始

### 1. 准备环境

服务器和电脑都需要:

- `Node.js 22+`
- `@fengye404/termpilot`

电脑还需要:

- `tmux`

安装:

```bash
npm install -g @fengye404/termpilot
```

### 2. 启动 relay

在服务器执行:

```bash
termpilot relay
```

常用变体:

```bash
termpilot relay start
termpilot relay stop
termpilot relay run
```

默认行为:

- 后台启动
- 监听 `0.0.0.0:8787`
- 同时提供网页和 `/ws` WebSocket

### 3. 启动 agent

在电脑执行:

```bash
termpilot agent
```

第一次运行会提示输入 relay 域名或 IP，以及端口。完成后会自动:

- 保存本地配置
- 后台启动 agent
- 输出一次性配对码

以后再次执行 `termpilot agent`，它会直接按已有配置启动或显示状态。

### 4. 手机完成配对

手机浏览器打开:

- `http://your-domain.com:8787`
- 或反代后的 `https://your-domain.com`

输入电脑端打印出的配对码，配对成功后会进入会话列表。

### 5. 创建第一个共享会话

如果你主要跑 Claude Code:

```bash
termpilot claude code
```

如果你主要跑 OpenCode:

```bash
termpilot open code
```

也可以直接创建通用会话:

```bash
termpilot create --name my-task --cwd /path/to/project
```

这类命令会:

- 创建一个受 TermPilot 管理的本地会话
- 把命令写进这条会话
- 当前终端直接接到该会话

此时手机和电脑看到的是同一条会话，不是复制品。

## 常用命令

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
termpilot open code
```

## 配置与运行说明

### 默认状态目录

```text
~/.termpilot
```

常见文件:

- `config.json`: agent 保存的 relay 配置
- `agent-runtime.json`: agent 后台运行状态
- `relay-runtime.json`: relay 后台运行状态
- `state.json`: 本地会话状态
- `agent.log` / `relay.log`: 日志

### 常用环境变量

- `TERMPILOT_HOME`: 修改本地状态目录
- `TERMPILOT_RELAY_URL`: 指定 agent 连接的 relay 地址
- `TERMPILOT_DEVICE_ID`: 指定设备名
- `TERMPILOT_AGENT_TOKEN`: 配置 agent 与 relay 间的鉴权令牌
- `TERMPILOT_CLIENT_TOKEN`: 启用管理端查看所有设备时使用
- `HOST` / `PORT`: 配置 relay 监听地址
- `DATABASE_URL`: 为 relay 配置 PostgreSQL

示例:

```bash
TERMPILOT_HOME=/data/termpilot termpilot agent
HOST=0.0.0.0 PORT=8787 termpilot relay
TERMPILOT_RELAY_URL=wss://your-domain.com/ws termpilot agent
```

## 适用边界

TermPilot 当前专注于一个问题: 跨端共享终端会话。

它不解决:

- 远程桌面
- 图形界面控制
- 自动接管任意历史终端标签页
- 长期日志归档平台

如果一个任务需要在手机上继续看和控制，应该从一开始就运行在 TermPilot 管理的会话里。

## 部署建议

最低成本验证:

- 直接在服务器运行 `termpilot relay`
- 手机访问 `http://your-ip:8787`
- 电脑连接 `ws://your-ip:8787/ws`

推荐长期使用:

- 服务器运行 `termpilot relay`
- 前面放反向代理，例如 Caddy
- 手机访问 `https://your-domain.com`
- 电脑连接 `wss://your-domain.com/ws`

最小 Caddy 配置:

```caddyfile
your-domain.com {
    reverse_proxy 127.0.0.1:8787
}
```

更完整的部署和运维说明见 [部署与运维指南](./docs/operations-guide.md)。

## 开发

TermPilot 是一个 pnpm workspace monorepo:

- [`src/cli.ts`](./src/cli.ts): 对外统一 CLI 入口
- [`agent/`](./agent): 电脑端 agent 与本地会话管理
- [`relay/`](./relay): relay 服务端
- [`app/`](./app): 手机端 PWA
- [`packages/protocol/`](./packages/protocol): 三端共享协议
- [`docs/`](./docs): 项目文档与站点内容

本地开发:

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

发布前建议至少执行:

```bash
pnpm build
pnpm test:ui-smoke
pnpm check:stability
```

## 文档

- [Why TermPilot](./docs/why-termpilot.md)
- [文档首页](./docs/index.md)
- [快速开始](./docs/getting-started.md)
- [部署与运维指南](./docs/operations-guide.md)
- [当前架构](./docs/architecture.md)
- [协议说明](./docs/protocol.md)
- [开发文档](./docs/development.md)
- [技术选型记录（2026）](./docs/tech-selection-2026.md)
