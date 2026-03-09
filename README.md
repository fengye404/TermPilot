# TermPilot

TermPilot 是一个终端优先的远程控制系统，用来在手机上查看和控制电脑上的终端智能体任务。

## 仓库结构

- `agent/`：PC 端 agent，负责管理本地会话并向中继服务发起连接
- `app/`：手机端 PWA，使用 React + Vite + Tailwind CSS + xterm.js
- `relay/`：部署在个人服务器上的中继服务，使用 Fastify + WebSocket
- `packages/protocol/`：三端共享协议类型
- `docs/`：架构、实施方案与技术选型文档

## 先看这里

- 架构方案：`docs/architecture.md`
- 实施方案：`docs/implementation-plan.md`
- 协议草案：`docs/protocol.md`
- 技术选型：`docs/tech-selection-2026.md`
- 用户流程：`docs/workflow.md`
- 文档索引：`docs/README.md`

## 产品方向

- 手机和 PC 都只发起出站连接
- 产品聚焦终端会话跨端延续，不做远程桌面
- 支持多会话、流式输出、关闭会话与断线重连

## 当前实现

- 基于 `tmux` 的会话创建、列出、关闭、附着
- `relay` 使用 Fastify 承载健康检查与 WebSocket 中继
- `app` 使用 React + Vite + Tailwind CSS + xterm.js
- 手机端支持会话列表、查看输出、发送命令、快捷键和关闭会话
- 最近输出支持重连补拉

## 技术栈

- 语言：TypeScript
- 运行时：Node.js 24 LTS
- 包管理：pnpm workspace
- 手机端：React + Vite + Tailwind CSS v4 + xterm.js + PWA
- 中继服务：Fastify + WebSocket + PostgreSQL
- PC 端：Node.js + tmux

## 运行前提

- 本机需要安装 `tmux`
- Node.js 版本建议使用 24 LTS
- 已安装 `pnpm`
- 如需自定义 token、端口、数据库或设备 ID，可参考 `.env.example`

## 本地启动

1. 安装依赖：`pnpm install`
2. 启动中继服务：`pnpm dev:relay`
3. 启动 agent：`pnpm dev:agent`
4. 启动手机端页面：`pnpm dev:app`
5. 电脑本地创建会话：`pnpm agent:create -- --name claude-main`
6. 浏览器打开：`http://127.0.0.1:5173`

如果本地没有 PostgreSQL，可以先不设置 `DATABASE_URL`，relay 会退回到内存存储模式。

如果要本地验证 PostgreSQL 路径，最简单的方式是：

1. 安装并启动 PostgreSQL
2. 创建数据库 `termpilot`
3. 设置 `DATABASE_URL=postgresql://<你的用户名>@127.0.0.1:5432/termpilot`
4. 再启动 `pnpm dev:relay`

当前 relay 的健康检查接口是：

- `http://127.0.0.1:8787/health`

返回里会包含：

- `storeMode=memory`
- 或 `storeMode=postgres`

如果要在本地终端附着到某个会话：

- 先执行 `pnpm agent:list`
- 再执行 `pnpm agent:attach -- --sid <sid>`
