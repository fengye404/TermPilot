# TermPilot

TermPilot 是一个终端优先的远程控制系统，用来在手机上查看和控制电脑上的终端智能体任务。

## 仓库结构

- `agent/`：PC 端 agent，负责管理本地会话并向中继服务发起连接
- `app/`：手机端应用，负责查看输出、发送输入、管理会话
- `relay/`：部署在个人服务器上的中继服务
- `docs/`：架构、实施方案与产品边界文档

## 先看这里

- 架构方案：`docs/architecture.md`
- 实施方案：`docs/implementation-plan.md`
- 协议草案：`docs/protocol.md`
- 用户流程：`docs/workflow.md`
- 文档索引：`docs/README.md`

## 产品方向

- 手机和 PC 都只发起出站连接
- 产品聚焦终端会话跨端延续，不做远程桌面
- 支持多会话、流式输出、关闭会话与断线重连

## 当前原型能力

- 基于 `tmux` 的会话创建、列出、关闭、附着
- 中继服务转发手机端与 PC 端消息
- 手机网页查看会话列表与当前输出
- 手机端发送命令和快捷键
- 最近输出补拉

## 运行前提

- 本机需要安装 `tmux`
- Node.js 版本建议不低于 20
- 如需自定义 token、端口或设备 ID，可参考 `.env.example`

## 本地启动

1. 安装依赖：`npm install`
2. 启动中继服务：`npm run dev:relay`
3. 启动 agent：`npm run dev:agent`
4. 电脑本地创建会话：`npm run agent:create -- --name claude-main`
5. 浏览器打开：`http://127.0.0.1:8787`

如果要在本地终端附着到某个会话：

- 先执行 `npm run agent:list`
- 再执行 `npm run agent:attach -- --sid <sid>`
