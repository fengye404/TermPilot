# TermPilot 技术选型（当前实现）

这一页不展开所有备选方案，只记录仓库现在实际在用的技术栈，以及这些选型为什么和当前产品形态匹配。

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
- SQLite（默认）
- PostgreSQL（可选）

对应策略是：

- 默认使用本地 SQLite 持久化 relay 元数据
- 显式 `TERMPILOT_RELAY_STORE=memory` 时切到内存模式
- 设置 `DATABASE_URL` 时切到 PostgreSQL

## 4. agent

当前 `agent/` 使用：

- Node.js
- `ws`
- `tmux`

这里的关键是把本地受管理会话稳定建立在 `tmux` 上。

## 5. 共享协议

`packages/protocol/` 提供：

- 会话对象
- WebSocket 消息类型
- 配对与 grant 数据结构
- 审计事件结构

这样 `agent / relay / app` 可以共享同一套类型定义。

## 6. 为什么是这套

当前选型的核心目标是：

- 三端都能共享 TypeScript
- 工程结构足够统一
- 运行模型足够克制
- AI 和人工都容易继续维护

## 7. 这些选型意味着什么

从产品和运维视角看，这套技术选型带来的结果是：

- `relay` 可以用一条命令长期运行，默认不需要额外数据库服务
- `agent` 更适合直接运行在用户自己的电脑上，而不是被容器化抽象掉本地终端环境
- `app` 优先保证移动端查看和轻控制

## 8. 当前边界

当前技术栈也直接反映了产品边界：

- 会话后端固定依赖 `tmux`
- 输出同步仍是快照替换，不是终端字节流
- relay 只承担配对、授权与加密信封路由，不承载会话内容
- 手机端 Web UI 重点是查看、短输入和快捷控制

这些边界定义了当前产品的成熟形态：聚焦共享会话连续性和多端接入体验。

## 9. 下一步读什么

- 想看运行模型：读 [代码架构](./architecture.md)
- 想看协议与安全：读 [协议说明](./protocol.md) 和 [安全设计](./security-design.md)
- 想看部署建议：读 [部署指南](./deployment-guide.md)
