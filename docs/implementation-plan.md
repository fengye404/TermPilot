# TermPilot 实施方案

## 1. 当前落地方案

仓库已经按下面这套结构收敛：

```text
agent/
app/
relay/
packages/protocol/
```

说明：

- `agent/`：Node.js + tmux
- `app/`：React + Vite + Tailwind CSS + xterm.js
- `relay/`：Fastify + WebSocket + PostgreSQL
- `packages/protocol/`：三端共享协议类型

## 2. 开发顺序

继续推进时，建议保持这个顺序：

1. 先稳住 relay 和 agent 的主链路
2. 再增强 app 的移动端体验
3. 最后补认证、配对和更完整的数据持久化

## 3. 当前已经完成的部分

- `pnpm workspace` 已接入
- `app` 已切到 React + Vite + Tailwind CSS + xterm.js
- `relay` 已切到 Fastify + WebSocket
- `agent` 保持 Node.js + tmux
- 共享协议已抽到 `packages/protocol`

## 4. 当前仍然保持克制的部分

为了保持实现简洁，这一版没有引入：

- Next.js
- React Native
- shadcn/ui
- Zustand
- ORM
- 运行时 schema 库

这些能力以后可以再评估，但当前不属于最小必要集合。

## 5. 验证重点

每次改动后，至少验证下面几件事：

- relay 能正常启动
- agent 能正常连接 relay
- 本地创建会话后，手机端能看到会话
- 手机端能发送输入
- relay 能把输出推回手机端
- 任意一端关闭会话，另一端能感知

## 6. 本地开发方式

1. `pnpm install`
2. `pnpm dev:relay`
3. `pnpm dev:agent`
4. `pnpm dev:app`
5. `pnpm agent:create -- --name demo`

如果要启用 PostgreSQL：

- 配置 `.env.example` 里的 `DATABASE_URL`
- 启动 relay 时读取该变量

未配置时，relay 会退回内存存储模式，方便本地开发。

## 7. 下一阶段建议

接下来最值得做的事情只有三件：

1. 给 relay 补设备配对和登录
2. 把 app 的终端体验继续做细，尤其是输入和重连
3. 再决定是否把 relay 的会话元数据完全切到 PostgreSQL
