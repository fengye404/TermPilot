# TermPilot 技术选型（当前实现）

这份文档不讨论“可能的备选”，只记录当前仓库已经采用、并且仍然有效的技术栈。

## 1. 总体选型

- 语言：TypeScript
- 运行时：Node.js `22+`
- 包管理：pnpm workspace

## 2. app

当前 `app/` 使用：

- React 19
- Vite 7
- Tailwind CSS v4
- PWA
- `ansi-to-html` 做 ANSI 快照渲染

仓库里仍然保留了 `xterm` 和 `@xterm/addon-fit` 依赖，但它们不是当前移动端终端展示的主路径。当前主路径是：

- agent 抓取 ANSI 快照
- app 直接渲染快照

## 3. relay

当前 `relay/` 使用：

- Fastify
- `@fastify/websocket`
- PostgreSQL（可选）

对应策略是：

- 默认无 `DATABASE_URL` 时使用内存存储
- 设置 `DATABASE_URL` 时切到 PostgreSQL

## 4. agent

当前 `agent/` 使用：

- Node.js
- `ws`
- `tmux`

这里的关键不是“终端模拟器”，而是把本地受管理会话稳定建立在 `tmux` 上。

## 5. 共享协议

`packages/protocol/` 提供：

- 会话对象
- WebSocket 消息类型
- 配对与 grant 数据结构
- 审计事件结构

这样 `agent / relay / app` 可以共享同一套类型定义。

## 6. 为什么是这套

当前选型的核心目标不是“技术栈尽量新”，而是：

- 三端都能共享 TypeScript
- 工程结构足够统一
- 运行模型足够克制
- AI 和人工都容易继续维护

## 7. 当前边界

当前技术栈也直接反映了产品边界：

- 会话后端固定依赖 `tmux`
- 输出同步仍是快照替换，不是终端字节流
- relay 仍承担了服务端状态与最近输出缓冲
- 手机端 Web UI 重点是查看和轻控制，不是完整桌面终端体验

如果这些边界未来发生变化，优先会反映在 [产品演进路线图](./roadmap.md) 和 [代码架构](./architecture.md) 中。
