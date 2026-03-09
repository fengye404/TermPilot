# TermPilot 当前代码架构

## 1. 产品目标

TermPilot 聚焦一个很窄但很实用的场景：

- 电脑上运行终端里的智能体任务
- 用户离开电脑后，任务继续运行
- 手机继续查看同一个会话的流式输出
- 手机可以继续发命令、切会话、关会话

它做的是“终端会话跨端延续”，不是远程桌面。

## 2. 系统拓扑

```text
手机端 PWA  --ws/wss-->  relay  <--ws/wss--  PC 端 agent
                              |
                     配对、设备权限、消息路由、
                     输出缓冲、审计日志、会话元数据
```

关键约束：

- 手机和 PC 都只发起出站连接
- 所有命令执行都发生在 PC 上
- 所有需要跨端同步的任务，都必须运行在 TermPilot 管理的 `tmux` 会话里

## 3. 目录结构

```text
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

### `packages/protocol/`

共享三端协议类型：

- 会话消息
- 配对与令牌数据结构
- 审计事件结构

### `agent/`

PC 端常驻进程和本地 CLI：

- `src/daemon.ts`：常驻连接、轮询 `tmux`、同步输出与状态
- `src/tmux-backend.ts`：`tmux` 会话创建、输入、关闭、附着、抓屏
- `src/index.ts`：本地 CLI 入口
- `src/relay-admin.ts`：agent 调用 relay 管理接口的轻量客户端
- `src/state-store.ts`：本地 JSON 状态文件

### `relay/`

中继和状态中心：

- `src/index.ts`：WebSocket 路由、HTTP 接口、消息转发
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

### `scripts/`

验证脚本：

- `check-relay-agent-stability.mjs`：relay/agent 稳定性检查
- `ui_smoke.py`：贴近真实使用的 UI 烟雾测试

## 4. 运行时数据流

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

1. 电脑端执行 `pnpm agent:pair`
2. relay 创建一次性配对码
3. 手机端输入配对码，兑换设备访问令牌
4. client WebSocket 以后携带设备令牌
5. relay 只向该 client 暴露允许访问的设备和会话

## 5. 当前实现边界

- 当前终端同步策略仍是“快照替换”，不是字节级增量流
- relay 输出缓冲只保留最近一段，不做长期日志归档
- 不接管 TermPilot 体系外的历史终端
- 手机端定位是“查看、轻输入、轻控制”，不追求桌面级重度编辑体验

## 6. 代码层面的当前取舍

- `app` 的状态和副作用仍集中在 `App.tsx`，但渲染层已经拆到独立组件，便于继续收口
- `relay` 仍保留单一入口文件来表达完整路由流，但存储和审计已拆成独立模块
- `agent` 保持“CLI + daemon + tmux backend”三层，不引入额外框架

## 7. 当前验证方式

日常最有价值的验证命令：

- `pnpm typecheck`
- `pnpm build`
- `pnpm check:stability`
- `pnpm test:ui-smoke`

如果这些都通过，基本能覆盖：

- relay/agent 主链路
- 输出缓冲与重连一致性
- 手机端配对、切会话、关会话、清除绑定
