# TermPilot 部署与运维指南

这份文档面向准备长期使用 TermPilot 的用户。它不重复 `README` 里的 5 分钟快速上手，而是把部署、反代、日常运维、排障和安全边界收成一份更完整的运行手册。

如果你想先确认自己要解决的到底是不是这一类问题，建议先读 [Why TermPilot](./why-termpilot.md)。

文档风格参考了成熟开源项目常见的写法：先说明适用场景，再给推荐拓扑、部署步骤、运维动作、排障清单和安全边界。你可以把它当成 TermPilot 的管理员手册来用。

## 0. 阅读这份文档前，你应该已经知道什么

建议你已经完成过下面这件事中的至少一件：

- 在本地把 `termpilot relay`、`termpilot agent` 跑通过一次
- 已经看过 [快速开始](./getting-started.md)

如果你还没有跑通过最小链路，请先回到 [快速开始](./getting-started.md)。

## 1. 适用场景

适合下面这些情况：

- 你已经确认 TermPilot 的基本流程可用，准备长期跑在自己的服务器上
- 你希望用域名和 HTTPS/WSS 暴露 relay，而不是直接用裸 IP 和端口
- 你需要给自己或团队整理一份可维护的运行说明

不适合下面这些情况：

- 第一次体验产品
- 只想在局域网里临时试一下

第一次使用请先看 [快速开始](./getting-started.md)。

## 2. 部署清单

开始之前，先确认下面这些前置条件：

- 一台能被手机访问到的服务器
- 一个已经解析到服务器的域名
- 服务器已经放行 `80` 和 `443`
- 电脑端已经安装 `tmux`
- 服务器和电脑都已经安装 `@fengye404/termpilot`

推荐你按这个顺序推进：

1. 先让服务器上的 `termpilot relay` 跑起来
2. 再让域名和 HTTPS 反代跑起来
3. 再在电脑执行 `termpilot agent`
4. 最后用手机完成第一次配对

## 3. 运行模型

TermPilot 由三部分组成：

- `relay`：运行在云服务器上，负责网页托管、WebSocket 中继、配对、设备权限和会话元数据
- `agent`：运行在你的电脑上，负责管理本地 `tmux` 会话并连接 relay
- `app`：手机浏览器直接打开 relay 域名，不需要单独安装 App

推荐拓扑：

```text
手机浏览器  --https/wss-->  域名 / 反向代理  -->  relay
                                               ^
                                               |
                                     agent --wss--> /ws
```

## 4. 推荐部署模式

### 模式 A：最低成本验证

- 服务器上直接运行 `termpilot relay`
- 对外暴露 `8787`
- 手机访问 `http://your-ip:8787`
- 电脑连接 `ws://your-ip:8787/ws`

适合：

- 自己先试通链路
- 不想先配置域名和 HTTPS

缺点：

- 没有 HTTPS/WSS
- 不适合长期使用

### 模式 B：推荐生产模式

- 服务器上运行 `termpilot relay`
- 前面放一个反向代理，例如 Caddy
- 域名直接指向服务器
- 手机访问 `https://your-domain.com`
- 电脑连接 `wss://your-domain.com/ws`

适合：

- 个人长期使用
- 多设备跨网络访问
- 想降低手机端访问阻力

## 5. 生产部署步骤

### 5.1 域名解析

把你的域名 A 记录指向服务器公网 IP，例如：

- `fengye404.top -> 你的服务器公网 IP`

### 5.2 服务器启动 relay

最简单的后台启动：

```bash
termpilot relay
```

常用命令：

```bash
termpilot relay
termpilot relay stop
termpilot relay run
```

说明：

- `termpilot relay` 或 `termpilot relay start`：后台启动
- `termpilot relay stop`：停止后台 relay
- `termpilot relay run`：前台运行，适合看日志

默认监听：

- `host=0.0.0.0`
- `port=8787`

### 5.3 反向代理

推荐用 Caddy。最小配置如下：

```caddyfile
fengye404.top {
    reverse_proxy 127.0.0.1:8787
}
```

这会同时转发：

- 网页请求 `/`
- WebSocket `/ws`

### 5.4 电脑启动 agent

第一次：

```bash
termpilot agent
```

然后在终端里输入：

1. relay 域名或 IP
2. 端口，直接回车默认 `8787`

TermPilot 会自动：

- 保存本地配置
- 后台启动 agent
- 输出一次性配对码

以后日常：

```bash
termpilot agent
```

如果你只想重新生成一个配对码：

```bash
termpilot agent --pair
```

### 5.5 首次上线后的验收

如果你刚完成一套新部署，建议按下面顺序验收：

