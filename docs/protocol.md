# TermPilot 当前协议

## 1. 连接入口

手机端和 agent 都通过 WebSocket 连接 relay：

```text
ws(s)://<relay-host>/ws?role=<agent|client>&token=<token>&deviceId=<deviceId?>
```

- `role=agent`：PC 端 agent
- `role=client`：手机端或浏览器端
- `token`：agent 固定令牌或 client 访问令牌
- `deviceId`：agent 连接时必须带；client 在业务消息里指定

## 2. 当前消息类型

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

## 3. 会话模型

当前会话对象字段：

- `sid`
- `deviceId`
- `name`
- `backend`
- `shell`
- `cwd`
- `status`
- `startedAt`
- `lastSeq`
- `lastActivityAt`
- `tmuxSessionName`

当前 `backend` 固定为 `tmux`。

## 4. 输入与快捷键

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

普通输入仍走：

```json
{
  "type": "session.input",
  "deviceId": "pc-main",
  "sid": "s_123",
  "payload": {
    "text": "echo hello\n"
  }
}
```

## 5. 输出同步策略

当前不是字节级终端流，而是“快照替换”：

```json
{
  "type": "session.output",
  "deviceId": "pc-main",
  "sid": "s_123",
  "seq": 12,
  "payload": {
    "data": "...当前 pane 快照...",
    "mode": "replace"
  }
}
```

对应实现：

- agent 轮询 `tmux capture-pane`
- 只有缓冲变化时才推新帧
- relay 保留最近一段输出帧
- client 重连后用 `session.replay` 补拉

## 6. 配对与访问令牌 HTTP 接口

### 创建一次性配对码

`POST /api/pairing-codes`

- 需要 `Authorization: Bearer <agent-token>`
- 请求体：`{ "deviceId": "pc-main" }`

返回：

```json
{
  "deviceId": "pc-main",
  "pairingCode": "ABC-234",
  "expiresAt": "2026-03-10T09:00:00.000Z"
}
```

### 兑换配对码

`POST /api/pairings/redeem`

- 请求体：`{ "pairingCode": "ABC-234" }`

返回：

```json
{
  "deviceId": "pc-main",
  "accessToken": "..."
}
```

## 7. 设备管理 HTTP 接口

这些接口都需要 `Authorization: Bearer <agent-token>`。

### 查看当前设备已发出的访问令牌

`GET /api/devices/:deviceId/grants`

### 撤销访问令牌

`DELETE /api/devices/:deviceId/grants/:accessToken`

### 查看审计事件

`GET /api/devices/:deviceId/audit-events?limit=20`

当前审计动作包括：

- `pairing.code_created`
- `pairing.redeemed`
- `grant.revoked`
- `session.create_requested`
- `session.kill_requested`

## 8. 当前协议边界

- client 侧仍直接处理较多状态拼装，没有事件聚合接口
- 输出补拉依赖最近缓冲，不是完整历史回放
- 审计目前只记录关键控制动作，不记录每一次普通输入

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
