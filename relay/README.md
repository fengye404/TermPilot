# Relay

这个目录用于放置部署在服务器上的中继服务，当前采用：

- Fastify
- WebSocket
- PostgreSQL

主要职责是：

- 完成用户和设备认证
- 在手机与 PC 之间路由实时消息
- 维护轻量会话元数据和最近输出缓冲

本地开发时如果没有设置 `DATABASE_URL`，会退回内存模式。