1. 服务器执行 `termpilot relay`，确认后台已启动
2. 服务器本机执行 `curl http://127.0.0.1:8787/health`
3. 手机打开 `https://your-domain.com`
4. 电脑执行 `termpilot agent`
5. 确认终端里已经打印出配对码
6. 手机输入配对码并进入会话列表
7. 电脑执行 `termpilot claude code`
8. 确认手机端能看到同一个会话的输出

## 6. 目录、数据与状态文件

默认状态目录：

```text
~/.termpilot
```

常见文件：

- `config.json`：agent 本地保存的 relay 配置
- `agent-runtime.json`：后台 agent 运行时状态
- `relay-runtime.json`：后台 relay 运行时状态
- `agent.log`：agent 日志
- `relay.log`：relay 日志
- `state.json`：本地会话状态

如果你想切换状态目录，可以设置：

```bash
TERMPILOT_HOME=/your/path termpilot agent
TERMPILOT_HOME=/your/path termpilot relay
```

## 7. 推荐的日常工作流

### 7.1 服务器

长期保持：

```bash
termpilot relay
```

只有排障时才用：

```bash
termpilot relay run
```

### 7.2 电脑

日常只记住：

```bash
termpilot agent
```

如果你要跑任务，最短路径是：

```bash
termpilot claude code
```

或者：

```bash
termpilot open code
```

### 7.3 手机

长期固定访问：

- `https://your-domain.com`

第一次用配对码，之后正常重连不应该要求重新配对。

## 8. 运维动作速查

### 8.1 relay

后台启动：

```bash
termpilot relay
```

查看前台日志：

```bash
termpilot relay run
```

停止后台 relay：

```bash
termpilot relay stop
```

### 8.2 agent

按本机配置启动或查看状态：

```bash
termpilot agent
```

重新生成配对码：

```bash
termpilot agent --pair
```

查看后台状态：

```bash
termpilot agent status
```

停止后台 agent：

```bash
termpilot agent stop
```

### 8.3 会话

直接启动常见任务：

```bash
termpilot claude code
termpilot open code
```

手动管理会话：

```bash
termpilot create --name my-task --cwd /path/to/project
termpilot list
termpilot attach --sid <sid>
termpilot kill --sid <sid>
```

## 9. 故障排查

### 9.1 手机打开域名，但页面进不去

优先检查：

- DNS 是否已经生效
- `80` / `443` 是否放行
- 反向代理是否已启动
- `termpilot relay` 是否真的在跑

服务器检查：

```bash
termpilot relay
curl http://127.0.0.1:8787/health
```

### 9.2 电脑端执行 `termpilot agent` 后手机还是看不到设备

优先检查：

- 电脑是否真的能连到 relay
- agent 是否已经后台运行
- 是否第一次配对还没完成

电脑检查：

```bash
termpilot agent
termpilot agent status
```

### 9.3 手机端看不到某个任务

最常见原因：

- 这个任务不是通过 TermPilot 管理的会话启动的

正确做法：

```bash
termpilot claude code
```

或：

```bash
termpilot create --name my-task --cwd /path/to/project
termpilot attach --sid <sid>
```

### 9.4 想重新绑定手机

```bash
termpilot agent --pair
```

如果要撤销旧设备访问令牌：

```bash
termpilot grants
termpilot revoke --token <accessToken>
```

### 9.5 relay 或 agent 想看实时日志

relay：

```bash
termpilot relay run
```

agent：

```bash
termpilot agent --foreground
```

### 9.6 我改了域名或端口，电脑还是连旧地址

先停掉后台 agent，再重新执行一次交互配置：

```bash
termpilot agent stop
termpilot agent
```

如果你使用了自定义状态目录，也要确认是不是改到了另一个 `TERMPILOT_HOME`。

## 10. 安全建议

- 正式环境优先使用域名 + HTTPS/WSS，不要长期裸露 `ws://ip:8787/ws`
- 不要长期传播手机端访问令牌
- 换手机或多人共享设备后，及时撤销旧令牌
- 如果准备长期保存会话元数据，relay 建议接 PostgreSQL
- 不要把外网入口直接暴露到非预期端口和无 TLS 配置上

## 11. 升级建议

推荐的升级节奏：

1. 先在一台日常不关键的机器上升级验证
2. 确认 `termpilot relay` 和 `termpilot agent` 都能正常启动
3. 用手机完成一次真实配对和会话查看
4. 再升级主力机器

如果升级后出现异常，优先检查：

- `~/.termpilot/relay.log`
- `~/.termpilot/agent.log`
- `curl http://127.0.0.1:8787/health`
- `termpilot agent status`

## 12. 建议的文档阅读顺序

1. [快速开始](./getting-started.md)
2. [代码架构](./architecture.md)
3. [协议说明](./protocol.md)
4. 本文档
