import { spawn } from "node:child_process";
import { existsSync, openSync } from "node:fs";
import { cwd as processCwd } from "node:process";
import { createInterface } from "node:readline/promises";
import { setTimeout as delay } from "node:timers/promises";

import { DEFAULT_DEVICE_ID, getPublicKeyFingerprint } from "@termpilot/protocol";

import { createDaemonFromEnv } from "./daemon";
import { createPairingCode, listAuditEvents, listDeviceGrants, resolveDeviceId, resolvePreferredRelayUrl, revokeDeviceGrant } from "./relay-admin";
import {
  type AgentConfig,
  clearAgentRuntime,
  getAgentConfigFilePath,
  getAgentHome,
  getAgentLogFilePath,
  getDeviceKeyFilePath,
  getOrCreateDeviceKeyPairAsync,
  getOrCreateGeneratedDeviceId,
  getStateFilePath,
  loadAgentConfig,
  loadAgentRuntime,
  loadState,
  rewriteSessionsDeviceId,
  saveAgentConfig,
  saveAgentRuntime,
} from "./state-store";
import {
  attachSession,
  createSession,
  ensureTmuxAvailable,
  getSessionBySid,
  hasSession,
  killSession,
  sendInput,
} from "./tmux-backend";

function printHelp(): void {
  console.log(`TermPilot agent 用法：

  termpilot agent
  termpilot agent --pair
  termpilot agent --foreground
  termpilot agent status
  termpilot agent stop
  termpilot claude code
  termpilot run -- claude code
  termpilot create --name claude-main --cwd /path/to/project
  termpilot list
  termpilot kill --sid <sid>
  termpilot attach --sid <sid>
  termpilot pair
  termpilot grants
  termpilot audit
  termpilot revoke --token <accessToken>
  termpilot doctor
`);
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current?.startsWith("--")) {
      continue;
    }

    const key = current.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

async function runCreate(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const session = await createSession({
    name: typeof args.name === "string" ? args.name : undefined,
    cwd: typeof args.cwd === "string" ? args.cwd : processCwd(),
    shell: typeof args.shell === "string" ? args.shell : undefined,
    deviceId: typeof args.deviceId === "string" ? args.deviceId : undefined,
  });

  console.log(`已创建会话 ${session.sid}`);
  console.log(`名称: ${session.name}`);
  console.log(`tmux: ${session.tmuxSessionName}`);
}

function runList(): void {
  const sessions = loadState().sessions;
  if (sessions.length === 0) {
    console.log("当前没有任何会话。");
    return;
  }

  console.table(
    sessions.map((session) => ({
      sid: session.sid,
      name: session.name,
      status: session.status,
      cwd: session.cwd,
      tmux: session.tmuxSessionName,
      lastSeq: session.lastSeq,
      updatedAt: session.lastActivityAt,
    })),
  );
}

async function runKill(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const sid = typeof args.sid === "string" ? args.sid : undefined;
  if (!sid) {
    throw new Error("请通过 --sid 指定会话。");
  }

  const session = await killSession(sid);
  console.log(`已关闭会话 ${session.sid} (${session.name})`);
}

async function runAttach(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const sid = typeof args.sid === "string" ? args.sid : undefined;
  if (!sid) {
    throw new Error("请通过 --sid 指定会话。");
  }

  const session = getSessionBySid(sid);
  if (!session) {
    throw new Error(`会话 ${sid} 不存在。`);
  }

  const exists = await hasSession(session.tmuxSessionName);
  if (!exists) {
    throw new Error(`tmux 会话 ${session.tmuxSessionName} 不存在。`);
  }

  await attachSession(session);
}

async function runDoctor(): Promise<void> {
  console.log(`状态目录: ${getAgentHome()}`);
  console.log(`状态文件: ${getStateFilePath()}`);
  await ensureTmuxAvailable();
  console.log("tmux 可用。");
}

