import { cwd as processCwd } from "node:process";

import { createDaemonFromEnv } from "./daemon";
import { createPairingCode, listAuditEvents, listDeviceGrants, resolveDeviceId, revokeDeviceGrant } from "./relay-admin";
import { getAgentHome, getStateFilePath, loadState } from "./state-store";
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
  return resolveDeviceId(typeof args.deviceId === "string" ? args.deviceId : undefined);
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
  });

  console.log(`已创建会话 ${session.sid} (${session.name})`);
  await sendInput(session, `${commandArgs.join(" ")}\n`);
  await attachSession(session);
}

async function runPair(argv: string[]): Promise<void> {
  const deviceId = getDeviceId(argv);
  const payload = await createPairingCode(deviceId);
  console.log(`设备: ${payload.deviceId}`);
  console.log(`配对码: ${payload.pairingCode}`);
  console.log(`有效期至: ${payload.expiresAt}`);
  console.log("请在手机端输入这个配对码，换取设备访问令牌。");
}

async function runGrants(argv: string[]): Promise<void> {
  const deviceId = getDeviceId(argv);
  const payload = await listDeviceGrants(deviceId);
  if (payload.grants.length === 0) {
    console.log(`设备 ${payload.deviceId} 当前没有任何已绑定访问令牌。`);
    return;
  }

  console.table(
    payload.grants.map((grant) => ({
      token: grant.accessToken,
      createdAt: grant.createdAt,
      lastUsedAt: grant.lastUsedAt,
    })),
  );
}

async function runRevoke(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const accessToken = typeof args.token === "string" ? args.token : undefined;
  if (!accessToken) {
    throw new Error("请通过 --token 指定要撤销的访问令牌。");
  }

  const deviceId = getDeviceId(argv);
  await revokeDeviceGrant(deviceId, accessToken);
  console.log(`已撤销设备 ${deviceId} 的访问令牌 ${accessToken}`);
}

async function runAudit(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const deviceId = getDeviceId(argv);
  const parsedLimit = typeof args.limit === "string" ? Number(args.limit) : 20;
  if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
    throw new Error("请通过 --limit 指定大于 0 的数字。");
  }
  const limit = Math.floor(parsedLimit);
  const payload = await listAuditEvents(deviceId, limit);
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
    case "daemon": {
      await ensureTmuxAvailable();
      const daemon = createDaemonFromEnv();
      process.on("SIGINT", () => {
        void daemon.stop().finally(() => process.exit(0));
      });
      process.on("SIGTERM", () => {
        void daemon.stop().finally(() => process.exit(0));
      });
      await daemon.start();
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
