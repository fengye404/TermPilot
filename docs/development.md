# 开发文档

这份文档面向准备继续维护当前仓库的人。它不解释产品设计，而是聚焦已经存在的开发入口、构建脚本、验证方式和推荐工作流。

## 1. 本地环境

要求：

- Node.js `22+`
- pnpm
- 电脑上安装 `tmux`
- Chromium 运行环境会由 Playwright 自动安装，用于仓库原生浏览器 smoke
- Python 3 只在你仍然使用遗留兼容脚本时才需要

安装依赖：

```bash
pnpm install
```

## 2. 你会改到哪些目录

这是一个 pnpm workspace monorepo：

- `src/`：顶层 CLI 入口
- `agent/`：本地 agent 与 tmux 会话管理
- `relay/`：HTTP / WebSocket relay
- `app/`：移动端 Web UI
- `packages/protocol/`：共享协议类型
- `docs/`：VitePress 文档站

## 3. 常用开发命令

### 启动子系统

```bash
pnpm dev:relay
pnpm dev:app
pnpm dev:agent
pnpm local:reset
```

说明：

- `dev:relay` 启动 relay 开发入口
- `dev:app` 启动 Vite 开发服务器
- `dev:agent` 以前台 daemon 形式运行 agent
- `local:reset` 重置 `/tmp/termpilot-local` 这套本地测试环境，停止对应的 relay / agent、清理记录中的 tmux 会话并删除状态目录

如果你采用 README 里推荐的 `tpdev` 本地开发函数，常用对应关系是：

```bash
tpdev build
tpdev reset
tpdev fresh
tpdev relay run
tpdev agent --relay ws://127.0.0.1:8787/ws --pair
tpdev claude code
```

### 构建

```bash
pnpm build
pnpm build:web
```

当前 `pnpm build` 会做这些事：

1. 对所有 workspace 跑 `typecheck`
2. 对根 `tsconfig.json` 再跑一次 `tsc --noEmit`
3. 构建 `app`
4. 用 `tsup` 打包顶层 CLI

### 类型检查

```bash
pnpm typecheck
pnpm --filter @termpilot/app typecheck
pnpm --filter @termpilot/agent typecheck
```

### 文档站

```bash
pnpm docs:dev
pnpm docs:build
pnpm docs:preview
```

### 推荐验证入口

```bash
pnpm verify:fast
pnpm verify:full
pnpm verify:browser
pnpm verify:e2ee
```

说明：

- `verify:fast`：类型检查 + 内部架构检查 + 内部文档结构检查 + 公共文档 freshness 检查
- `verify:full`：在 fast 基础上补构建、文档站构建和 repo-native 运行时检查
- `verify:browser`：运行仓库原生 Playwright UI smoke
- `verify:e2ee`：运行浏览器 smoke 与设备隔离检查的组合

## 4. 质量检查

### UI smoke

```bash
pnpm test:ui-smoke
```

当前脚本会：

- 先执行一次 `pnpm build`
- 启动一个本地 relay
- 用仓库内 Playwright 脚本跑最小链路 smoke

### 稳定性检查

```bash
pnpm check:stability
```

用于检查 relay / agent 长时间运行时的同步和重连一致性。

### 设备隔离检查

```bash
pnpm test:isolation
```

用于验证不同设备 scope 下的可见性和隔离行为。

### E2EE 组合检查

```bash
pnpm test:e2ee
```

用于组合验证：

- 浏览器配对与加密业务链路
- 设备隔离与 secure envelope 路由

## 5. 推荐开发顺序

### 改 CLI / agent / relay 后

建议至少执行：

```bash
pnpm verify:fast
```

如果改到了会话同步、UI 状态或连接主链路，再补：

```bash
pnpm verify:browser
pnpm verify:e2ee
pnpm check:stability
```

### 只改文档站或 README 后

至少执行：

```bash
pnpm docs:build
```

### 只改 app UI 后

建议执行：

```bash
pnpm --filter @termpilot/app typecheck
pnpm build:web
pnpm verify:browser
```

## 6. 发布流程

当前包名：

```bash
@fengye404/termpilot
```

推荐发布顺序：

1. 修改根目录 `package.json` 版本号
2. 执行 `pnpm build`
3. 执行 `pnpm docs:build`
4. 执行 `pnpm test:relay-storage`
5. 执行 `pnpm test:app-versioning`
6. 执行 `pnpm verify:e2ee`
7. 推送版本标签，例如 `v0.3.10`

当前仓库已经有 tag 触发的自动发布流程：

- 发布 npm 包
- 发布 `fengye404/termpilot-relay` Docker 镜像

文档站仍然通过 `main` 分支的 `docs` workflow 发布，所以日常发布更推荐走：

1. 合并需要上线的代码到 `main`
2. 确认 `docs` workflow 已完成
3. 再推送版本标签触发 npm 和 Docker 发布

## 7. 开发时最容易忘的几件事

- `relay` 默认是 SQLite，不要再把 PostgreSQL 当成默认长期模式
- `agent` 的会话主数据和输出留在端侧，改动这条边界时要同步看安全和协议文档
- 托管命令会话与普通 shell 会话在退出语义上不同，改一侧时要检查另一侧文档和 UI 提示
- 任何影响主链路的改动，最好都补一遍 `ui smoke`

## 8. 当前文档边界

开发文档只描述当前仓库里已经存在的脚本和开发入口，不替代：

- 架构说明：见 [代码架构](./architecture.md)
- 协议定义：见 [协议说明](./protocol.md)
- 运行部署：见 [部署指南](./deployment-guide.md) 和 [Agent 运维](./agent-operations.md)
