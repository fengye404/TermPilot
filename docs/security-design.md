# 安全设计

这份文档描述 **当前已实现** 的安全模型，以及它明确覆盖和未覆盖的边界。

它的目标不是宣称“绝对零信任”，而是把当前代码里的安全设计讲清楚，避免产品叙事和实际实现脱节。

## 1. 设计目标

当前安全设计聚焦四件事：

- 让 relay 不再保存会话内容
- 让会话敏感数据主要保留在 agent 所在电脑
- 让浏览器与 agent 之间的业务消息以加密形式经过 relay
- 在不破坏单入口和简洁使用路径的前提下，尽量收紧信任边界

## 2. 当前信任模型

当前运行时由三部分组成：

- `relay`
- `agent`
- `app`

当前模型下：

- `agent` 是会话主数据的持有者
- `app` 是已配对 client
- `relay` 是消息路由、配对和授权中枢

### 当前明确不再信任 relay 去做的事

- 保存会话标题
- 保存 `cwd`
- 保存 `shell`
- 保存 `tmuxSessionName`
- 保存终端输出
- 保存 replay 缓冲

### 当前仍然需要信任 relay 的事

- 交付浏览器端 Web UI
- 转交配对阶段的公钥材料
- 执行配对码与 grant 的中心路由

这意味着：

**当前模型已经是“内容不中心化 + 消息加密中转”，但还不是“relay 完全零信任”。**

## 3. 数据分类

### 只保留在 agent 端的数据

- 会话标题
- `cwd`
- `shell`
- `tmuxSessionName`
- 会话状态详情
- 终端输出
- replay 缓冲
- agent 长期私钥

### relay 当前持有的最小元数据

- 一次性配对码
- access grants
- client 公钥
- 审计事件

### 浏览器本地保存的数据

- relay 连接地址
- 当前设备的 access token
- client 本地长期密钥对
- 已绑定设备的 agent 公钥
- 最近查看的会话 UI 状态

## 4. 密钥与身份

### agent 密钥

- agent 首次需要配对时会生成长期 ECDH 密钥对
- 密钥存放在本地 `device-key.json`
- agent 公钥用于配对和后续消息加密

### client 密钥

- 浏览器在兑换配对码前生成长期 ECDH 密钥对
- client 私钥保存在浏览器本地存储中
- client 公钥在配对时提交给 relay，并由 relay 记录到对应 grant

### 设备指纹

- agent 会对自己的长期公钥计算 SHA-256 指纹
- `termpilot agent --pair` 与 `termpilot pair` 会打印该指纹
- 浏览器完成配对后也会展示同一指纹，供用户核对

这一步的目的，是让第一次绑定至少有一个可人工核对的身份锚点。

## 5. 配对流程

当前配对流程如下：

1. agent 确保本地长期密钥存在
2. agent 向 relay 申请一次性配对码，并提交 `agentPublicKey`
3. 浏览器生成本地长期密钥
4. 浏览器提交：
   - `pairingCode`
   - `clientPublicKey`
5. relay 签发单设备范围的 `accessToken`，并把 `agentPublicKey` 返回给浏览器
6. 用户核对电脑端与浏览器端显示的设备指纹

## 6. 消息加密模型

业务消息不再以明文 `session.*` 经过 relay，而是包裹在两类加密信封中：

- `secure.client`
- `secure.agent`

### 加密算法

- 密钥交换：ECDH P-256
- 对称加密：AES-256-GCM

### 当前做了什么

- 浏览器与 agent 通过长期密钥导出共享密钥
- 会话业务消息整体加密
- `deviceId`、`accessToken`、`reqId` 和消息方向会作为额外认证数据参与校验

这意味着：

- relay 无法只改外层 envelope metadata 而不触发解密失败
- 消息不仅有保密性，也绑定了当前路由上下文

## 7. relay 侧控制与约束

relay 当前负责：

- agent token 鉴权
- 配对码生成与兑换
- access grant 查询与撤销
- 审计事件记录
- 加密信封路由

relay 当前不负责：

- 会话缓存
- 输出缓存
- replay 缓冲
- 离线会话镜像

## 8. 当前模型能防什么

在当前实现里，这套设计能有效降低这些风险：

- relay 数据库或内存泄露后直接暴露会话内容
- relay 正常运行路径下查看会话明文
- 服务端持久化用户终端输出
- 仅篡改 envelope 外层 metadata 的消息混淆
- 旧版没有密钥材料的绑定继续静默复用

## 9. 当前模型还不能防什么

下面这些风险，当前版本没有完全解决：

- relay 托管的 Web UI 被恶意篡改
- relay 在第一次配对时恶意替换公钥
- 长期静态密钥泄露后的历史流量回溯解密
- 更强的元数据隐私保护

所以更准确地说：

**当前版本是“trusted-delivery, encrypted-routing”模型，而不是严格意义上的“zero-trust relay”。**

## 10. 运维建议

- 公网部署时优先使用 HTTPS / WSS
- 显式设置自己的 `TERMPILOT_AGENT_TOKEN`
- 配对时核对设备指纹
- 不长期共享浏览器侧 access token
- 换手机或共享设备后及时执行 `termpilot revoke`
- 如果需要保留配对与审计元数据，配置 PostgreSQL

## 11. 后续强化方向

在不破坏当前单入口产品形态的前提下，后续更适合继续做这些增强：

- 更清晰的设备管理与 grant 生命周期
- 更好的本地密钥保护方式
- 密钥轮换
- 更完整的配对与撤销测试
- 更清楚的安全边界提示