function getDeviceId(argv: string[]): string {
  const args = parseArgs(argv);
  const explicitDeviceId = typeof args.deviceId === "string" ? args.deviceId : undefined;
  if (explicitDeviceId) {
    return resolveDeviceId(explicitDeviceId);
  }
  const saved = loadAgentConfig();
  return resolveDeviceId(saved?.deviceId);
}

function maybeMigrateLegacyDeviceId(config: AgentConfig, source: "cli" | "env" | "saved" | "prompt"): { config: AgentConfig; migratedFrom?: string } {
  if (source === "cli" || source === "env") {
    return { config };
  }
  if (config.deviceId !== DEFAULT_DEVICE_ID) {
    return { config };
  }

  const nextDeviceId = getOrCreateGeneratedDeviceId();
  if (nextDeviceId === config.deviceId) {
    return { config };
  }

  rewriteSessionsDeviceId(config.deviceId, nextDeviceId);
  return {
    config: {
      ...config,
      deviceId: nextDeviceId,
    },
    migratedFrom: config.deviceId,
  };
}

function isLocalRelayHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || /^10\./.test(hostname) || /^192\.168\./.test(hostname) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
}

function normalizeRelayUrl(rawHost: string, rawPort: string): string {
  const hostInput = rawHost.trim();
  const portInput = rawPort.trim();

  if (hostInput.includes("://")) {
    const parsed = new URL(hostInput);
    if (parsed.protocol === "http:") {
      parsed.protocol = "ws:";
    } else if (parsed.protocol === "https:") {
      parsed.protocol = "wss:";
    }
    if (portInput) {
      const normalizedPort = Number(portInput);
      if (!Number.isFinite(normalizedPort) || normalizedPort <= 0 || normalizedPort > 65535) {
        throw new Error("端口无效，请输入 1 到 65535 之间的数字。");
      }
      parsed.port = String(normalizedPort);
    } else if (!parsed.port && parsed.protocol === "ws:" && isLocalRelayHost(parsed.hostname)) {
      parsed.port = "8787";
    }
    if (!parsed.pathname || parsed.pathname === "/") {
      parsed.pathname = "/ws";
    }
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  }

  const protocol = isLocalRelayHost(hostInput) ? "ws:" : "wss:";
  if (!portInput) {
    if (protocol === "ws:") {
      return `${protocol}//${hostInput}:8787/ws`;
    }
    return `${protocol}//${hostInput}/ws`;
  }

  const normalizedPort = Number(portInput);
  if (!Number.isFinite(normalizedPort) || normalizedPort <= 0 || normalizedPort > 65535) {
    throw new Error("端口无效，请输入 1 到 65535 之间的数字。");
  }
  return `${protocol}//${hostInput}:${normalizedPort}/ws`;
}

async function promptForAgentConfig(deviceId: string): Promise<AgentConfig> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    console.log("还没有找到本机的 relay 配置，先做一次初始化。");
    const host = (await rl.question("请输入 relay 域名或 IP: ")).trim();
    if (!host) {
      throw new Error("未输入 relay 域名或 IP，已取消。");
    }
    const port = await rl.question("请输入 relay 端口（反代域名可直接回车；本地 IP 默认 8787）: ");
    const relayUrl = normalizeRelayUrl(host, port);
    console.log(`将使用 relay: ${relayUrl}`);
    return { relayUrl, deviceId };
  } finally {
    rl.close();
  }
}

function getResolvedConfig(argv: string[]): { config: AgentConfig; source: "cli" | "env" | "saved" } | null {
  const args = parseArgs(argv);
  const deviceId = getDeviceId(argv);
  const cliRelayUrl = typeof args.relay === "string" ? args.relay.trim() : "";
  if (cliRelayUrl) {
    return {
      source: "cli",
      config: {
        relayUrl: cliRelayUrl,
        deviceId,
      },
    };
  }

  const envRelayUrl = process.env.TERMPILOT_RELAY_URL?.trim();
  if (envRelayUrl) {
    return {
      source: "env",
      config: {
        relayUrl: envRelayUrl,
        deviceId,
      },
    };
  }

  const saved = loadAgentConfig();
  if (saved) {
    return {
      source: "saved",
      config: {
        relayUrl: saved.relayUrl,
        deviceId,
      },
    };
  }

  return null;
}

