# Agent 运维

这份文档描述的是 **电脑侧 agent 如何启动、托管、配对、观察和治理**。它聚焦本地运行、设备管理和会话连续性。

## 1. agent 的角色

agent 运行在你的电脑上，负责：

- 管理本地 `tmux` 会话
- 保留会话主数据和终端输出
- 与 relay 保持 WebSocket 连接
- 给已配对浏览器提供输出同步和轻控制入口

## 2. 启动方式

### 后台模式

```bash
termpilot agent
```

首次运行时会：

- 询问 relay 地址
- 保存本地配置
- 启动后台 agent
- 打印一次性配对码

常用命令：

```bash
termpilot agent
termpilot agent --pair
termpilot agent status
termpilot agent stop
```

### 前台模式

如果你希望交给系统进程管理器托管：

```bash
termpilot agent --foreground --relay wss://your-domain.com/ws
```

适合：

- `launchd`
- `systemd --user`
- `supervisord`

## 3. 进程管理器托管

### macOS `launchd`

最小示例：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.fengye.termpilot-agent</string>
    <key>ProgramArguments</key>
    <array>
      <string>/usr/local/bin/termpilot</string>
      <string>agent</string>
      <string>--foreground</string>
      <string>--relay</string>
      <string>wss://your-domain.com/ws</string>
    </array>
    <key>KeepAlive</key>
    <true/>
    <key>RunAtLoad</key>
    <true/>
  </dict>
</plist>
```

### Linux `systemd --user`

最小示例：

```ini
[Unit]
Description=TermPilot Agent
After=network-online.target

[Service]
ExecStart=/usr/local/bin/termpilot agent --foreground --relay wss://your-domain.com/ws
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
```

## 4. 配对、授权与审计

### 重新生成配对码

```bash
termpilot agent --pair
```

注意：

- `agent --pair` 默认复用已运行的后台 agent
- 它不会强制重启已有 agent
- 电脑端会打印设备指纹；浏览器配对时应核对该指纹

### 查看 grants

```bash
termpilot grants
```

### 查看审计事件

```bash
termpilot audit --limit 20
```

### 撤销 access token

```bash
termpilot revoke --token <accessToken>
```

## 5. 状态目录与日志

默认状态目录：

```text
~/.termpilot
```

常见文件：

- `config.json`：保存 relay 配置
- `state.json`：本地会话状态
- `device-id`：自动生成的设备 ID
- `device-key.json`：agent 设备密钥
- `agent-runtime.json`：后台 agent 运行信息
- `agent.log`：agent 日志

如果你要切换状态目录：

```bash
TERMPILOT_HOME=/data/termpilot termpilot agent
```

## 6. 会话运维

### 托管命令会话

```bash
termpilot claude code
termpilot run -- opencode
termpilot run -- python -m http.server
```

这些会话的语义是：

- 当前程序结束，会话也一起结束
- 如果只是把本地终端窗口关掉，但会话本体仍在 `tmux` 中，agent 会继续保留这条会话
- 对于长期无人附着且无输出的托管命令会话，当前实现会自动治理

相关环境变量：

- `TERMPILOT_ORPHAN_WARNING_MS`
- `TERMPILOT_MANAGED_SESSION_AUTOCLEANUP_MS`

### 普通 shell 会话

```bash
termpilot create --name deploy --cwd /srv/app
termpilot list
termpilot attach --sid <sid>
```

退出动作区分两种：

- 临时离开：`Ctrl+B` 然后按 `D`
- 彻底结束：`exit` / `Ctrl+D` 或 `termpilot kill --sid <sid>`

## 7. 日常检查

至少记住这几条：

```bash
termpilot agent status
termpilot grants
termpilot audit --limit 20
tail -f ~/.termpilot/agent.log
```

## 8. 继续阅读

- [部署指南](./deployment-guide.md)
- [故障排查](./troubleshooting.md)
- [CLI 参考](./cli-reference.md)
