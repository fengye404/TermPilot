# 部署与运维指南

这份文档面向准备长期运行 TermPilot 的用户。它聚焦三件事：

- 怎么把 relay 稳定跑起来
- 怎么管理 agent、本地状态和设备授权
- 出问题时应该先查什么

如果你还没有跑通过最小链路，先回到 [快速开始](./getting-started.md)。

## 1. 当前运行模型

TermPilot 当前由三部分组成：

- `relay`：对外提供 HTTP 页面、`/ws` WebSocket 和若干 `/api/*` 管理接口
- `agent`：运行在电脑上，管理本地 tmux 会话并与 relay 同步
- `app`：由 relay 托管的移动端 Web UI

推荐拓扑：

```text
手机浏览器  -- https / wss -->  域名 / 反向代理  -->  relay
                                                    ^
                                                    |
                                         电脑上的 agent -- ws / wss --> /ws
```

## 2. relay 存储模式

当前代码支持三种 relay 存储模式：

### 默认长期模式：SQLite

不设置 `DATABASE_URL`，并且不显式把 `TERMPILOT_RELAY_STORE` 设为 `memory` 时：

- relay 会把配对码、设备 grants、审计事件写进本地 SQLite
- 默认路径是 `~/.termpilot/relay.db`
- relay 重启后，服务端元数据会保留下来

适合：

- 个人部署
- 单机长期运行
- 希望继续保持一条命令启动

### 显式临时模式：内存存储

把 `TERMPILOT_RELAY_STORE=memory` 时：

- 配对码、设备 grants、审计事件存在内存里
- relay 重启后这些服务端状态都会丢失

适合：

- 本地开发
- 局域网试用
- 自己快速验证链路

### 外部数据库模式：PostgreSQL

设置 `DATABASE_URL` 后：

- relay 会把配对码、设备 grants、审计事件写进 PostgreSQL

适合：

- 长期部署
- 希望 relay 重启后仍保留服务端侧状态

当前实现里，relay 只负责：

- 配对、grants 与审计
- 加密信封路由

当前实现里，relay 不负责：

- 会话主数据
- 终端输出
- replay 缓冲

这也是为什么 PostgreSQL 模式现在是“元数据持久化”，而不是“会话持久化”。

## 3. 部署方式总览

如果你只是想快速决策，可以直接按这个矩阵选：

### relay

- `npm CLI`：最简单，一条命令启动，适合个人部署
- `relay` 可执行 bundle：适合不想在部署机保留仓库，但能接受目标机安装 Node 22+
- Docker：适合已有容器部署习惯，希望直接拉官方镜像

### agent

- `npm CLI`：最直接，适合日常开发机和个人电脑
- `agent` 可执行 bundle：适合不想保留完整仓库，但希望保留同样命令面
- `launchd` / `systemd --user` / supervisor：适合希望 agent 常驻并由系统托管

## 4. relay 部署

### 4.1 npm CLI

在服务器上执行：

```bash
termpilot relay
```

当前行为：

- 后台启动
- 默认监听 `0.0.0.0:8787`
- 日志写入 `~/.termpilot/relay.log`
- 默认把 relay 元数据写到 `~/.termpilot/relay.db`

常用命令：

```bash
termpilot relay
termpilot relay run
termpilot relay stop
```

### 4.2 relay 可执行 bundle

如果你不想在部署机上保留完整仓库，可以先在构建机上执行：

```bash
pnpm build:relay-bin
```

然后把生成的 `dist/termpilot-relay` 拷到目标机，直接运行：

```bash
./termpilot-relay run
```

这条可执行物沿用与 CLI 相同的默认行为，包括 SQLite 持久化到 `~/.termpilot/relay.db`；目标机需要 Node 22+。

### 4.3 Docker

直接使用已经发布好的 relay 镜像：

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

容器内默认把 SQLite 放在 `/var/lib/termpilot/relay.db`。

如果你需要固定版本，直接把 `latest` 换成发布 tag，例如 `fengye404/termpilot-relay:0.3.9`。
如果你确实要自己构建镜像，再使用仓库里的 `Dockerfile.relay`。

### 4.4 公网入口

推荐长期模式：

- 服务器上运行 `relay`
- 前面放反向代理
- 手机使用 `https://your-domain.com`
- agent 使用 `wss://your-domain.com/ws`

最小 Caddy 配置：

```caddyfile
your-domain.com {
    reverse_proxy 127.0.0.1:8787
}
```

这会同时代理：

- `/`
- `/ws`
- `/api/*`
- VitePress 之外的内建 Web UI 静态资源

