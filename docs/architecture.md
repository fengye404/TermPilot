# TermPilot 当前代码架构

在看代码结构之前，最好先知道这个项目的设计前提：TermPilot 解决的是“共享同一条长期终端会话”，而不是泛化的远程桌面或远程机器管理。背景说明见 [Why TermPilot](./why-termpilot.md)。

## 1. 当前产品形态

- 一个 npm 包：`termpilot`
- 一个服务器命令：`termpilot relay`
- 一个电脑命令：`termpilot agent`
- 手机端不安装，直接打开 relay 域名
- relay 同时负责 WebSocket 中继和 Web UI 托管

对应拓扑：

```text
手机浏览器  --https/ws-->  relay  <--ws-->  PC 端 agent
                              |
                     配对、设备权限、消息路由、
                     输出缓冲、审计日志、会话元数据、
                     静态网页托管
```

## 2. 目录结构

```text
src/
  cli.ts
agent/
  src/
app/
  src/
    components/
relay/
  src/
packages/
  protocol/
scripts/
docs/
```

### `src/cli.ts`

统一 CLI 入口，负责把内部多模块收敛成外部单命令产品：

- `termpilot relay`
- `termpilot agent`
- `termpilot agent/claude code/open code/pair/create/list/attach/kill/...`

### `agent/`

PC 端常驻进程和本地命令实现：

- `src/cli.ts`：agent 侧命令实现
- `src/index.ts`：开发态入口包装
- `src/daemon.ts`：常驻连接、轮询 `tmux`、同步输出与状态
- `src/tmux-backend.ts`：`tmux` 会话创建、输入、关闭、附着、抓屏
- `src/relay-admin.ts`：agent 调用 relay 管理接口的轻量客户端
- `src/state-store.ts`：本地 JSON 状态文件

### `relay/`

中继和网页托管层：

- `src/server.ts`：WebSocket 路由、HTTP 接口、消息转发、静态网页托管
- `src/index.ts`：开发态入口包装
- `src/session-store.ts`：会话元数据存储
- `src/auth-store.ts`：配对码与访问令牌存储
- `src/audit-store.ts`：审计事件存储
- `src/config.ts`：环境变量配置

### `app/`

手机端 PWA：

- `src/App.tsx`：状态、副作用、WebSocket 协调
- `src/components/ConnectionPanel.tsx`：连接与配对 UI
- `src/components/CreateSessionPanel.tsx`：创建会话 UI
- `src/components/SessionListPanel.tsx`：会话搜索、筛选、置顶、关闭
- `src/components/TerminalWorkspace.tsx`：终端区域、快捷键和粘贴发送
- `src/components/chrome.tsx`：通用面板与字段组件

### `packages/protocol/`

三端共享协议类型：

- 会话消息
- 配对与令牌数据结构
- 审计事件结构

## 3. 运行时数据流

### 启动链路

1. 服务器执行 `termpilot relay`
2. relay 监听 HTTP/WebSocket，并托管 `app/dist`
3. 电脑第一次执行 `termpilot agent`，在终端里输入 relay 域名和端口
4. agent 保存本地配置，并在后台启动常驻进程
5. 以后电脑直接执行 `termpilot agent`，自动按已保存配置启动或显示状态
6. 手机上直接打开 relay 域名

### 会话创建

1. 手机端或电脑端发起 `session.create`
2. relay 把请求转发给对应 device 的 agent
3. agent 在本地创建 `tmux` 会话
4. agent 回推 `session.created`
5. relay 广播给有权限的 client

### 输出同步

1. agent 周期性 `capture-pane`
2. 如果缓冲变化，生成新的 `session.output`
3. relay 缓冲最近一段输出帧
4. app 渲染最新快照
5. client 重连后可用 `session.replay` 补拉

### 配对与访问控制

1. 电脑端执行 `termpilot agent`
2. 如果本机还没有配置 relay，agent 会提示输入域名和端口，并保存到本地配置文件
3. relay 创建一次性配对码
4. 手机端输入配对码，兑换设备访问令牌
5. client WebSocket 以后携带设备令牌
6. relay 只向该 client 暴露允许访问的设备和会话

## 4. 当前实现边界

- 当前终端同步策略仍是“快照替换”，不是字节级增量流
- relay 输出缓冲只保留最近一段，不做长期日志归档
- 不接管 TermPilot 体系外的历史终端
- 手机端定位是“查看、轻输入、轻控制”，不追求桌面级重度编辑体验

## 5. 当前代码取舍

- 对外形态已经统一成单一 CLI，但仓库内部仍保留 `agent/app/relay` 三个目录，方便独立开发
- `app` 的状态和副作用仍集中在 `App.tsx`，但渲染层已经拆到独立组件
- `relay` 已从单文件脚本式入口拆成 `server.ts + index.ts`
- `agent` 已从单文件 CLI 拆成 `cli.ts + index.ts + daemon.ts + tmux-backend.ts`

## 6. 当前验证方式

最有价值的检查命令：

- `pnpm typecheck`
- `pnpm build`
- `pnpm test:ui-smoke`
- `pnpm check:stability`

它们覆盖的重点是：

- `termpilot relay` 和 `termpilot agent` 主链路
- 输出缓冲与重连一致性
- 手机端配对、切会话、关会话、清除绑定
