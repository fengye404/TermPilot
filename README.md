# TermPilot

TermPilot 是一个终端优先的远程控制系统，用来在手机上查看和控制电脑上的终端智能体任务。

## 技术栈

- 语言：TypeScript
- 运行时：Node.js 24 LTS
- 包管理：pnpm workspace
- 手机端：React + Vite + Tailwind CSS v4 + xterm.js + PWA
- 中继服务：Fastify + WebSocket + PostgreSQL
- PC 端：Node.js + tmux

## 仓库结构

- `agent/`：PC 端 agent，负责管理本地 `tmux` 会话并向中继服务发起连接
- `app/`：手机端 PWA，使用 React + Vite + Tailwind CSS + xterm.js
- `relay/`：部署在个人服务器上的中继服务，使用 Fastify + WebSocket
- `packages/protocol/`：三端共享协议类型
- `docs/`：架构、实施方案与技术选型文档

## 文档入口

- `docs/architecture.md`：架构方案
- `docs/implementation-plan.md`：实施方案
- `docs/protocol.md`：消息协议
- `docs/tech-selection-2026.md`：技术选型
- `docs/workflow.md`：用户流程
- `docs/README.md`：文档索引

## 运行前提

- 本机需要安装 `tmux`
- Node.js 版本建议使用 24 LTS
- 已安装 `pnpm`
- 如需使用 PostgreSQL，请先准备本地或远程数据库
- 如需自定义 token、端口、数据库或设备 ID，可参考 `.env.example`

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 准备 PostgreSQL

如果你只是快速体验，可以先跳过这一步，`relay` 会退回到内存模式。

如果你要验证完整链路，推荐本地直接起一个 `termpilot` 数据库。以 macOS + Homebrew 为例：

```bash
brew services start postgresql@17
/opt/homebrew/opt/postgresql@17/bin/createdb termpilot
export DATABASE_URL=postgresql://$(whoami)@127.0.0.1:5432/termpilot
```

### 3. 启动三端

分别开三个终端：

```bash
pnpm dev:relay
```

```bash
pnpm dev:agent
```

```bash
pnpm dev:app
```

手机端页面默认地址：

- `http://127.0.0.1:5173`

中继服务健康检查：

- `http://127.0.0.1:8787/health`

返回里会包含：

- `storeMode=memory`
- 或 `storeMode=postgres`

### 4. 创建并进入第一个会话

先在电脑上申请一个一次性配对码：

```bash
pnpm agent:pair
```

然后在手机端打开页面，把这个配对码填进“设备配对”区域。配对成功后，页面会自动拿到设备访问令牌。

接着在电脑上创建一个受 TermPilot 管理的会话：

```bash
pnpm agent:create -- --name claude-main
```

查看当前会话列表：

```bash
pnpm agent:list
```

把本地终端附着到某个会话：

```bash
pnpm agent:attach -- --sid <sid>
```

此时你可以在这个会话里运行 `claude code`、`open code` 或其他长期任务；手机端打开同一个会话后，会看到同样的流式输出。

## 常用命令

```bash
pnpm dev:relay
pnpm dev:agent
pnpm dev:app
pnpm agent:list
pnpm agent:create -- --name <name>
pnpm agent:attach -- --sid <sid>
pnpm agent:kill -- --sid <sid>
pnpm agent:pair
pnpm agent:grants
pnpm agent:audit
pnpm agent:revoke -- --token <accessToken>
pnpm typecheck
pnpm build
```

## 使用方式

### 电脑端

1. 启动 `relay` 和 `agent`
2. 用 `pnpm agent:pair` 申请手机配对码
3. 用 `pnpm agent:create` 创建一个新会话
4. 用 `pnpm agent:attach` 进入该会话
5. 在这个会话里运行长期任务
6. 如需检查或撤销手机访问令牌，可用 `pnpm agent:grants` 和 `pnpm agent:revoke`
7. 如需回看关键操作，可用 `pnpm agent:audit -- --limit 30`

### 手机端

1. 打开 `http://127.0.0.1:5173`
2. 输入电脑端刚生成的配对码
3. 确认页面已经拿到访问令牌和正确的设备 ID
4. 在会话列表里选择一个会话
5. 查看输出、发送输入、关闭会话
6. 如需换手机或重新绑定，可点击“清除本机绑定”
7. 需要粘贴长命令时，优先使用页面里的“粘贴大段命令”

### 跨端协作规则

- 电脑和手机看到的是同一批会话
- 任一端创建的会话，另一端都能看到
- 任一端关闭的会话，另一端都会同步状态
- 需要跨端同步的任务，必须从 TermPilot 管理的会话里启动

## 最佳实践

1. 一个长期任务用一个独立会话，不要把多个智能体混在同一页里跑。
2. 会话名称直接写任务语义，比如 `claude-main`、`open-code-api`、`deploy-watch`。
3. 需要跨端继续看的任务，一开始就通过 `pnpm agent:create` 创建，不要先在普通终端里跑再想着接管。
4. 在电脑前工作时优先用 `pnpm agent:attach`，手机更适合看进度、补命令、做轻控制。
5. 手机端平时不要手填共享 `client token`；优先走 `pnpm agent:pair` 的一次性配对流程。
6. 演示和本地开发可以先用内存模式；要长期使用中继服务，优先接上 PostgreSQL。
7. 如果手机丢了、换人了，先在电脑上用 `pnpm agent:grants` 查看已绑定令牌，再用 `pnpm agent:revoke -- --token ...` 立即撤销。
8. 想追问题时先看 `pnpm agent:audit`，它会记录配对码创建、兑换、令牌撤销、会话创建和关闭请求。
9. 养成“先看 `/health` 再排查”的习惯，先确认 `relay` 是否在线，以及当前是 `memory` 还是 `postgres` 模式。
