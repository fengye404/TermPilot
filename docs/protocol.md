# TermPilot 协议草案

## 1. 目标

这份文档描述 TermPilot 第一版三端之间的通信协议。

当前协议目标不是一步到位，而是先满足下面几件事：

- 手机和 PC 能连接到同一个中继服务
- 手机可以查看和控制统一会话池
- PC 端 agent 可以持续同步会话输出
- 手机重连后可以补拉最近输出

## 2. 连接方式

手机端和 PC 端都通过 WebSocket 连接中继服务：

```text
ws(s)://<relay-host>/ws?role=<agent|client>&token=<token>&deviceId=<deviceId?>
```

说明：

- `role=agent` 表示 PC 端 agent
- `role=client` 表示手机端
- `token` 用于最小认证
- `deviceId` 由 agent 连接时提供，手机端通过消息体指定要控制的设备

## 3. 消息外层结构

所有控制消息都使用 JSON。

通用字段：

- `type`：消息类型
- `reqId`：请求标识，只有需要响应的消息才带
- `deviceId`：目标设备 ID
- `sid`：目标会话 ID
- `payload`：业务数据

示例：

```json
{
  "type": "session.create",
  "reqId": "req_a1b2c3",
  "deviceId": "pc-main",
  "payload": {
    "name": "claude-main",
    "cwd": "/Users/fengye/workspace/project",
    "shell": "/bin/zsh"
  }
}
```

## 4. 连接建立后的系统消息

### 4.1 认证成功

中继服务返回：

```json
{
  "type": "auth.ok",
  "payload": {
    "role": "client"
  }
}
```

或：

```json
{
  "type": "auth.ok",
  "payload": {
    "role": "agent",
    "deviceId": "pc-main"
  }
}
```

### 4.2 中继状态广播

中继服务向手机端广播在线设备：

```json
{
  "type": "relay.state",
  "payload": {
    "agents": [
      {
        "deviceId": "pc-main",
        "online": true
      }
    ]
  }
}
```

## 5. 会话控制消息

### 5.1 拉取会话列表

手机端发送：

```json
{
  "type": "session.list",
  "reqId": "req_list_001",
  "deviceId": "pc-main"
}
```

返回：

```json
{
  "type": "session.list.result",
  "reqId": "req_list_001",
  "deviceId": "pc-main",
  "payload": {
    "sessions": []
  }
}
```

### 5.2 创建会话

手机端发送：

```json
{
  "type": "session.create",
  "reqId": "req_create_001",
  "deviceId": "pc-main",
  "payload": {
    "name": "claude-main",
    "cwd": "/Users/fengye/workspace/project",
    "shell": "/bin/zsh"
  }
}
```

PC 端 agent 返回：

```json
{
  "type": "session.created",
  "reqId": "req_create_001",
  "deviceId": "pc-main",
  "payload": {
    "session": {
      "sid": "s_123",
      "deviceId": "pc-main",
      "name": "claude-main",
      "backend": "tmux",
      "shell": "/bin/zsh",
      "cwd": "/Users/fengye/workspace/project",
      "status": "running",
      "startedAt": "2026-03-10T09:00:00.000Z",
      "lastSeq": 0,
      "lastActivityAt": "2026-03-10T09:00:00.000Z",
      "tmuxSessionName": "termpilot-claude-main-1234abcd"
    }
  }
}
```

### 5.3 输入

发送普通文本：

```json
{
  "type": "session.input",
  "reqId": "req_input_001",
  "deviceId": "pc-main",
  "sid": "s_123",
  "payload": {
    "text": "claude code\n"
  }
}
```

发送特殊按键：

```json
{
  "type": "session.input",
  "reqId": "req_input_002",
  "deviceId": "pc-main",
  "sid": "s_123",
  "payload": {
    "key": "ctrl_c"
  }
}
```

第一版建议支持的特殊按键：

- `enter`
- `tab`
- `ctrl_c`
- `arrow_up`
- `arrow_down`
- `arrow_left`
- `arrow_right`

### 5.4 调整尺寸

```json
{
  "type": "session.resize",
  "reqId": "req_resize_001",
  "deviceId": "pc-main",
  "sid": "s_123",
  "payload": {
    "cols": 100,
    "rows": 28
  }
}
```

### 5.5 关闭会话

```json
{
  "type": "session.kill",
  "reqId": "req_kill_001",
  "deviceId": "pc-main",
  "sid": "s_123"
}
```

## 6. 输出同步消息

第一版实现采用“快照替换”模式，而不是复杂的字节流增量模式。

原因：

- 更容易先把同一会话双端同步做稳定
- 更适合 `tmux capture-pane` 这种实现方式
- 足够支撑智能体持续流式输出的观察场景

输出消息：

```json
{
  "type": "session.output",
  "deviceId": "pc-main",
  "sid": "s_123",
  "seq": 12,
  "payload": {
    "data": "...完整屏幕内容或最近窗口内容...",
    "mode": "replace"
  }
}
```

字段说明：

- `seq`：输出序号，递增
- `data`：当前终端快照
- `mode=replace`：客户端收到后直接替换当前渲染内容

这不是最终形态，但足以支持第一版。

## 7. 会话状态消息

会话状态变化时发送：

```json
{
  "type": "session.state",
  "deviceId": "pc-main",
  "sid": "s_123",
  "payload": {
    "session": {}
  }
}
```

会话退出时发送：

```json
{
  "type": "session.exit",
  "deviceId": "pc-main",
  "sid": "s_123",
  "payload": {
    "reason": "用户主动关闭会话",
    "exitCode": null
  }
}
```

## 8. 输出补拉

手机端重连或重新进入会话时，可以请求补拉最近输出：

```json
{
  "type": "session.replay",
  "reqId": "req_replay_001",
  "deviceId": "pc-main",
  "sid": "s_123",
  "payload": {
    "afterSeq": 8
  }
}
```

中继服务会把缓冲区里 `seq > afterSeq` 的消息重新发给手机端。

第一版由于使用快照模式，即使只保留最近几十帧，也足够把当前屏幕恢复出来。

## 9. 错误消息

统一错误格式：

```json
{
  "type": "error",
  "reqId": "req_input_001",
  "deviceId": "pc-main",
  "code": "SESSION_NOT_FOUND",
  "message": "会话 s_123 不存在"
}
```

第一版建议至少保留这些错误码：

- `AUTH_FAILED`
- `DEVICE_OFFLINE`
- `SESSION_NOT_FOUND`
- `SESSION_CREATE_FAILED`
- `SESSION_INPUT_FAILED`
- `SESSION_RESIZE_FAILED`
- `SESSION_KILL_FAILED`

## 10. 未来演进方向

后续如果第一版跑稳，可以按下面顺序升级协议：

1. 从快照模式升级到增量输出模式
2. 增加更完整的终端按键支持
3. 增加会话归档与历史查询
4. 增加更严格的认证和权限控制
