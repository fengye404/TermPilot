# 开发文档

## 本地开发

```bash
pnpm install
pnpm dev:relay
pnpm dev:app
pnpm dev:agent
```

## 常用检查

```bash
pnpm typecheck
pnpm build
pnpm test:ui-smoke
pnpm check:stability
```

说明：

- `pnpm test:ui-smoke` 现在按手机视口跑，覆盖配对、切会话、关闭会话、清除绑定，以及“查看后终端区进入可视区”
- `pnpm check:stability` 会验证 relay / agent 长时间运行下的输出缓冲和重连一致性

## 当前仓库形态

- 根入口：`src/cli.ts`
- PC 端：`agent/`
- 手机端：`app/`
- relay：`relay/`
- 共享协议：`packages/protocol/`

## 发布流程

1. 提升版本号
2. 运行 `pnpm build`
3. 运行 `pnpm test:ui-smoke`
4. 运行 `pnpm check:stability`
5. 执行 `npm publish --access public`

当前已发布包名：

```bash
@fengye404/termpilot
```
