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
5. 执行 `npm publish`

当前已发布包名：

```bash
@fengye404/termpilot
```
