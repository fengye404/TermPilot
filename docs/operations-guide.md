# 运维总览

先分清你现在在管哪一侧，再去读对应文档。这样最快。

## 1. 先决定你要运维哪一侧

TermPilot 长期运行的部件主要就两个：

- `relay`：对外提供 Web UI、`/ws`、配对、授权和最小元数据持久化
- `agent`：运行在电脑上，管理本地 `tmux` 会话、会话状态和输出同步

通常的拓扑是：

```text
手机浏览器  -- https / wss -->  域名 / 反向代理  -->  relay
                                                    ^
                                                    |
                                         电脑上的 agent -- ws / wss --> /ws
```

## 2. 文档分流

### 如果你要部署或升级 relay

读 [部署指南](./deployment-guide.md)。

你会在里面看到：

- `npm CLI` 启动 relay
- 官方 Docker 镜像部署 relay
- SQLite / memory / PostgreSQL 三种存储模式
- HTTPS、WSS 和反向代理入口
- 健康检查与最小验收

### 如果你要管理 agent、本地状态和设备授权

读 [Agent 运维](./agent-operations.md)。

你会在里面看到：

- agent 的后台运行与前台运行
- `launchd` / `systemd --user` 的托管方式
- 配对码、设备指纹、grant 和审计
- 状态目录、日志和本地文件
- 托管命令残留会话治理

### 如果你已经遇到问题

读 [故障排查](./troubleshooting.md)。

它是按症状组织的，适合直接照着排：

- 页面打不开
- 手机看不到设备
- 配对失败
- 看不到会话
- 会话状态不更新
- 旧缓存或旧绑定问题

## 3. 推荐部署模型

### relay

- 默认长期模式：SQLite
- 部署入口：`npm CLI` 或官方 Docker 镜像
- 公网推荐：域名 + HTTPS / WSS + 反向代理

### agent

- 运行位置：用户自己的电脑
- 部署入口：`npm CLI`
- 长期常驻：`termpilot agent --foreground` 交给 `launchd` / `systemd --user` / supervisor

## 4. 最值得记住的几条规则

- relay 默认只持久化配对、grant 和审计元数据，不保存会话主数据和终端输出
- 会话主数据、终端输出和 replay 缓冲保留在 agent 所在电脑
- `termpilot agent --pair` 默认复用现有后台 agent，只重新申请配对码
- 托管命令会话在长期无人附着且无输出时会自动治理

## 5. 最小运维检查表

在准备长期使用之前，至少确认：

1. `relay` 的 `/health` 正常返回
2. agent 能成功连上 `relay`
3. 手机可以完成一次配对
4. 启动一条托管命令后，手机端能看到同一条会话
5. 退出程序或关闭会话后，手机端状态能同步更新

## 6. 继续阅读

- [部署指南](./deployment-guide.md)
- [Agent 运维](./agent-operations.md)
- [故障排查](./troubleshooting.md)
- [安全设计](./security-design.md)
