# TermPilot

[![npm version](https://img.shields.io/npm/v/%40fengye404%2Ftermpilot)](https://www.npmjs.com/package/@fengye404/termpilot)
[![npm downloads](https://img.shields.io/npm/dm/%40fengye404%2Ftermpilot)](https://www.npmjs.com/package/@fengye404/termpilot)
[![GitHub Actions](https://img.shields.io/github/actions/workflow/status/fengye404/TermPilot/docs.yml?branch=main&label=docs)](https://github.com/fengye404/TermPilot/actions)

TermPilot 是一个终端优先的远程控制工具。它把电脑上的 `tmux` 会话暴露给手机浏览器，让你在电脑和手机之间无缝切换，同步查看和控制同一批任务。

## 为什么是它

- 一个 npm 包：`@fengye404/termpilot`
- 一个服务器命令：`termpilot relay`
- 一个电脑命令：`termpilot agent`
- 手机端不安装，直接打开 relay 域名
- relay 同时负责 Web UI 托管和 WebSocket 中继

## 30 秒理解工作流

1. 在服务器执行 `termpilot relay`
2. 在电脑执行 `termpilot agent`
3. 手机上打开 relay 域名并输入配对码
4. 在电脑直接执行 `termpilot claude code`
5. 手机和电脑同时看到同一个会话输出

## 快速开始

### 1. 启动 relay

```bash
npm install -g @fengye404/termpilot
termpilot relay
```

### 2. 启动 agent

```bash
npm install -g @fengye404/termpilot
termpilot agent
```

第一次运行时，`termpilot agent` 会交互式询问：

1. relay 域名或 IP
2. 端口，默认 `8787`

然后它会自动保存配置、后台启动 agent，并打印一次性配对码。
第一次配置时还会为这台电脑生成一个唯一设备名，避免多台电脑在同一个 relay 上都挤到 `pc-main`。

### 3. 手机完成配对

手机浏览器打开：

- `http://your-domain.com:8787`
- 或 `https://your-domain.com`

输入配对码后，直接进入会话列表。

### 4. 直接启动任务

```bash
termpilot claude code
```

或者：

```bash
termpilot open code
```

这会直接创建一个受 TermPilot 管理的 `tmux` 会话并 attach 到当前终端，手机端会同步看到同一个会话。

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

## 文档

- [文档首页](./docs/index.md)
- [快速开始](./docs/getting-started.md)
- [部署与运维指南](./docs/operations-guide.md)
- [当前架构](./docs/architecture.md)
- [当前协议](./docs/protocol.md)
- [开发文档](./docs/development.md)

## 最佳实践

1. 需要跨端同步的任务，一开始就用 `termpilot claude code`、`termpilot open code` 或 `termpilot create` 启动，不要先在普通终端里跑再想着接管。
2. `termpilot agent` 适合作为长期后台入口。第一次配置完之后，日常只需要记住这一条命令。
3. relay 长期使用时，优先挂到 HTTPS/WSS 域名后面；本地演示再用裸 IP 和 `8787`。
4. 手机更适合看输出、发短命令和轻控制；电脑前的重输入仍然建议在本地终端完成。
5. 不要手动给多台电脑复用同一个 `deviceId`。新版会自动生成唯一设备名，除非你明确知道自己在做什么，不要覆盖它。
6. `TERMPILOT_CLIENT_TOKEN` 现在默认不启用。只有你明确需要“管理端查看所有设备”时，才单独配置它。

## 本地开发

```bash
pnpm install
pnpm build
pnpm docs:dev
pnpm test:ui-smoke
pnpm check:stability
pnpm test:isolation
```

## 常见坑

- `termpilot agent` 不会停在前台，这是正常的；它默认就是后台守护进程。
- `termpilot relay` 默认也不会停在前台；想看日志请用 `termpilot relay run`。
- 手机上看不到任务时，先确认这个任务是不是通过 `termpilot ...` 或 `termpilot create` 启动的。
- 首次配对优先用 `termpilot agent` 拿配对码；重新给手机配对时用 `termpilot agent --pair`。
- 外网正式使用时，不要长期直接裸奔 `ws://IP:8787/ws`，最好上域名和反代。
- 旧版本如果还保留着 `pc-main`，新版 `termpilot agent` 会自动迁移成唯一设备名，并提示你重新配对手机。
- 想排查控制历史时先看 `termpilot audit --limit 30`。

## 更多文档

更多实现说明：

- [文档索引](/Users/fengye/workspace/TermPilot/docs/README.md)
- [开发文档](/Users/fengye/workspace/TermPilot/docs/development.md)
- [当前架构](/Users/fengye/workspace/TermPilot/docs/architecture.md)
- [当前协议](/Users/fengye/workspace/TermPilot/docs/protocol.md)
- [技术选型](/Users/fengye/workspace/TermPilot/docs/tech-selection-2026.md)