async function ensureConfigured(argv: string[]): Promise<{ config: AgentConfig; source: "cli" | "env" | "saved" | "prompt" }> {
  const resolved = getResolvedConfig(argv);
  if (resolved) {
    const migrated = maybeMigrateLegacyDeviceId(resolved.config, resolved.source);
    if (migrated.migratedFrom) {
      saveAgentConfig(migrated.config);
    }
    return { config: migrated.config, source: resolved.source };
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(`还没有配置 relay，请先执行：termpilot agent --relay wss://你的域名/ws，或在交互终端里直接运行 termpilot agent。`);
  }

  const config = await promptForAgentConfig(getDeviceId(argv));
  saveAgentConfig(config);
  return { config, source: "prompt" };
}

function applyAgentConfig(config: AgentConfig): void {
  process.env.TERMPILOT_RELAY_URL = config.relayUrl;
  process.env.TERMPILOT_DEVICE_ID = config.deviceId;
}

function persistMigratedRelayUrl(deviceId: string): boolean {
  const migratedRelayUrl = process.env.TERMPILOT_RELAY_URL?.trim();
  if (!migratedRelayUrl) {
    return false;
  }

  let changed = false;
  const saved = loadAgentConfig();
  if (saved && saved.deviceId === deviceId && saved.relayUrl !== migratedRelayUrl) {
    saveAgentConfig({
      relayUrl: migratedRelayUrl,
      deviceId,
    });
    console.log(`已自动更新 relay 地址为: ${migratedRelayUrl}`);
    changed = true;
  }

  const runtime = loadAgentRuntime();
  if (runtime && runtime.deviceId === deviceId && runtime.relayUrl !== migratedRelayUrl) {
    saveAgentRuntime({
      ...runtime,
      relayUrl: migratedRelayUrl,
    });
    changed = true;
  }

  return changed;
}

function printRuntimeStatus(runtime = readRuntimeStatus().runtime): void {
  if (!runtime) {
    console.log("后台 agent 当前未运行。");
    console.log(`状态目录: ${getAgentHome()}`);
    console.log(`配置文件: ${getAgentConfigFilePath()}`);
    console.log(`日志: ${getAgentLogFilePath()}`);
    return;
  }

  const sessions = loadState().sessions.filter((session) => session.deviceId === runtime.deviceId);
  const runningSessions = sessions.filter((session) => session.status === "running").length;
  console.log("后台 agent 正在运行。");
  console.log(`PID: ${runtime.pid}`);
  console.log(`设备: ${runtime.deviceId}`);
  console.log(`relay: ${runtime.relayUrl}`);
  console.log(`启动时间: ${runtime.startedAt}`);
  console.log(`日志: ${getAgentLogFilePath()}`);
  console.log(`会话: ${runningSessions} 个运行中 / ${sessions.length} 个总计`);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readRuntimeStatus() {
  const runtime = loadAgentRuntime();
  if (!runtime) {
    return { runtime: null, alive: false };
  }
  const alive = isProcessAlive(runtime.pid);
  if (!alive) {
    clearAgentRuntime(runtime.pid);
    return { runtime: null, alive: false };
  }
  return { runtime, alive };
}

function needsSecurePairingRepair(): boolean {
  return !existsSync(getDeviceKeyFilePath());
}

function isMissingAgentPublicKeyError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("agentPublicKey 不能为空");
}

async function waitForPairingCode(deviceId: string): Promise<Awaited<ReturnType<typeof createPairingCode>> | null> {
  const deviceKeyPair = await getOrCreateDeviceKeyPairAsync();
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const payload = await createPairingCode(deviceId, deviceKeyPair.publicKey);
      persistMigratedRelayUrl(deviceId);
      return payload;
    } catch (error) {
      lastError = error;
      persistMigratedRelayUrl(deviceId);
      await delay(500);
    }
  }
  if (lastError instanceof Error) {
    console.warn(`后台 agent 已启动，但暂时还没拿到配对码：${lastError.message}`);
  }
  return null;
}

