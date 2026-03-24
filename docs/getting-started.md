# 快速开始

这一页只做一件事：用最短路径跑通第一条共享会话。

如果你还在判断这个项目适不适合自己，先读 [为什么是 TermPilot](./why-termpilot.md)。

## 1. 准备条件

先准备好这几样：

- 一台手机可以访问到的服务器，或者一台局域网里可访问的机器，用来运行 `relay`
- 一台作为主力终端环境的电脑，用来运行 `agent`
- 电脑上已经安装 `tmux`
- 服务器和电脑都已经安装 `Node.js 22+`

安装 TermPilot：

```bash
npm install -g @fengye404/termpilot
```

## 2. 启动 relay

把 `relay` 当成独立入口服务就行。你按自己的习惯选一种启动方式。

### 2.1 直接用 npm CLI

在服务器上执行：

```bash
termpilot relay
```

默认行为：

- 后台启动
- 默认监听 `0.0.0.0:8787`
- 同时提供 Web UI、`/ws` WebSocket 和 `/api/*` HTTP 接口
- 默认把 relay 元数据写到 `~/.termpilot/relay.db`

如果你想前台看日志：

```bash
termpilot relay run
```

如果你想停掉后台 relay：

```bash
termpilot relay stop
```

### 2.2 用 Docker

如果你更希望直接拉现成镜像，推荐直接使用已经发布好的 relay 镜像：

```bash
docker pull fengye404/termpilot-relay:latest
```

推荐启动方式：

```bash
docker run -d \
  --name termpilot-relay \
  -p 8787:8787 \
  -e TERMPILOT_AGENT_TOKEN=change-me \
  -v termpilot-relay-data:/var/lib/termpilot \
  fengye404/termpilot-relay:latest
```

容器内默认会把 SQLite 文件放到 `/var/lib/termpilot/relay.db`。

如果你想固定版本，也可以把 `latest` 换成具体版本号，例如 `fengye404/termpilot-relay:0.3.9`。

## 3. 启动 agent

`agent` 适合直接跑在你自己的电脑上，不建议塞进容器。常用方式有两种。

### 3.1 直接用 npm CLI

在你的电脑上执行：

```bash
termpilot agent
```

第一次运行时，CLI 会要求你输入 relay 地址。你可以输入：

- 裸主机名或域名，例如 `example.com`
- 带协议的地址，例如 `https://example.com`
- 局域网地址，例如 `192.168.1.20`

CLI 会自动把它规范成 agent 真正使用的 WebSocket 地址：

- 本地或局域网优先规范为 `ws://.../ws`
- 公网域名优先规范为 `wss://.../ws`

跑通之后会：

- 保存本地配置到 `~/.termpilot/config.json`
- 启动后台 agent
- 打印一次性配对码

以后再执行 `termpilot agent`，如果后台 agent 已经在跑，通常只会打印状态。

### 3.2 交给系统进程管理器托管

如果你希望 agent 常驻，并在电脑重启后自动恢复，用系统进程管理器托管前台模式更稳：

```bash
termpilot agent --foreground --relay wss://your-domain.com/ws
```

适合：

- macOS 上的 `launchd`
- Linux 桌面或用户会话里的 `systemd --user`
- 其他 supervisor，例如 `supervisord`

## 4. 在手机完成配对

手机浏览器打开 relay 地址：

- `http://your-ip:8787`
- 或反向代理后的 `https://your-domain.com`

输入电脑终端里打印出来的配对码。兑换成功后，手机会拿到这台设备的访问令牌，并进入会话列表。
浏览器同时会生成本地密钥对，并和 agent 公钥完成设备级绑定；之后会话消息会以加密信封的形式经过 relay。

配对完成后，手机端可以先这样用：

- 在会话列表里先进入正在运行的任务
- 终端页里的“终端键盘”适合交互式输入和补字
- “快速输入”适合补一条完整命令并立即回车
- 如果想让终端区域更宽，可以切到“专注模式”

如果你只想重新生成一个配对码：

```bash
termpilot agent --pair
```

`agent --pair` 默认只会复用现有后台 agent 并重新申请配对码，不会强制重启它。
如果你是从旧版本升级、而当前浏览器绑定还没有本地密钥，重新配对一次就够了。

## 5. 启动第一条共享会话

先从托管命令开始最省事，也最接近真实使用：

```bash
termpilot claude code
```

或者：

```bash
termpilot run -- opencode
termpilot run -- python -m http.server
```

这类命令会：

- 创建一条受 TermPilot 管理的本地 tmux 会话
- 在里面直接 `exec` 运行目标命令
- 让你当前终端立刻附着进去
- 手机端同步看到同一条输出

## 6. 如果你想先建一条 shell 会话

那就用 `create + attach`：

```bash
termpilot create --name my-task --cwd /path/to/project
termpilot list
termpilot attach --sid <sid>
```

这里有个容易搞混的点：

- `create` 只创建会话，不会自动附着进去
- `attach` 才是真正接入那条会话

## 7. 怎么退出

这部分最容易踩坑，最好先看清楚。

### 托管命令

比如：

```bash
termpilot claude code
termpilot run -- python -m http.server
```

退出方式：

- 退出当前程序本身，会话就会一起结束
- 多数前台程序可以直接 `Ctrl+C`
- 如果只是把本地终端窗口关掉，会话本体仍会留在 `tmux` 中；托管命令残留会话会在长期无人附着且无输出时被自动清理
- 默认会在 1 小时后标记为疑似残留，在 12 小时后自动清理；要调整的话，在 agent 侧配置 `TERMPILOT_ORPHAN_WARNING_MS` 和 `TERMPILOT_MANAGED_SESSION_AUTOCLEANUP_MS`

### shell 会话

比如你通过 `create + attach` 进入了一条普通 shell 会话。

退出方式有两种：

- 只离开但不关掉会话：`Ctrl+B` 然后按 `D`
- 彻底结束会话：在里面执行 `exit` / `Ctrl+D`，或者外面执行 `termpilot kill --sid <sid>`

## 8. 跑通之后立刻做一次验证

至少做下面这几件事：

1. 电脑上看到会话开始输出
2. 手机上打开同一条会话，确认输出同步
3. 手机上发一条短命令或一个快捷键，确认写回的是原会话
4. 电脑端退出程序或关闭会话，确认手机端同步变成已退出
5. 如果你会把页面挂在后台，顺手开启浏览器提醒，确认设备离线或会话退出时能收到提示
6. 在手机端切回前台后，确认当前会话能自动补齐缺失输出，继续跟上最新进度

## 9. 下一步看什么

- 想系统理解命令面和退出方式：看 [CLI 参考](./cli-reference.md)
- 想部署 relay 到公网长期使用：看 [部署指南](./deployment-guide.md)
- 想管理 agent、本地状态和会话治理：看 [Agent 运维](./agent-operations.md)
- 想按症状快速定位问题：看 [故障排查](./troubleshooting.md)
- 想理解当前代码结构：看 [代码架构](./architecture.md)
