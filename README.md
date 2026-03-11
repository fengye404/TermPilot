# TermPilot

TermPilot 是一个终端优先的远程控制工具。电脑上跑 `tmux` 会话，手机直接打开 relay 域名查看和控制同一批会话。

## 产品形态

- 一个 npm 包：`@fengye404/termpilot`
- 一个服务器命令：`termpilot relay`
- 一个电脑命令：`termpilot agent`
- 手机端不安装，直接打开 relay 域名
- relay 同时负责消息中继和网页托管

## 5 分钟快速上手

### 1. 启动 relay

在云服务器或一台能被手机访问到的机器上执行：

```bash
npm install -g @fengye404/termpilot
termpilot relay --host 0.0.0.0 --port 8787
```

如果你只是先本地体验，也可以直接在自己电脑上跑 relay，然后让手机走局域网访问。

### 2. 启动电脑 agent

在你的电脑上执行：

```bash
npm install -g @fengye404/termpilot
termpilot agent --relay ws://your-domain.com:8787/ws
```

这条命令会直接：

- 后台启动 agent
- 复用已有本地 agent（如果已经在跑）
- 输出一次性配对码

常用管理命令：

```bash
termpilot agent status
termpilot agent stop
```

### 3. 手机完成配对

手机浏览器直接打开 relay 域名：

- `http://your-domain.com:8787`
- 或反代后的 `https://your-domain.com`

然后：

1. 输入电脑端刚打印出来的配对码
2. 点“配对”
3. 成功后直接进入会话列表

### 4. 直接跑一个可同步的任务

日常最短路径是：

```bash
termpilot claude code
```

或者：

```bash
termpilot open code
```

这会直接：

- 创建一个受 TermPilot 管理的 `tmux` 会话
- 把命令写进这个会话
- 当前终端自动 attach 进去
- 手机端同步看到同一个会话

### 5. 你现在应该能做到什么

此时你可以：

- 在电脑上看 `claude code` / `open code` 的流式输出
- 在手机上看同一份输出
- 在手机上补一条命令、发快捷键、关闭会话
- 随时在电脑和手机之间切换

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

如果你只是想看调试日志，可以显式前台运行：

```bash
termpilot agent --relay ws://your-domain.com/ws --foreground
```

查看后台状态：

```bash
termpilot agent status
```

停止后台 agent：

```bash
termpilot agent stop
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

## 日常使用

### 直接把命令交给 TermPilot

```bash
termpilot claude code
termpilot open code
```

如果你想跑别的命令，也可以直接：

```bash
termpilot npm run dev
termpilot python worker.py
```

### 手动管理会话

创建会话并进入：

```bash
termpilot create --name claude-main --cwd /path/to/project
termpilot list
termpilot attach --sid <sid>
```

进入会话以后，你仍然可以自己手动运行：

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
termpilot agent status
termpilot agent stop
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
2. 如果只是想“开一个会话然后立刻跑起来”，优先用 `termpilot claude code` 这类直达命令，不必手动 `create + attach`。
3. 一个长期任务用一个独立会话，名称直接写任务语义，比如 `claude-main`、`deploy-watch`、`batch-fix`。
4. 电脑前重操作优先 `termpilot attach`；手机更适合看进度、发短命令、补快捷键和关闭会话。
5. 普通 iTerm / Terminal 标签页不是 TermPilot 管理对象，不要指望后面“无缝接管”进来。
6. 手机优先走一次性配对码，不要长期传播访问令牌。
7. 要长期使用 relay，优先放到 HTTPS/WSS 域名后面，并接 PostgreSQL；本地演示可以先用内存模式。
8. 换手机或访问权变更时，先 `termpilot grants`，再 `termpilot revoke --token ...`。
9. 想排查控制历史时先看 `termpilot audit --limit 30`。

## 常见坑

- `termpilot agent --relay ...` 不会停在前台，这是正常的；它默认就是后台守护进程。
- 手机上看不到任务时，先确认这个任务是不是通过 `termpilot ...` 或 `termpilot create` 启动的。
- 首次配对优先用 `termpilot agent --relay ...` 拿配对码；`termpilot pair` 只是补充命令。
- 外网正式使用时，不要长期直接裸奔 `ws://IP:8787/ws`，最好上域名和反代。

## 本地开发

更多实现说明：

- [文档索引](/Users/fengye/workspace/TermPilot/docs/README.md)
- [开发文档](/Users/fengye/workspace/TermPilot/docs/development.md)
- [当前架构](/Users/fengye/workspace/TermPilot/docs/architecture.md)
- [当前协议](/Users/fengye/workspace/TermPilot/docs/protocol.md)
- [技术选型](/Users/fengye/workspace/TermPilot/docs/tech-selection-2026.md)