async function runStart(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const shouldPair = Boolean(args.pair);
  const resolved = await ensureConfigured(argv);
  let { config } = resolved;
  const { source } = resolved;
  const previousConfig = loadAgentConfig();
  const migratedDeviceId = previousConfig?.deviceId === DEFAULT_DEVICE_ID && config.deviceId !== previousConfig.deviceId
    ? previousConfig.deviceId
    : undefined;
  const preferredRelayUrl = await resolvePreferredRelayUrl(config.relayUrl);
  if (preferredRelayUrl !== config.relayUrl) {
    config = {
      ...config,
      relayUrl: preferredRelayUrl,
    };
    console.log(`已自动修正 relay 地址为: ${preferredRelayUrl}`);
  }
  applyAgentConfig(config);

  if (source === "cli" || source === "prompt" || source === "saved") {
    saveAgentConfig(config);
  }

  if (migratedDeviceId) {
    console.log(`检测到旧的共享设备名 ${migratedDeviceId}，已自动迁移为唯一设备名 ${config.deviceId}。`);
    console.log("这是一次安全修复：共享 relay 上不同电脑不能继续共用 pc-main。请重新给手机配对。");
  }

  if (args.foreground) {
    await runDaemon();
    return;
  }

  const deviceId = config.deviceId;
  const relayUrl = config.relayUrl;
  const existing = readRuntimeStatus();

  if (existing.runtime && existing.alive) {
    const sameRuntime = existing.runtime.relayUrl === relayUrl && existing.runtime.deviceId === deviceId;
    if (!sameRuntime) {
      console.log("检测到后台 agent 已在运行，但配置和当前命令不一致，正在重启。");
      await runStop();
    } else {
      printRuntimeStatus(existing.runtime);
      if (shouldPair) {
        if (needsSecurePairingRepair()) {
          console.log("检测到后台 agent 缺少设备密钥，正在自动重启以完成兼容修复。");
          await runStop();
          await runStart(argv);
          return;
        }

        let pairing = await waitForPairingCode(deviceId);
        if (!pairing) {
          const deviceKeyPair = await getOrCreateDeviceKeyPairAsync();
          try {
            pairing = await createPairingCode(deviceId, deviceKeyPair.publicKey);
            persistMigratedRelayUrl(deviceId);
          } catch (error) {
            if (isMissingAgentPublicKeyError(error)) {
              console.log("检测到后台 agent 仍在使用旧配对状态，正在自动重启后重试。");
              await runStop();
              await runStart(argv);
              return;
            }
            throw error;
          }
        }
        if (pairing) {
          const deviceKeyPair = await getOrCreateDeviceKeyPairAsync();
          console.log(`设备指纹: ${await getPublicKeyFingerprint(deviceKeyPair.publicKey)}`);
          console.log(`配对码: ${pairing.pairingCode}`);
          console.log(`有效期至: ${pairing.expiresAt}`);
        } else {
          const migrated = loadAgentConfig();
          if (migrated && migrated.deviceId === deviceId && migrated.relayUrl !== existing.runtime.relayUrl) {
            console.log("检测到后台 agent 仍在使用旧 relay 地址，正在自动重启后重试。");
            await runStop();
            await runStart(argv);
            return;
          }
        }
      } else {
        console.log("如需重新给手机配对，请执行：termpilot agent --pair");
      }
      return;
    }
  }

  clearAgentRuntime();

  const logFilePath = getAgentLogFilePath();
  const logFd = openSync(logFilePath, "a");
  const child = spawn(process.execPath, [process.argv[1]!, "agent-daemon"], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: process.env,
  });

  child.unref();

  if (!child.pid) {
    throw new Error("后台 agent 启动失败，未获取到子进程 PID。");
  }

  saveAgentRuntime({
    pid: child.pid,
    relayUrl,
    deviceId,
    startedAt: new Date().toISOString(),
  });

  console.log(`后台 agent 已启动，PID: ${child.pid}`);
  console.log(`设备: ${deviceId}`);
  console.log(`relay: ${relayUrl}`);
  console.log(`日志: ${logFilePath}`);

  if (source === "prompt") {
    console.log("本次 relay 配置已保存。以后直接运行 termpilot agent 即可。");
  }

  if (shouldPair || source !== "saved") {
    const pairing = await waitForPairingCode(deviceId);
    if (pairing) {
      const deviceKeyPair = await getOrCreateDeviceKeyPairAsync();
      console.log(`设备指纹: ${await getPublicKeyFingerprint(deviceKeyPair.publicKey)}`);
      console.log(`配对码: ${pairing.pairingCode}`);
      console.log(`有效期至: ${pairing.expiresAt}`);
      console.log("手机端直接打开 relay 页面并输入这个配对码即可。");
    }
  } else {
    console.log("如需重新给手机配对，请执行：termpilot agent --pair");
  }
}

