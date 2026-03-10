# TermPilot

TermPilot 是一个终端优先的远程控制工具。电脑上跑 `tmux` 会话，手机直接打开 relay 域名查看和控制同一批会话。

## 产品形态

- 一个 npm 包：`termpilot`
- 一个服务器命令：`termpilot relay`
- 一个电脑命令：`termpilot agent`
- 手机端不安装，直接打开 relay 域名
- relay 同时负责消息中继和网页托管

## 快速开始

### 服务器

发布后：

```bash
npm install -g @fengye404/termpilot
termpilot relay
```

当前仓库内本地验证：

```bash
pnpm install
pnpm build
npm install -g .
termpilot relay
```

常用参数：

```bash
termpilot relay --host 0.0.0.0 --port 8787
DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/termpilot termpilot relay
```

### 电脑

```bash
npm install -g @fengye404/termpilot
termpilot agent --relay ws://your-domain.com/ws
```

本地测试：

```bash
termpilot agent --relay ws://127.0.0.1:8787/ws
```

### 手机

直接打开 relay 域名：

- `https://your-domain.com`

首次使用时，在电脑上申请一次性配对码：

```bash
termpilot pair
```

然后在手机页面输入配对码。

## 日常使用

创建会话并进入：

```bash
termpilot create --name claude-main --cwd /path/to/project
termpilot list
termpilot attach --sid <sid>
```

在会话里运行：

```bash
claude code
# 或
open code
```

此时手机和电脑看到的是同一个会话，输出会同步刷新。

## 常用命令

```bash
termpilot relay
termpilot agent --relay ws://127.0.0.1:8787/ws
termpilot pair
termpilot create --name claude-main
termpilot list
termpilot attach --sid <sid>
termpilot kill --sid <sid>
termpilot grants
termpilot audit --limit 30
termpilot revoke --token <accessToken>
termpilot doctor
```

## 最佳实践

1. 需要跨端同步的任务，一开始就用 `termpilot create` 创建，不要先在普通终端里跑再想着接管。
2. 一个长期任务用一个独立会话，名称直接写任务语义，比如 `claude-main`、`deploy-watch`。
3. 电脑前重操作优先 `termpilot attach`，手机更适合看进度、补命令和关闭会话。
4. 手机优先走一次性配对码，不要长期依赖共享 `client token`。
5. 要长期使用 relay，优先接 PostgreSQL；本地演示可以先用内存模式。
6. 换手机或访问权变更时，先 `termpilot grants`，再 `termpilot revoke --token ...`。
7. 想排查控制历史时先看 `termpilot audit --limit 30`。

## 本地开发

```bash
pnpm install
pnpm dev:relay
pnpm dev:app
pnpm dev:agent
```

常用检查：

```bash
pnpm typecheck
pnpm build
pnpm test:ui-smoke
pnpm check:stability
```

更多实现说明：

- [当前架构](/Users/fengye/workspace/TermPilot/docs/architecture.md)
- [当前协议](/Users/fengye/workspace/TermPilot/docs/protocol.md)
- [技术选型](/Users/fengye/workspace/TermPilot/docs/tech-selection-2026.md)
