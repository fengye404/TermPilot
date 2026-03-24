# 故障排查

这一页按症状排，不按模块排。先走最短路径，别一上来就全站乱翻。

## 1. 手机上打不开页面

先查这几项：

- 域名解析是否生效
- `80` / `443` 是否放行
- 反向代理是否正常
- relay 是否真的在监听

```bash
termpilot relay
curl http://127.0.0.1:8787/health
```

## 2. 电脑执行 `termpilot agent` 后手机看不到设备

先查这几项：

- agent 是否已经后台运行
- relay 地址是否配置正确
- relay 是否需要公网访问却仍在用 `ws://` 地址

```bash
termpilot agent
termpilot agent status
```

## 3. 配对失败或看不到配对码

先检查：

- relay 是否可用
- agent 是否已经连上 relay
- 当前浏览器是否仍保留旧绑定

重新生成配对码：

```bash
termpilot agent --pair
```

如果你刚升级过版本，或者本地绑定还是旧 token，最稳的做法通常是清掉旧绑定后重新配对。

## 4. 页面已经升级，但浏览器还像在跑旧版本

当前版本会主动做两件事：

- 首页 HTML 使用 `no-store`
- 浏览器在发现 relay 端构建版本更新时，会尝试清理旧壳并自动刷新

如果你仍然明显看到旧页面，优先检查：

- 当前页面里配置的 relay 地址是否正确
- 反向代理是否仍在缓存 HTML
- 浏览器里是否还保留旧的站点数据或旧 PWA 壳子

最直接的验证方式：

```bash
curl https://your-domain.com/health
```

确认返回的 `appVersion` / `appBuild` 是否已经是新版本。

## 5. 手机上看不到某条任务

最常见的原因是：

- 这条任务不是通过 TermPilot 管理的会话启动的

正确方式：

```bash
termpilot run -- <command>
```

或者：

```bash
termpilot create --name my-task --cwd /path/to/project
termpilot attach --sid <sid>
```

## 6. 真实程序退出了，但网页状态没更新

先分清你做的到底是哪种退出：

- 如果程序本身退出，会话应同步变成 `已退出`
- 如果你只是关掉本地终端窗口，往往只是离开或 detach，不等于会话结束

对托管命令会话来说，长期无人附着且无输出时，agent 会自动治理残留会话。

## 7. agent 还连着旧地址

如果你改过域名或端口，但 agent 还连旧配置：

```bash
termpilot agent stop
termpilot agent
```

如果你用了自定义 `TERMPILOT_HOME`，确认你改的是正确那份状态目录。

## 8. 想直接看实时日志

relay：

```bash
termpilot relay run
```

agent：

```bash
termpilot agent --foreground
```

或者直接看日志文件：

```bash
tail -f ~/.termpilot/relay.log
tail -f ~/.termpilot/agent.log
```

## 9. Docker relay 起不来

先查这几项：

- 端口是否被占用
- `TERMPILOT_AGENT_TOKEN` 是否设置
- SQLite 持久化卷是否可写

快速验证：

```bash
docker ps
docker logs termpilot-relay
curl http://127.0.0.1:8787/health
```

## 10. 下一步读什么

- 部署问题：读 [部署指南](./deployment-guide.md)
- agent 本地问题：读 [Agent 运维](./agent-operations.md)
- 命令语义问题：读 [CLI 参考](./cli-reference.md)