function runStatus(): void {
  const { runtime, alive } = readRuntimeStatus();
  if (!runtime || !alive) {
    console.log("后台 agent 当前未运行。");
    console.log(`状态目录: ${getAgentHome()}`);
    console.log(`配置文件: ${getAgentConfigFilePath()}`);
    console.log(`日志: ${getAgentLogFilePath()}`);
    const config = loadAgentConfig();
    if (config) {
      console.log(`已保存 relay: ${config.relayUrl}`);
      console.log(`已保存设备: ${config.deviceId}`);
    }
    return;
  }
  printRuntimeStatus(runtime);
  const config = loadAgentConfig();
  if (config && (config.relayUrl !== runtime.relayUrl || config.deviceId !== runtime.deviceId)) {
    console.log(`已保存 relay: ${config.relayUrl}`);
    console.log(`已保存设备: ${config.deviceId}`);
  }
}

async function runStop(): Promise<void> {
  const { runtime, alive } = readRuntimeStatus();
  if (!runtime || !alive) {
    console.log("后台 agent 当前未运行。");
    clearAgentRuntime();
    return;
  }

  process.kill(runtime.pid, "SIGTERM");
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!isProcessAlive(runtime.pid)) {
      clearAgentRuntime(runtime.pid);
      console.log(`后台 agent 已停止，PID: ${runtime.pid}`);
      return;
    }
    await delay(100);
  }

  process.kill(runtime.pid, "SIGKILL");
  clearAgentRuntime(runtime.pid);
  console.log(`后台 agent 已强制停止，PID: ${runtime.pid}`);
}