## 5. agent 部署

### 5.1 npm CLI

在电脑上执行：

```bash
termpilot agent
```

当前行为：

- 首次运行时询问 relay 地址并保存本地配置
- 后台启动 agent
- 在终端打印一次性配对码

常用命令：

```bash
termpilot agent
termpilot agent --pair
termpilot agent status
termpilot agent stop
termpilot agent --foreground
```

### 5.2 agent 可执行 bundle

如果你不想在目标电脑上保留完整仓库，可以先在构建机上执行：

```bash
pnpm build:agent-bin
```

然后把生成的 `dist/termpilot-agent` 拷到目标机，直接运行：

```bash
./termpilot-agent start --relay wss://your-domain.com/ws
```

常用命令：

```bash
./termpilot-agent --pair
./termpilot-agent status
./termpilot-agent stop
```

目标机同样需要 Node 22+。

### 5.3 用进程管理器托管 agent

如果你希望 agent 常驻，并在电脑重启后自动恢复，推荐让系统进程管理器托管前台模式：

- `launchd`：适合 macOS
- `systemd --user`：适合 Linux 桌面或用户会话
- 其他 supervisor：例如 `supervisord`

托管命令统一用：

```bash
termpilot agent --foreground --relay wss://your-domain.com/ws
```

或者：

```bash
./termpilot-agent start --foreground --relay wss://your-domain.com/ws
```

macOS `launchd` 最小示例：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.fengye.termpilot-agent</string>
    <key>ProgramArguments</key>
    <array>
      <string>/usr/local/bin/termpilot</string>
      <string>agent</string>
      <string>--foreground</string>
      <string>--relay</string>
      <string>wss://your-domain.com/ws</string>
    </array>
    <key>KeepAlive</key>
    <true/>
    <key>RunAtLoad</key>
    <true/>
  </dict>
</plist>
```

Linux `systemd --user` 最小示例：

```ini
[Unit]
Description=TermPilot Agent
After=network-online.target

[Service]
ExecStart=/usr/local/bin/termpilot agent --foreground --relay wss://your-domain.com/ws
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
```

### 5.4 手机接入

手机浏览器打开 relay 对外地址：

- `http://your-ip:8787`
- 或反向代理后的 `https://your-domain.com`

输入配对码后，client 会换到该设备对应的访问令牌，并通过 `/ws` 建立 WebSocket。
同时，浏览器会生成本地密钥对，并与 agent 公钥建立设备级绑定；后续会话消息以加密信封方式经过 relay。

## 6. 最低成本验证

- 服务器上直接运行 `termpilot relay`
- 直接暴露 `8787`
- 手机访问 `http://your-ip:8787`
- 电脑连接 `ws://your-ip:8787/ws`

适合先试通链路，不适合长期使用。

## 7. 环境变量

### relay 侧

- `HOST`：默认 `0.0.0.0`
- `PORT`：默认 `8787`
- `TERMPILOT_AGENT_TOKEN`：agent 连接 relay 和调用管理 API 时使用
- `TERMPILOT_RELAY_STORE`：`sqlite` / `memory`；默认 `sqlite`
- `TERMPILOT_SQLITE_PATH`：SQLite 文件路径，默认 `~/.termpilot/relay.db`
- `DATABASE_URL`：启用 PostgreSQL 持久化
- `TERMPILOT_PAIRING_TTL_MINUTES`：一次性配对码 TTL，默认 `10`

一个重要细节：

- `TERMPILOT_CLIENT_TOKEN` 旧模式已停用
- 当前安全模型要求通过设备配对建立 access token 和本地密钥绑定

### agent 侧

- `TERMPILOT_HOME`：状态目录，默认 `~/.termpilot`
- `TERMPILOT_RELAY_URL`：agent 连接的 relay WebSocket 地址
- `TERMPILOT_DEVICE_ID`：显式指定设备 ID
- `TERMPILOT_AGENT_TOKEN`：agent 调 relay 时携带的 token
- `TERMPILOT_POLL_INTERVAL_MS`：输出轮询间隔，默认 `500`
- `TERMPILOT_ORPHAN_WARNING_MS`：托管命令会话 detached 且无输出时标记为疑似残留的阈值，默认 `3600000`（1 小时）
- `TERMPILOT_MANAGED_SESSION_AUTOCLEANUP_MS`：托管命令会话 detached 且无输出时自动清理的阈值，默认 `43200000`（12 小时）

## 8. 状态目录与日志

默认状态目录：

```text
~/.termpilot
```

