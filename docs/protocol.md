# 当前协议说明

这份文档描述当前代码里的协议与安全模型，重点是说明 relay、agent 和浏览器各自负责什么。

## 1. 连接入口

agent 和 client 都通过同一个 WebSocket 入口连接 relay：

```text
ws(s)://<relay-host>/ws?role=<agent|client>&token=<token>&deviceId=<deviceId?>
```

- `role=agent`：电脑上的 agent
- `role=client`：手机或浏览器端
- `token`：agent token 或配对得到的 client access token
- `deviceId`：agent 连接时必须带；client 的 device scope 由 token 决定

## 2. 配对与授权

### agent 侧

- agent 通过固定 `TERMPILOT_AGENT_TOKEN` 接入 relay
- agent 启动或申请配对码时，会确保本地存在长期 ECDH 密钥对
- `POST /api/pairing-codes` 会把 `agentPublicKey` 一起提交给 relay

### client 侧

- 浏览器在兑换配对码前生成本地长期 ECDH 密钥对
- `POST /api/pairings/redeem` 会提交：
  - `pairingCode`
  - `clientPublicKey`
- relay 返回：
  - `deviceId`
  - `accessToken`
  - `agentPublicKey`

这样浏览器和 agent 就建立了同一条设备范围的端到端密钥关系。

## 3. relay 可见与不可见的数据

relay 当前可见的服务端元数据只有：

- 一次性配对码
- 设备范围 access grants
- 审计事件

relay 当前不可见的会话内容包括：

- 会话标题
- `cwd`
- `shell`
- `tmuxSessionName`
- 会话状态细节
- 终端输出
- replay 缓冲

这些内容都只保留在 agent 所在电脑，并以密文形式经过 relay。

## 4. WebSocket 消息分层

### 明文系统消息

relay 仍会直接发送少量系统消息：

- `auth.ok`
- `relay.state`
- `error`

这些消息只描述连接状态、设备在线情况和鉴权错误，不包含会话内容。

### 加密信封消息

会话相关消息不再以明文 `session.*` 直接经过 relay，而是包裹在两类信封里：

- `secure.client`
- `secure.agent`

信封结构：

```json
{
  "type": "secure.client",
  "reqId": "req_123",
  "deviceId": "mac-d1f1c6cb",
  "payload": {
    "iv": "<base64>",
    "ciphertext": "<base64>"
  }
}
```

其中：

- `payload.iv`：AES-GCM IV
- `payload.ciphertext`：浏览器或 agent 加密后的业务消息

relay 只根据 `deviceId` 和 `accessToken` 做路由，不解析密文里的业务字段。

## 5. 端到端业务消息

解密之后，浏览器与 agent 之间仍然使用统一的 `session.*` 业务消息：

### client -> agent

- `session.list`
- `session.create`
- `session.input`
- `session.resize`
- `session.kill`
- `session.replay`

### agent -> client

- `session.list.result`
- `session.created`
- `session.output`
- `session.state`
- `session.exit`
- `error`

也就是说，现有会话协议还在，但它只存在于浏览器和 agent 的解密边界内。

## 6. 会话对象

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

## 7. 输出同步与 replay

当前输出模型不是终端字节流，而是 ANSI 快照替换。

agent 侧行为：

1. 定时执行 `tmux capture-pane -p -e -N -S -2000`
2. 如果 pane 内容发生变化，递增 `lastSeq`
3. 在本地缓存最近输出帧
4. 向所有已配对 client 广播加密后的 `session.output`

replay 行为：

- client 进入会话或重连时，发送 `session.replay`
- agent 用本地缓存的最近帧响应
- replay 不依赖 relay 内存缓冲

## 8. HTTP 接口

### `POST /api/pairing-codes`

用途：由 agent 申请一次性配对码。

请求体：

```json
{
  "deviceId": "mac-d1f1c6cb",
  "agentPublicKey": "<base64 spki>"
}
```

### `POST /api/pairings/redeem`

用途：由浏览器兑换配对码。

请求体：

```json
{
  "pairingCode": "ABC-123",
  "clientPublicKey": "<base64 spki>"
}
```

返回：

```json
{
  "deviceId": "mac-d1f1c6cb",
  "accessToken": "<token>",
  "agentPublicKey": "<base64 spki>"
}
```

### `GET /api/devices/:deviceId/grants`

用途：agent 拉取当前设备 grants，用于建立 access token 与 client 公钥的映射。

### `DELETE /api/devices/:deviceId/grants/:accessToken`

用途：撤销某个已绑定 client 的访问权。relay 会主动断开对应 client WebSocket。

### `GET /health`

返回当前 relay 健康状态。当前与安全相关的关键字段包括：

- `storeMode`
- `adminClientTokenEnabled`
- `security.relayStoresSessionContent`
- `security.endToEndEncryptionRequiredForPairedClients`

## 9. 当前协议边界

- 会话后端仍固定为 `tmux`
- 输出同步仍是快照替换，不是字节流终端协议
- relay 仍然是中心路由点，但不再承载会话主数据
- 使用旧 access token 且缺少本地密钥绑定的 client，需要重新配对