function buildQuickSessionName(commandArgs: string[]): string {
  const raw = commandArgs.join("-").trim().toLowerCase();
  const normalized = raw.replace(/[^a-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return normalized.slice(0, 32) || "task";
}

async function runManagedCommand(argv: string[]): Promise<void> {
  const commandArgs = argv[0] === "--" ? argv.slice(1) : argv;
  if (commandArgs.length === 0) {
    throw new Error("请在 termpilot 后面提供要运行的命令，例如：termpilot claude code");
  }

  const session = await createSession({
    name: buildQuickSessionName(commandArgs),
    cwd: processCwd(),
    deviceId: resolveDeviceId(),
    command: commandArgs,
  });

  console.log(`已创建会话 ${session.sid} (${session.name})`);
  await attachSession(session);
}

async function runDaemon(): Promise<void> {
  await ensureTmuxAvailable();
  const config = await ensureConfigured([]);
  applyAgentConfig(config.config);
  const relayUrl = config.config.relayUrl;
  const deviceId = config.config.deviceId;
  saveAgentRuntime({
    pid: process.pid,
    relayUrl,
    deviceId,
    startedAt: new Date().toISOString(),
  });
  const daemon = createDaemonFromEnv();
  const stop = () => {
    void daemon.stop().finally(() => {
      clearAgentRuntime(process.pid);
      process.exit(0);
    });
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  process.on("exit", () => {
    clearAgentRuntime(process.pid);
  });
  await daemon.start();
}

async function runPair(argv: string[]): Promise<void> {
  const config = await ensureConfigured(argv);
  applyAgentConfig(config.config);
  const deviceId = getDeviceId(argv);
  const deviceKeyPair = await getOrCreateDeviceKeyPairAsync();
  const payload = await createPairingCode(deviceId, deviceKeyPair.publicKey);
  persistMigratedRelayUrl(deviceId);
  console.log(`设备: ${payload.deviceId}`);
  console.log(`设备指纹: ${await getPublicKeyFingerprint(deviceKeyPair.publicKey)}`);
  console.log(`配对码: ${payload.pairingCode}`);
  console.log(`有效期至: ${payload.expiresAt}`);
  console.log("请在手机端输入这个配对码，换取设备访问令牌。");
}

async function runGrants(argv: string[]): Promise<void> {
  const config = await ensureConfigured(argv);
  applyAgentConfig(config.config);
  const deviceId = getDeviceId(argv);
  const payload = await listDeviceGrants(deviceId);
  persistMigratedRelayUrl(deviceId);
  if (payload.grants.length === 0) {
    console.log(`设备 ${payload.deviceId} 当前没有任何已绑定访问令牌。`);
    return;
  }

  console.table(
    await Promise.all(payload.grants.map(async (grant) => ({
      token: `${grant.accessToken.slice(0, 8)}...`,
      fingerprint: grant.clientPublicKey ? await getPublicKeyFingerprint(grant.clientPublicKey) : "(unknown)",
      createdAt: grant.createdAt,
      lastUsedAt: grant.lastUsedAt,
    }))),
  );
}

async function runRevoke(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const accessToken = typeof args.token === "string" ? args.token : undefined;
  if (!accessToken) {
    throw new Error("请通过 --token 指定要撤销的访问令牌。");
  }

  const config = await ensureConfigured(argv);
  applyAgentConfig(config.config);
  const deviceId = getDeviceId(argv);
  await revokeDeviceGrant(deviceId, accessToken);
  persistMigratedRelayUrl(deviceId);
  console.log(`已撤销设备 ${deviceId} 的访问令牌 ${accessToken}`);
}

async function runAudit(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const config = await ensureConfigured(argv);
  applyAgentConfig(config.config);
  const deviceId = getDeviceId(argv);
  const parsedLimit = typeof args.limit === "string" ? Number(args.limit) : 20;
  if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
    throw new Error("请通过 --limit 指定大于 0 的数字。");
  }
  const limit = Math.floor(parsedLimit);
  const payload = await listAuditEvents(deviceId, limit);
  persistMigratedRelayUrl(deviceId);
  if (payload.events.length === 0) {
    console.log(`设备 ${payload.deviceId} 当前没有审计日志。`);
    return;
  }

  console.table(
    payload.events.map((event) => ({
      createdAt: event.createdAt,
      action: event.action,
      actorRole: event.actorRole,
      detail: event.detail,
    })),
  );
}

export async function runAgentCli(argv = process.argv.slice(2)): Promise<void> {
  const [command, ...rest] = argv;

  if (!command || command === "help" || command === "--help") {
    printHelp();
    return;
  }

  switch (command) {
    case "start":
      await runStart(rest);
      return;
    case "status":
      runStatus();
      return;
    case "stop":
      await runStop();
      return;
    case "daemon": {
      await runDaemon();
      return;
    }
    case "create":
      await ensureTmuxAvailable();
      await runCreate(rest);
      return;
    case "list":
      runList();
      return;
    case "kill":
      await ensureTmuxAvailable();
      await runKill(rest);
      return;
    case "attach":
      await ensureTmuxAvailable();
      await runAttach(rest);
      return;
    case "doctor":
      await runDoctor();
      return;
    case "pair":
      await runPair(rest);
      return;
    case "grants":
      await runGrants(rest);
      return;
    case "audit":
      await runAudit(rest);
      return;
    case "revoke":
      await runRevoke(rest);
      return;
    case "run":
      await ensureTmuxAvailable();
      await runManagedCommand(rest);
      return;
    default:
      await ensureTmuxAvailable();
      await runManagedCommand(argv);
  }
}