常见文件：

- `config.json`：agent 保存的 relay 配置
- `state.json`：本地会话状态
- `device-id`：自动生成的设备 ID
- `device-key.json`：agent 本地设备密钥
- `agent-runtime.json`：后台 agent 运行信息
- `relay-runtime.json`：后台 relay 运行信息
- `agent.log`
- `relay.log`

如果你要切换目录：

```bash
TERMPILOT_HOME=/data/termpilot termpilot agent
TERMPILOT_HOME=/data/termpilot termpilot relay
```

## 9. 健康检查

relay 提供：

```bash
curl http://127.0.0.1:8787/health
```

当前返回字段包括：

- `ok`
- `storeMode`
- `agentsOnline`
- `clientsOnline`
- `webUiReady`
- `security.relayStoresSessionContent`
- `security.endToEndEncryptionRequiredForPairedClients`

这些字段很适合做最小监控和验收。

## 10. 会话运维

### 直接启动一条托管命令

```bash
termpilot claude code
termpilot run -- opencode
termpilot run -- python -m http.server
```

这类会话退出时，当前程序结束，会话也一起结束。
如果本地终端窗口只是被关掉、但会话本体仍留在 `tmux` 中，当前实现会在长期无人附着且无输出时自动回收托管命令残留会话。
如果你要调整治理节奏，可以在启动 agent 前配置 `TERMPILOT_ORPHAN_WARNING_MS` 和 `TERMPILOT_MANAGED_SESSION_AUTOCLEANUP_MS`。

### 创建并手动接入一条 shell 会话

```bash
termpilot create --name deploy --cwd /srv/app
termpilot list
termpilot attach --sid <sid>
```

这类会话退出要区分两种动作：

- 临时离开：`Ctrl+B` 然后按 `D`
- 彻底结束：`exit` / `Ctrl+D` 或 `termpilot kill --sid <sid>`

## 11. 配对、授权与审计

### 重新生成配对码

```bash
termpilot agent --pair
```

注意：

- `agent --pair` 默认会复用已运行的后台 agent
- 它不会强制重启已有 agent
- 电脑端会同时打印设备指纹；浏览器配对时应核对该指纹
- 如果你升级到了新的安全实现，但当前本地绑定还是旧 token，请先清除绑定并重新配对

### 查看当前设备 grants

```bash
termpilot grants
```

### 查看最近审计事件

```bash
termpilot audit --limit 20
```

### 撤销某个 access token

```bash
termpilot revoke --token <accessToken>
```

当前审计主要记录：

- 创建配对码
- 兑换配对码
- 撤销 grant
- 会话创建请求
- 会话关闭请求

它不是完整的命令级审计日志。

## 12. 故障排查

### 手机上打不开页面

优先检查：

- 域名解析是否生效
- `80` / `443` 是否放行
- 反向代理是否正常
- relay 是否真的在监听

```bash
termpilot relay
curl http://127.0.0.1:8787/health
```

### 电脑执行 `termpilot agent` 后手机看不到设备

优先检查：

- agent 是否已经后台运行
- relay 地址是否配置正确
- relay 是否要求公网访问却仍在用 `ws://` 地址

```bash
termpilot agent
termpilot agent status
```

### 手机上看不到某条任务

最常见原因：

- 这条任务不是通过 TermPilot 管理的会话启动的

正确方式：

```bash
termpilot run -- <command>
```

或者：

```bash
termpilot create --name my-task --cwd /path/to/project
termpilot attach --sid <sid>
```

### 改过域名或端口，但 agent 还连旧地址

```bash
termpilot agent stop
termpilot agent
```

如果你用了自定义 `TERMPILOT_HOME`，确认你改的是正确那份状态目录。

### 想看实时日志

relay：

```bash
termpilot relay run
```

agent：

```bash
termpilot agent --foreground
```

## 13. 安全建议

- 公网环境优先使用域名 + HTTPS/WSS
- 显式设置自己的 `TERMPILOT_AGENT_TOKEN`
- 不要长期共享手机端 access token
- 配对时核对浏览器显示的设备指纹与电脑端是否一致
- 换手机或共享设备后，及时执行 `termpilot revoke`
- 如果你希望 relay 重启后还保留授权和审计，默认 SQLite 已足够覆盖单机长期运行；只有你明确需要外部数据库时再上 PostgreSQL

## 14. 建议的阅读顺序

1. [快速开始](./getting-started.md)
2. [CLI 参考](./cli-reference.md)
3. [代码架构](./architecture.md)
4. [协议说明](./protocol.md)
