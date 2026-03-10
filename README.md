# TermPilot

TermPilot 是一个终端优先的远程控制工具。电脑上跑 `tmux` 会话，手机直接打开 relay 域名查看和控制同一批会话。

## 产品形态

- 一个 npm 包：`@fengye404/termpilot`
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

这条命令现在会：

- 在后台启动 agent
- 判断这台电脑是否已经有本地 agent 在运行
- 直接输出一次性配对码

如果你只是想看调试日志，可以显式前台运行：

```bash
termpilot agent --relay ws://your-domain.com/ws --foreground
```

本地测试：

```bash
termpilot agent --relay ws://127.0.0.1:8787/ws
```

### 手机

直接打开 relay 域名：

- `https://your-domain.com`

首次使用时，直接执行上面的 `termpilot agent --relay ...` 就会拿到配对码；`termpilot pair` 现在只是补充入口，用于你已经有后台 agent、但想重新生成一次配对码的场景。

配对成功后：

- 访问令牌会自动写回页面
- 手机端默认先显示会话列表
- 点进一个会话后才进入终端详情页
- 连接信息和设备设置都在页面底部折叠区

## 最短使用路径

电脑上直接启动后台 agent：

```bash
termpilot agent --relay ws://your-domain.com/ws
```

拿到配对码以后，在手机上完成配对。然后你日常最简单的启动方式就是：

```bash
termpilot claude code
```

或者：

```bash
termpilot open code
```

这会直接创建一个受 TermPilot 管理的 tmux 会话，并在当前终端里 attach 进去。手机上会同步看到同一个会话。

## 日常使用

创建会话并进入：

```bash
termpilot create --name claude-main --cwd /path/to/project
termpilot list
termpilot attach --sid <sid>
```

如果你不想手动 `create + attach`，可以直接把命令交给 TermPilot：

```bash
termpilot claude code
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

更多实现说明：

- [文档索引](/Users/fengye/workspace/TermPilot/docs/README.md)
- [开发文档](/Users/fengye/workspace/TermPilot/docs/development.md)
- [当前架构](/Users/fengye/workspace/TermPilot/docs/architecture.md)
- [当前协议](/Users/fengye/workspace/TermPilot/docs/protocol.md)
- [技术选型](/Users/fengye/workspace/TermPilot/docs/tech-selection-2026.md)
