# 快速开始

这份文档面向第一次真正把 TermPilot 跑起来的用户。目标不是解释所有细节，而是让你在 5 分钟内跑通第一条完整链路。

## 1. 你需要准备什么

- 一台服务器，或者一台手机能访问到的局域网机器
- 一台作为主力开发机的电脑
- 电脑上已经安装 `tmux`
- 两端都安装了 `Node.js`

安装 TermPilot：

```bash
npm install -g @fengye404/termpilot
```

## 2. 在服务器启动 relay

```bash
termpilot relay
```

默认行为：

- 后台启动
- 默认监听 `0.0.0.0:8787`
- 同时提供网页和 `/ws` WebSocket

如果你要停掉它：

```bash
termpilot relay stop
```

如果你要前台看日志：

```bash
termpilot relay run
```

## 3. 在电脑启动 agent

```bash
termpilot agent
```

第一次运行时，终端会提示你输入：

1. relay 域名或 IP
2. 端口，直接回车默认 `8787`

然后它会自动：

- 保存本地配置
- 后台启动 agent
- 打印一次性配对码

以后日常再次执行：

```bash
termpilot agent
```

如果后台 agent 已存在，它会直接显示当前状态。

## 4. 在手机完成配对

手机浏览器打开：

- `http://your-domain.com:8787`
- 或配置 HTTPS 反代后的 `https://your-domain.com`

未配对时，首页只需要做一件事：

- 输入电脑端打印出来的配对码

配对成功后，你会直接进入会话列表。

## 5. 直接跑一个可同步的任务

如果你平时主要跑 Claude Code，最短路径就是：

```bash
termpilot claude code
```

如果你主要跑 OpenCode：

```bash
termpilot open code
```

这两条命令都会：

- 创建一个受 TermPilot 管理的 `tmux` 会话
- 把命令写进这个会话
- 让当前终端直接 attach 到这个会话

此时手机上会看到同一个会话输出。

## 6. 第一次跑通后你应该验证什么

建议你做这 4 个最小动作：

1. 电脑上看到任务开始流式输出
2. 手机上打开同一个会话，确认输出同步
3. 手机上发一条短命令，确认会进入同一个会话
4. 手机上关闭这个会话，确认电脑端也同步结束

## 7. 常见问题

### `termpilot relay` 为什么不占当前窗口

因为它默认是后台启动。要看实时日志，请用：

```bash
termpilot relay run
```

### `termpilot agent` 为什么第二次执行没有再问域名

因为第一次配置已经保存到了本地。再次执行时，它会直接使用本地配置启动或显示状态。

### 为什么普通 iTerm 标签页不会出现在手机上

因为只有 TermPilot 管理的会话才会同步。正确做法是从一开始就用：

- `termpilot claude code`
- `termpilot open code`
- `termpilot create ...`

## 8. 下一步看什么

- 想长期部署：看 [部署与运维指南](./operations-guide.md)
- 想了解内部结构：看 [代码架构](./architecture.md)
