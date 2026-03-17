# 部署指南

这份文档专门描述 **relay 如何部署、暴露和验收**。它假设你已经理解 TermPilot 的基本工作流，并希望让服务长期稳定可用。

## 1. 部署目标

一个长期可用的 relay，至少应该满足：

- 对手机浏览器可访问
- 对电脑上的 agent 可访问
- 支持 HTTPS / WSS
- relay 重启后仍保留最小元数据

当前最常见的做法是：

- 用 `npm CLI` 或 Docker 启动 relay
- 默认使用 SQLite 持久化
- 前面放一个反向代理

## 2. relay 存储模式

### 默认长期模式：SQLite

不设置 `DATABASE_URL`，并且不显式把 `TERMPILOT_RELAY_STORE` 设为 `memory` 时：

- relay 会把配对码、设备 grants、审计事件写进本地 SQLite
- 默认路径是 `~/.termpilot/relay.db`
- relay 重启后，服务端元数据会保留下来

适合：

- 个人部署
- 单机长期运行
- 希望保持一条命令启动

### 临时模式：内存

把 `TERMPILOT_RELAY_STORE=memory` 时：

- 配对码、设备 grants、审计事件只存在内存
- relay 重启后这些服务端状态都会丢失

适合：

- 本地开发
- 局域网试用
- 快速验证链路

### 外部数据库模式：PostgreSQL

设置 `DATABASE_URL` 后：

- relay 会把配对码、设备 grants、审计事件写进 PostgreSQL

适合：

- 明确需要外部数据库
- 希望把 relay 元数据放到独立服务

当前实现里，relay 只负责：

- 配对
- grant 与审计
- 加密信封路由

当前实现里，relay 不负责：

- 会话主数据
- 终端输出
- replay 缓冲

## 3. 用 npm CLI 部署 relay

最直接的方式：

```bash
termpilot relay
```

默认行为：

- 后台启动
- 监听 `0.0.0.0:8787`
- 日志写入 `~/.termpilot/relay.log`
- 元数据写入 `~/.termpilot/relay.db`

常用命令：

```bash
termpilot relay
termpilot relay run
termpilot relay stop
```

适合：

- 个人服务器
- 自己管理 Node 环境
- 直接用 system service 包一层

## 4. 用官方 Docker 镜像部署 relay

直接使用已发布镜像：

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

容器内默认把 SQLite 放在：

```text
/var/lib/termpilot/relay.db
```

如果你需要固定版本，把 `latest` 换成具体 tag，例如：

```bash
fengye404/termpilot-relay:0.3.9
```

## 5. 公网入口

推荐长期模式：

- 服务器上运行 relay
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
- 内建 Web UI 静态资源

## 6. 环境变量

### relay 侧

- `HOST`：默认 `0.0.0.0`
- `PORT`：默认 `8787`
- `TERMPILOT_AGENT_TOKEN`：agent 连接 relay 和调用管理 API 时使用
- `TERMPILOT_RELAY_STORE`：`sqlite` / `memory`；默认 `sqlite`
- `TERMPILOT_SQLITE_PATH`：SQLite 文件路径，默认 `~/.termpilot/relay.db`
- `DATABASE_URL`：启用 PostgreSQL 持久化
- `TERMPILOT_PAIRING_TTL_MINUTES`：一次性配对码 TTL，默认 `10`

## 7. 健康检查与验收

relay 提供：

```bash
curl http://127.0.0.1:8787/health
```

当前返回字段包括：

- `ok`
- `appVersion`
- `appBuild`
- `storeMode`
- `agentsOnline`
- `clientsOnline`
- `webUiReady`
- `security.relayStoresSessionContent`
- `security.endToEndEncryptionRequiredForPairedClients`

最小验收建议：

1. `/health` 返回 `ok: true`
2. `appVersion` 和当前发布版本一致
3. `storeMode` 是你预期的模式
4. 浏览器能打开首页
5. 电脑端 agent 能成功连接
6. 手机能完成一次配对

## 8. 继续阅读

- [Agent 运维](./agent-operations.md)
- [故障排查](./troubleshooting.md)
- [安全设计](./security-design.md)
