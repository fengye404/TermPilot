# TermPilot 全栈技术选型（2026 版）

## 最终方案

这次技术选型只保留已经拍板的方案，不再保留多余备选。

- 语言：TypeScript
- 运行时：Node.js 22+（推荐 24 LTS）
- 包管理：pnpm workspace

手机端 `app/`：

- React
- Vite
- Tailwind CSS v4
- xterm.js
- PWA

中继服务 `relay/`：

- Fastify
- WebSocket
- PostgreSQL

PC 端 `agent/`：

- Node.js
- tmux

## 为什么是这套

这套方案最重要的优点不是“技术多”，而是“统一且克制”：

- 三端尽量共享同一种语言和同一种工程习惯
- 前端走最主流的 React + Vite 路线，AI 最容易写对
- relay 不引入重框架，Fastify 足够轻也足够成熟
- agent 不引入多余框架，直接围绕 `tmux` 做就够了
- 仓库层面用 pnpm workspace，把多模块项目管清楚

## 为什么不再加别的

这次我刻意把一些名字收掉了，因为它们不是当前必须项：

- 不加 `Next.js`
- 不加 `React Native`
- 不加 `Flutter`
- 不加 `shadcn/ui`
- 不加 `Zustand`
- 不加 `Drizzle`
- 不加 `Zod`

这些技术不是不好，而是对当前目标来说不是最小必要集合。

TermPilot 现在要的不是“技术看起来完整”，而是：

- AI 最容易持续参与开发
- 三端结构统一
- 尽量少配置、少概念、少框架

## 当前代码与选型的对应关系

当前仓库已经按这套方案开始收敛：

- `app/`：React + Vite + Tailwind CSS + xterm.js
- `relay/`：Fastify + WebSocket
- `agent/`：Node.js + tmux
- `packages/protocol/`：共享协议类型
- 根目录：pnpm workspace

其中 PostgreSQL 采用的是“正式栈默认使用、开发时允许内存回退”的策略：

- 设置 `DATABASE_URL` 时使用 PostgreSQL
- 未设置时，为了本地开发效率，relay 会退回内存模式

## 一句话总结

**TermPilot 当前最合理、最 AI 友好的全栈方案，就是 `TypeScript + Node.js 22+ + pnpm workspace`，在此基础上，手机端用 `React + Vite + Tailwind CSS + xterm.js`，中继服务用 `Fastify + WebSocket + PostgreSQL`，PC 端围绕 `tmux`。推荐运行在 Node.js 24 LTS 上，但不强制要求。**
