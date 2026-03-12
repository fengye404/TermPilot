# 开发文档

这份文档面向准备在当前仓库上继续开发的人。内容只覆盖当前仓库已经存在的开发路径、脚本和检查项。

## 1. 本地环境

要求：

- Node.js `22+`
- pnpm
- 电脑上安装 `tmux`
- Python 3，用于部分 smoke / stability 脚本

安装依赖：

```bash
pnpm install
```

## 2. 仓库结构

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
```

说明：

- `dev:relay` 启动 relay 开发入口
- `dev:app` 启动 Vite 开发服务器
- `dev:agent` 以前台 daemon 形式运行 agent

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

## 4. 质量检查

### UI smoke

```bash
pnpm test:ui-smoke
```

当前脚本会：

- 先执行一次 `pnpm build`
- 启动一个本地 relay
- 用脚本化浏览器跑最小链路 smoke

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

## 5. 常见开发顺序

### 改 CLI / agent / relay 后

建议至少执行：

```bash
pnpm typecheck
pnpm build
```

如果改到了会话同步、UI 状态或连接主链路，再补：

```bash
pnpm test:ui-smoke
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
pnpm test:ui-smoke
```

## 6. 发布流程

当前包名：

```bash
@fengye404/termpilot
```

推荐发布顺序：

1. 修改根目录 `package.json` 版本号
2. 执行 `pnpm build`
3. 执行 `pnpm test:ui-smoke`
4. 执行 `pnpm check:stability`
5. 如有需要，执行 `pnpm docs:build`
6. 执行 `npm publish --access public`

## 7. 当前文档边界

开发文档只描述当前仓库里已经存在的脚本和开发入口，不替代：

- 架构说明：见 [代码架构](./architecture.md)
- 协议定义：见 [协议说明](./protocol.md)
- 运行部署：见 [部署与运维指南](./operations-guide.md)
