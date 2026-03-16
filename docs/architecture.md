# 当前代码架构

这份文档描述的是当前已经实现、并且正在运行的 TermPilot 架构。它的目标是帮助你快速定位代码职责、运行时数据流和几个关键设计取舍，而不是先讨论远期重构。

## 1. 当前产品形态

当前发行形态是一个 npm 包：

```text
@fengye404/termpilot
```

外部入口统一收敛成一个命令：

```text
termpilot
```

对用户可见的主要运行部件有三个：

- `relay`：服务器进程，提供 HTTP、WebSocket、配对和管理接口
- `agent`：电脑上的守护进程，管理本地 tmux 会话并同步状态
- `app`：移动端 PWA，由 relay 直接托管

## 2. 代码组织

```text
src/
  cli.ts
agent/
  src/
app/
  src/
relay/
  src/
packages/
  protocol/
docs/
```

### `src/cli.ts`

顶层 CLI 入口。职责是把内部模块收敛成一个外部命令面，例如：

- `termpilot relay`
- `termpilot agent`
- `termpilot create`
- `termpilot list`
- `termpilot attach`
- `termpilot run -- <command>`
- `termpilot claude code`

未命中的顶层命令会被直接按“托管命令”处理，这也是为什么 `termpilot claude code` 能工作。

### `agent/`

电脑侧实现：

- `src/cli.ts`：agent、本地会话、配对和管理命令
- `src/daemon.ts`：后台常驻进程，与 relay 保持 WebSocket 连接
- `src/tmux-backend.ts`：tmux 会话创建、输入、附着、关闭、抓屏
- `src/relay-admin.ts`：agent 调 relay HTTP 管理接口
- `src/state-store.ts`：本地状态目录和 JSON 文件

### `relay/`

服务器侧实现：

- `src/cli.ts`：后台 / 前台启动与停止逻辑
- `src/server.ts`：Fastify HTTP、WebSocket、配对、授权路由和静态资源托管
- `src/auth-store.ts`：配对码与设备 grants 存储
- `src/audit-store.ts`：审计事件存储
- `src/config.ts`：环境变量配置

### `app/`

Web UI：

- `src/App.tsx`：状态协调、WebSocket、副作用和布局入口
- `src/components/ConnectionPanel.tsx`：连接与配对
- `src/components/CreateSessionPanel.tsx`：创建会话
- `src/components/SessionListPanel.tsx`：搜索、筛选、置顶、关闭
- `src/components/TerminalWorkspace.tsx`：终端查看、输入、快捷键和专注模式
- `src/components/AnsiTerminalSnapshot.tsx`：ANSI 快照渲染

### `packages/protocol/`

三端共享的协议定义：

- 会话对象
- WebSocket 消息
- 配对与 grant 结构
- 审计事件

## 3. 运行时数据流

### 启动链路

1. 服务器执行 `termpilot relay`
2. relay 监听 HTTP 和 `/ws`
3. 电脑执行 `termpilot agent`
4. agent 保存 relay 配置并在后台启动守护进程
5. 手机打开 relay 页面，通过配对码换取访问令牌
6. client 和 agent 都通过 relay 建立 WebSocket
7. 配对完成后，浏览器与 agent 之间的会话消息通过 relay 以加密信封中转

### 会话创建

当前有两类主路径：

#### 普通 shell 会话

```bash
termpilot create --name my-task --cwd /path
termpilot attach --sid <sid>
```

这类会话的 `launchMode` 是 `shell`。

#### 托管命令会话

```bash
termpilot run -- <command>
termpilot claude code
```

这类会话的 `launchMode` 是 `command`。当前实现会把目标命令作为会话主进程直接 `exec` 运行，所以命令退出时，会话也一起结束。

### 输出同步

当前输出同步不是字节级终端流，而是快照替换：

1. agent 定时执行 `tmux capture-pane -p -e -N`
2. 如果 pane 内容发生变化，agent 递增 `lastSeq`
3. agent 在本地缓存最近输出帧，并向已配对 client 广播加密后的 `session.output`
4. client 进入会话或重连时，可以通过 `session.replay` 向 agent 请求补拉最近帧

### 会话退出

当前退出路径分两类：

- tmux 会话不存在时，agent 会把本地会话标记为 `exited` 并发送 `session.exit`
- 客户端或 Web UI 主动关闭时，relay 把 `session.kill` 转给 agent，由 agent 执行 `kill-session`

## 4. 状态与持久化

### agent 本地

默认状态目录：

```text
~/.termpilot
```

当前会保存：

- 本地配置
- 设备 ID
- 设备密钥
- 会话列表与状态
- 后台 runtime 信息
- 日志

### relay 侧

当前有两档：

- 默认：SQLite，路径为 `~/.termpilot/relay.db`
- 显式 `TERMPILOT_RELAY_STORE=memory`：内存存储
- 有 `DATABASE_URL`：PostgreSQL

当前 relay 只持有最小必要元数据：

- 配对码
- 设备 grants
- 审计事件

当前 relay 不保存：

- 会话标题
- cwd / shell / tmux 会话名
- 会话状态详情
- 终端输出与 replay 缓冲

## 5. 运行时边界

从实现角度看，当前系统最重要的运行时边界是：

- `relay` 负责入口、配对、授权路由和最小元数据持久化
- `agent` 负责会话主数据、tmux 生命周期和输出同步
- `app` 负责浏览器侧交互、短输入和轻控制

这也是为什么很多问题要先分清是在 `relay`、`agent` 还是 `app` 这一层发生。

## 6. 安全模型

当前安全模型是“设备级配对 + device scope + 加密信封路由”的形态：

- agent 通过固定 `TERMPILOT_AGENT_TOKEN` 接入 relay
- client 在配对时上传本地公钥，换到单设备范围 access token
- agent 也持有本地长期公钥，配对码会把该公钥带给 client
- relay 负责鉴权、设备 scope 和加密信封转发
- 会话消息在浏览器与 agent 之间加密传输
- relay 只保留配对、grant 和审计元数据

## 7. 当前实现的几个重要取舍

- 会话后端只支持 `tmux`
- 当前终端同步优先稳定和实现简单，采用快照替换，而不是终端字节流
- Web UI 重点是“查看、轻输入、快捷控制”，不是桌面级重编辑
- 顶层 CLI 保持统一，但仓库内部仍按 `agent / app / relay / protocol` 分目录开发

## 8. 当前边界

当前代码没有做这些事：

- 导入任意已有 Terminal / iTerm 标签页
- 做完整历史日志归档
- 在手机上提供完整桌面终端编辑体验
- 让 relay 在没有 agent 的情况下独立承载主数据

## 9. 继续阅读

如果你读到这里，下一步通常有三条路径：

- 想继续看消息和接口：读 [协议说明](./protocol.md)
- 想继续看安全模型：读 [安全设计](./security-design.md)
- 想继续看实际部署：读 [部署指南](./deployment-guide.md) 和 [Agent 运维](./agent-operations.md)

## 10. 代码阅读建议

如果你准备开始读源码，建议顺序是：

1. `src/cli.ts`
2. `agent/src/cli.ts`
3. `agent/src/daemon.ts`
4. `agent/src/tmux-backend.ts`
5. `relay/src/server.ts`
6. `packages/protocol/src/index.ts`
7. `app/src/App.tsx`
