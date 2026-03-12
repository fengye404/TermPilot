# 快速开始

这份文档的目标不是解释所有细节，而是让你用当前代码里已经存在的主路径，在几分钟内跑通第一条共享会话。

如果你还在判断这个项目是否适合自己，建议先看 [Why TermPilot](./why-termpilot.md)。

## 1. 准备条件

你至少需要：

- 一台手机可以访问到的服务器，或者一台局域网里可访问的机器，用来运行 `relay`
- 一台作为主力终端环境的电脑，用来运行 `agent`
- 电脑上已经安装 `tmux`
- 服务器和电脑都已经安装 `Node.js 22+`

安装 TermPilot：

```bash
npm install -g @fengye404/termpilot
```

## 2. 启动 relay

在服务器上执行：

```bash
termpilot relay
```

当前行为：

- 后台启动
- 默认监听 `0.0.0.0:8787`
- 同时提供 Web UI、`/ws` WebSocket 和 `/api/*` HTTP 接口

如果你想前台看日志：

```bash
termpilot relay run
```

如果你想停掉后台 relay：

```bash
termpilot relay stop
```

## 3. 启动 agent

在你的电脑上执行：

```bash
termpilot agent
```

第一次运行时，CLI 会要求你输入 relay 地址。你可以输入：

- 裸主机名或域名，例如 `example.com`
- 带协议的地址，例如 `https://example.com`
- 局域网地址，例如 `192.168.1.20`

当前实现会自动把它规范成 agent 真正使用的 WebSocket 地址：

- 本地或局域网优先规范为 `ws://.../ws`
- 公网域名优先规范为 `wss://.../ws`

执行成功后，它会：

- 保存本地配置到 `~/.termpilot/config.json`
- 启动后台 agent
- 打印一次性配对码

以后再执行 `termpilot agent`，如果后台 agent 已在运行，它通常只会显示当前状态。

## 4. 在手机完成配对

手机浏览器打开 relay 地址：

- `http://your-ip:8787`
- 或反向代理后的 `https://your-domain.com`

输入电脑终端里打印出来的配对码。兑换成功后，手机会拿到这台设备的访问令牌，并进入会话列表。

如果你只想重新生成一个配对码：

```bash
termpilot agent --pair
```

注意当前实现里，`agent --pair` 默认只会复用现有后台 agent 并重新申请配对码，不会强制重启它。

## 5. 启动第一条共享会话

推荐直接从托管命令开始，这样最接近真实使用：

```bash
termpilot claude code
```

或者：

```bash
termpilot run -- opencode
termpilot run -- python -m http.server
```

这类命令的当前行为是：

- 创建一条受 TermPilot 管理的本地 tmux 会话
- 在里面直接 `exec` 运行目标命令
- 让你当前终端立刻附着进去
- 手机端同步看到同一条输出

## 6. 如果你更想先建一条 shell 会话

那就用 `create + attach`：

```bash
termpilot create --name my-task --cwd /path/to/project
termpilot list
termpilot attach --sid <sid>
```

这里要特别注意：

- `create` 只创建会话，不会自动附着进去
- `attach` 才是真正接入那条会话

## 7. 怎么退出

这是最容易踩坑的地方。

### 托管命令

比如：

```bash
termpilot claude code
termpilot run -- python -m http.server
```

退出方式：

- 退出当前程序本身，会话就会一起结束
- 多数前台程序可以直接 `Ctrl+C`

### shell 会话

比如你通过 `create + attach` 进入了一条普通 shell 会话。

退出方式有两种：

- 只离开但不关掉会话：`Ctrl+B` 然后按 `D`
- 彻底结束会话：在里面执行 `exit` / `Ctrl+D`，或者外面执行 `termpilot kill --sid <sid>`

## 8. 跑通之后，建议立刻验证

至少做下面这几件事：

1. 电脑上看到会话开始输出
2. 手机上打开同一条会话，确认输出同步
3. 手机上发一条短命令或一个快捷键，确认写回的是原会话
4. 电脑端退出程序或关闭会话，确认手机端同步变成已退出

## 9. 下一步看什么

- 想系统理解命令面和退出方式：看 [CLI 参考](./cli-reference.md)
- 想部署到公网长期使用：看 [部署与运维指南](./operations-guide.md)
- 想理解当前代码结构：看 [代码架构](./architecture.md)
