# CLI 参考

这份文档只回答两类问题：

- `termpilot` 现在有哪些命令
- 每一类命令执行完之后应该怎么离开

下面的内容以当前 `dist/cli.js --help` 和 `src/cli.ts` / `agent/src/cli.ts` 的实现为准。

## 命令总览

```bash
termpilot relay
termpilot relay start
termpilot relay stop
termpilot relay run

termpilot agent
termpilot agent --pair
termpilot agent --foreground
termpilot agent status
termpilot agent stop

termpilot pair [--device-id <deviceId>]
termpilot create --name <name> [--cwd <path>] [--shell <shell>]
termpilot list
termpilot attach --sid <sid>
termpilot kill --sid <sid>
termpilot grants [--device-id <deviceId>]
termpilot audit [--device-id <deviceId>] [--limit 20]
termpilot revoke --token <accessToken> [--device-id <deviceId>]
termpilot doctor

termpilot claude code
termpilot run -- <command> [args...]
```

## 1. 服务命令

### `termpilot relay`

后台启动 relay。等价于 `termpilot relay start`。

常见用法：

```bash
termpilot relay
HOST=0.0.0.0 PORT=8787 termpilot relay
```

### `termpilot relay run`

前台运行 relay，适合看日志或放进进程管理器。

### `termpilot relay stop`

停止后台 relay。

### `termpilot agent`

按已保存配置启动后台 agent，或者如果它已经在运行，则打印当前状态。

第一次运行时会提示输入 relay 地址并保存到本地配置。

### `termpilot agent --pair`

向当前后台 agent 申请一个新的配对码。

这里有一个容易误解的点：

- 它默认不会强制重启已有后台 agent
- 如果当前后台 agent 的 relay 配置和设备 ID 没变化，它只会复用现有进程并重新取配对码

### `termpilot agent --foreground`

前台运行 agent，适合调试或交给 `systemd` / `launchd` 之类的进程管理器托管。

### `termpilot agent status`

查看后台 agent 运行状态。

### `termpilot agent stop`

停止后台 agent。

## 2. 会话命令

### `termpilot create`

创建一条普通 shell 会话，但不会自动附着进去。

示例：

```bash
termpilot create --name deploy --cwd /srv/app
```

执行后会打印：

- `sid`
- 会话名称
- 对应的 `tmux` 会话名

### `termpilot list`

列出当前本地状态文件中的会话，包括：

- `sid`
- 名称
- 状态
- 工作目录
- 对应 tmux 会话名
- 最近输出序号

### `termpilot attach --sid <sid>`

附着到一条已经存在的 tmux 会话。

这适合：

- 重新接回一条之前创建的 shell 会话
- 从另一个终端回到同一条上下文

### `termpilot kill --sid <sid>`

关闭一条会话，并同步把状态标记为 `exited`。

## 3. 托管命令

### `termpilot run -- <command>`

把任意前台命令作为一条受 TermPilot 管理的会话启动，并立即附着到它。

示例：

```bash
termpilot run -- claude code
termpilot run -- opencode
termpilot run -- python -m http.server
```

### `termpilot claude code`

这是上面那类“托管命令”的快捷写法之一。CLI 顶层没有为 `claude`、`open` 这类名字单独做专门子命令，而是把未命中的命令直接按托管命令处理。

换句话说，下面两种写法在行为上属于同一类：

```bash
termpilot claude code
termpilot run -- claude code
```

## 4. 配对、授权与审计

### `termpilot pair`

直接调用 relay 的 HTTP API 创建一次性配对码，适合脚本化或在不想启动完整 `agent start` 流程时使用。

### `termpilot grants`

查看某个设备当前签发过的 client 访问令牌。

### `termpilot audit`

查看某个设备最近的审计事件。`--limit` 默认 `20`，上限由服务端限制为 `100`。

### `termpilot revoke`

撤销一枚访问令牌。relay 会主动断开使用该 token 的 client WebSocket。

### `termpilot doctor`

检查本地状态目录与 `tmux` 可用性。

## 5. 退出方式

这是最容易混淆的部分。

### 后台服务类

包括：

- `termpilot relay`
- `termpilot relay start`
- `termpilot agent`
- `termpilot agent --pair`

它们要么启动后台进程后立即结束，要么只打印状态。

退出方式：

- 命令自己结束，不存在“还要再退出一次”
- 真正要停掉它们，请执行 `termpilot relay stop` 或 `termpilot agent stop`

### 前台服务类

包括：

- `termpilot relay run`
- `termpilot agent --foreground`

退出方式：

- 直接 `Ctrl+C`

### 托管命令类

包括：

- `termpilot claude code`
- `termpilot run -- <command>`

退出方式：

- 退出这个程序本身，会话就一起结束
- 多数前台命令可以直接 `Ctrl+C`
- 如果你运行的是 `bash` / `zsh` 这类 shell，本质上你启动的程序就是 shell，所以要用 `exit` 或 `Ctrl+D`

### 附着现有会话类

包括：

- `termpilot attach --sid <sid>`

退出方式分两种：

- 只离开但不关闭会话：`Ctrl+B` 然后按 `D`
- 彻底结束会话：在里面执行 `exit` / `Ctrl+D`，或者从外部 `termpilot kill --sid <sid>`

## 6. 推荐记忆方式

如果你只记一条规则，记这个就够了：

- `run` / `claude code` 这类“托管命令”，退出当前程序即可离开
- `attach` 这类“接入现有 tmux 会话”，`Ctrl+B D` 是离开，`exit` 是结束

如果你想先跑通完整链路，再回来看细节，下一步读 [快速开始](./getting-started.md)。如果你在搭服务器，下一步读 [部署与运维指南](./operations-guide.md)。
