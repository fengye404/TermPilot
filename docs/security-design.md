# 安全设计

安全设计这页主要钉四件事：数据留在哪里，身份怎么建立，消息怎么保护，relay 在整个模型里到底承担什么职责。

## 1. 设计目标

当前安全设计围绕四个目标展开：

- 会话主数据保留在 agent 所在电脑
- relay 只保留运行所需的最小元数据
- 已配对浏览器与 agent 之间的业务消息加密传输
- 在保持单入口产品形态的前提下，让配对、授权与撤销具备可操作的安全边界

## 2. 运行时角色与信任域

当前系统由三个运行部件组成：

- `relay`：HTTP / WebSocket 入口，负责 Web UI 托管、配对、授权路由和审计记录
- `agent`：运行在电脑上的守护进程，负责本地会话和会话数据
- `app`：在浏览器中运行的已配对客户端

这三个部件的职责分工是：

- `agent` 持有会话主数据和设备长期私钥
- `app` 持有浏览器侧访问令牌和客户端长期私钥
- `relay` 负责连接建立、配对码兑换、grant 管理和加密信封路由

## 3. 数据归属

### agent 端

以下数据保留在 agent 所在电脑：

- 会话标题
- `cwd`
- `shell`
- `tmuxSessionName`
- 会话状态详情
- 终端输出
- replay 缓冲
- agent 长期私钥

### relay 端

relay 只保存最小必要元数据：

- 一次性配对码
- 设备范围 access grants
- client 公钥
- 审计事件

relay 不保存会话标题、状态详情、终端输出或 replay 缓冲。

### 浏览器端

浏览器本地保存：

- relay 连接地址
- 当前设备的 access token
- client 长期密钥对
- 已绑定设备的 agent 公钥
- 最近查看的会话 UI 状态

可以把当前模型简单理解成：

- 会话主数据在 `agent`
- 访问身份在浏览器和 `agent`
- relay 保留最小服务端元数据并负责连接编排

## 4. 身份、密钥与访问凭证

### agent 身份

- agent 首次需要配对时生成长期 ECDH 密钥对
- 私钥保存在本地 `device-key.json`
- 公钥用于配对和后续会话消息加密

### client 身份

- 浏览器在兑换配对码前生成长期 ECDH 密钥对
- 私钥保存在浏览器本地存储
- 公钥在配对时提交给 relay，并记录到对应 grant

### 访问凭证

- agent 通过 `TERMPILOT_AGENT_TOKEN` 接入 relay
- 已配对浏览器通过单设备范围的 `accessToken` 访问该设备
- grant 撤销后，relay 会主动断开对应 client 连接

### 设备指纹

- agent 对自身长期公钥计算 SHA-256 指纹
- `termpilot agent --pair` 与 `termpilot pair` 会打印该指纹
- 浏览器完成配对后展示同一指纹用于核对

设备指纹用于给第一次绑定提供可人工校验的身份锚点。

## 5. 配对与建立绑定

当前配对流程如下：

1. agent 确保本地长期密钥存在
2. agent 向 relay 申请一次性配对码，并提交 `agentPublicKey`
3. 浏览器生成本地长期密钥
4. 浏览器提交 `pairingCode` 和 `clientPublicKey`
5. relay 签发单设备范围的 `accessToken`，并把 `agentPublicKey` 返回给浏览器
6. 用户核对电脑端与浏览器端显示的设备指纹

配对完成后，浏览器持有：

- `deviceId`
- `accessToken`
- client 私钥
- agent 公钥

## 6. 消息保护

会话相关消息不再以明文 `session.*` 经过 relay，而是封装在两类加密信封中：

- `secure.client`
- `secure.agent`

### 加密机制

- 密钥交换：ECDH P-256
- 对称加密：AES-256-GCM

### 受保护内容

- 会话业务消息整体加密
- `deviceId`
- `accessToken`
- `reqId`
- 消息方向

上述路由上下文会作为额外认证数据参与校验，保证加密内容与当前消息外层元数据保持一致。

### 结果

这套设计带来两个直接结果：

- relay 不需要读取会话业务内容即可完成路由
- 单独篡改外层 envelope metadata 会触发解密或校验失败

## 7. relay 侧控制面

relay 负责：

- agent token 鉴权
- 配对码生成与兑换
- access grant 查询与撤销
- 审计事件记录
- 加密信封转发

relay 不负责：

- 会话缓存
- 输出缓存
- replay 缓冲
- 离线会话镜像

## 8. 当前覆盖范围

在当前实现里，这套安全模型主要覆盖这些场景：

- relay 存储层泄露后直接暴露会话内容
- relay 在常规运行路径下读取会话明文
- 服务端持久化用户终端输出
- envelope 外层 metadata 与内层业务消息错配
- 旧版缺少本地密钥材料的绑定继续静默复用

## 9. 运维与使用约束

部署和使用时，建议遵循这些约束：

- 公网部署优先使用 HTTPS / WSS
- 显式设置自己的 `TERMPILOT_AGENT_TOKEN`
- 配对时核对设备指纹
- 不长期共享浏览器侧 `accessToken`
- 更换手机或共享设备后及时执行 `termpilot revoke`
- 需要外部数据库时再配置 PostgreSQL，单机长期部署默认推荐 SQLite

## 10. 与其他文档的关系

如果你是从不同问题进入这份文档，建议这样继续往下读：

- 想理解整体代码组织：看 [代码架构](./architecture.md)
- 想理解消息与接口：看 [协议说明](./protocol.md)
- 想落地部署：看 [部署指南](./deployment-guide.md) 和 [Agent 运维](./agent-operations.md)

## 11. 文档与实现对应关系

当前安全相关实现分布在这些模块：

- `packages/protocol/src/index.ts`
- `relay/src/server.ts`
- `relay/src/auth-store.ts`
- `agent/src/daemon.ts`
- `agent/src/cli.ts`
- `app/src/App.tsx`

## 12. 后续强化方向

在不改变当前单入口产品形态的前提下，后续更适合继续增强：

- 设备管理与 grant 生命周期
- 本地密钥保护方式
- 密钥轮换
- 配对、撤销与迁移测试
- 安全事件与审计可见性
