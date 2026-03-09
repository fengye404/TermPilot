# Agent

这个目录用于放置 PC 端 agent，主要职责是：

- 管理本地的 TermPilot 会话
- 向中继服务主动发起连接
- 读取终端输出并转发
- 接收远程输入、创建、关闭等控制指令

当前原型内置了几个本地命令：

- `pnpm dev:agent`：启动常驻 agent
- `pnpm agent:create -- --name demo`：创建新会话
- `pnpm agent:list`：列出会话
- `pnpm agent:kill -- --sid <sid>`：关闭会话
- `pnpm agent:attach -- --sid <sid>`：本地附着到会话
