# TermPilot 当前协议

> 这份文档描述的是当前实现中的协议和消息形态。它仍以 relay 可见部分业务明文、可持有最近输出缓冲为前提；未来目标是应用层 E2EE、本地优先 replay 和零知识 relay，见 [产品演进路线图](./roadmap.md)。

## 1. 连接入口

手机端和 agent 都通过 relay 的同一个 WebSocket 入口连接：

```text
ws(s)://<relay-host>/ws?role=<agent|client>&token=<token>&deviceId=<deviceId?>
```

- `role=agent`：PC 端 agent
- `role=client`：手机端或浏览器端
- `token`：agent 固定令牌或 client 访问令牌
- `deviceId`：agent 连接时必须带；client 在业务消息里指定

## 2. 当前消息类型

系统消息：

- `auth.ok`
- `error`
- `relay.state`

会话消息：

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

## 6. HTTP 接口

### 创建一次性配对码

`POST /api/pairing-codes`

- 需要 `Authorization: Bearer <agent-token>`
- 请求体：`{ "deviceId": "pc-main" }`

### 兑换配对码

`POST /api/pairings/redeem`

- 请求体：`{ "pairingCode": "ABC-234" }`

### 查看当前设备已发出的访问令牌

`GET /api/devices/:deviceId/grants`

### 撤销访问令牌

`DELETE /api/devices/:deviceId/grants/:accessToken`

### 查看审计事件

`GET /api/devices/:deviceId/audit-events?limit=20`

### 健康检查

`GET /health`

返回：

- `ok`
- `storeMode`
- `agentsOnline`
- `clientsOnline`
- `webUiReady`

## 7. 当前产品入口与协议的关系

- `termpilot relay` 对外暴露 HTTP + WebSocket
- 手机端直接访问 relay 域名，再走 `/ws`
- `termpilot agent` 始终只和 `/ws`、`/api/*` 交互
- 手机端网页不再要求单独部署

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

## 9. 会话状态消息

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

## 10. 输出补拉

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
