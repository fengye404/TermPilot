# 当前协议说明

这份文档描述的是当前代码里已经存在的协议形态，重点是把现有消息、字段和行为讲清楚。

## 1. 连接入口

agent 和 client 都通过同一个 WebSocket 入口连接 relay：

```text
ws(s)://<relay-host>/ws?role=<agent|client>&token=<token>&deviceId=<deviceId?>
```

说明：

- `role=agent`：电脑上的 agent
- `role=client`：手机或浏览器端
- `token`：agent token 或 client access token
- `deviceId`：agent 连接时必须带；client scope 则由 token 决定

## 2. 当前鉴权模型

### agent

agent 通过固定 `TERMPILOT_AGENT_TOKEN` 接入，并且必须声明 `deviceId`。

如果同一个 `deviceId` 有新的 agent 连接上来，旧连接会收到 `AGENT_REPLACED` 错误并被断开。

### client

client 当前有两种进入方式：

- 使用配对码换来的 access token，只能访问一个 device
- 使用可选的全局 `TERMPILOT_CLIENT_TOKEN`，scope 为 `*`

但有一个重要细节：

- 如果 `TERMPILOT_CLIENT_TOKEN` 仍然是默认 `demo-client-token`，relay 会自动禁用它

## 3. 当前消息类型

### 系统消息

- `auth.ok`
- `error`
- `relay.state`

### 会话消息

- `session.list`
- `session.list.result`
- `session.create`
- `session.created`
- `session.input`
- `session.resize`
- `session.kill`
- `session.replay`
- `session.output`
- `session.state`
- `session.exit`

## 4. 会话对象

当前 `SessionRecord` 字段包括：

- `sid`
- `deviceId`
- `name`
- `backend`
- `launchMode`
- `shell`
- `cwd`
- `status`
- `startedAt`
- `lastSeq`
- `lastActivityAt`
- `tmuxSessionName`

其中：

- `backend` 当前固定为 `tmux`
- `launchMode` 当前可能是 `shell` 或 `command`

这两个字段很关键：

- `shell`：普通 shell 会话，通常由 `create + attach` 形成
- `command`：托管命令会话，通常由 `run -- <command>` 或 `termpilot claude code` 形成

## 5. 会话创建与控制消息

### 请求会话列表

```json
{
  "type": "session.list",
  "reqId": "req_1",
  "deviceId": "mac-d1f1c6cb"
}
```

### 创建会话

当前 `session.create` 只允许请求这些字段：

- `name`
- `cwd`
- `shell`

示例：

```json
{
  "type": "session.create",
  "reqId": "req_2",
  "deviceId": "mac-d1f1c6cb",
  "payload": {
    "name": "deploy",
    "cwd": "/srv/app",
    "shell": "/bin/zsh"
  }
}
```

注意：

- 这条消息当前只创建普通 shell 会话
- WebSocket 协议里还没有“远程创建托管命令会话”的单独字段

### 输入

`session.input` 同时支持文本和特殊按键：

```json
{
  "type": "session.input",
  "deviceId": "mac-d1f1c6cb",
  "sid": "sid_123",
  "payload": {
    "text": "echo hello\n"
  }
}
```

当前支持的特殊按键：

- `enter`
- `tab`
- `ctrl_c`
- `ctrl_d`
- `escape`
- `arrow_up`
- `arrow_down`
- `arrow_left`
- `arrow_right`

### 调整尺寸

```json
{
  "type": "session.resize",
  "deviceId": "mac-d1f1c6cb",
  "sid": "sid_123",
  "payload": {
    "cols": 120,
    "rows": 30
  }
}
```

### 关闭会话

```json
{
  "type": "session.kill",
  "reqId": "req_3",
  "deviceId": "mac-d1f1c6cb",
  "sid": "sid_123"
}
```

## 6. 输出同步

当前输出模型不是终端字节流，而是“快照替换”。

### agent 侧行为

- 定时执行 `tmux capture-pane -p -e -N -S -2000`
- 只在缓冲发生变化时发送新帧
- 每次新帧都会带上递增的 `seq`

### 输出消息

```json
{
  "type": "session.output",
  "deviceId": "mac-d1f1c6cb",
  "sid": "sid_123",
  "seq": 12,
  "payload": {
    "data": "...当前 pane 的 ANSI 快照...",
    "mode": "replace"
  }
}
```

当前实现里：

- `mode` 固定是 `replace`
- client 收到后用最新快照替换当前展示

## 7. 状态消息与退出消息

### 会话状态

```json
{
  "type": "session.state",
  "deviceId": "mac-d1f1c6cb",
  "sid": "sid_123",
  "payload": {
    "session": {}
  }
}
```

### 会话退出

```json
{
  "type": "session.exit",
  "deviceId": "mac-d1f1c6cb",
  "sid": "sid_123",
  "payload": {
    "reason": "用户主动关闭会话",
    "exitCode": null
  }
}
```

## 8. replay

client 重新进入会话或重连时，可以请求补拉最近输出：

```json
{
  "type": "session.replay",
  "reqId": "req_replay_001",
  "deviceId": "mac-d1f1c6cb",
  "sid": "sid_123",
  "payload": {
    "afterSeq": 8
  }
}
```

当前 replay 依赖 relay 内存中的最近输出帧缓冲，不是完整历史回放。

## 9. HTTP 接口

### `POST /api/pairing-codes`

创建一次性配对码。

- 需要 `Authorization: Bearer <agent-token>`
- 请求体：`{ "deviceId": "<deviceId>" }`

### `POST /api/pairings/redeem`

兑换配对码。

- 请求体：`{ "pairingCode": "ABC-123" }`

### `GET /api/devices/:deviceId/grants`

查看设备当前 grants。

- 需要 `Authorization: Bearer <agent-token>`

### `DELETE /api/devices/:deviceId/grants/:accessToken`

撤销 grant。

- 需要 `Authorization: Bearer <agent-token>`

### `GET /api/devices/:deviceId/audit-events?limit=20`

查看审计事件。

- 需要 `Authorization: Bearer <agent-token>`
- 服务端会把 `limit` 约束在 `1` 到 `100`

### `GET /health`

返回当前 relay 健康信息，字段包括：

- `ok`
- `storeMode`
- `agentsOnline`
- `clientsOnline`
- `webUiReady`
- `adminClientTokenEnabled`

## 10. 当前协议限制

当前协议还有这些已知限制：

- relay 可以看到明文会话元数据和最近输出
- `session.create` 还只能创建 shell 会话，不能直接表达“托管命令”
- 输出同步是快照替换，不是终端流
- replay 只能补最近缓冲，不能回放完整历史
- 审计只覆盖关键控制动作，不记录全部普通输入

这些限制并不妨碍当前主路径使用，但它们确实定义了现在这套协议的适用范围。
