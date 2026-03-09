import { cwd as processCwd } from "node:process";

import type { PairingCodeResponse } from "@termpilot/protocol";
import { DEFAULT_AGENT_TOKEN, DEFAULT_DEVICE_ID } from "@termpilot/protocol";

import { createDaemonFromEnv } from "./daemon";
import { getAgentHome, getStateFilePath, loadState } from "./state-store";
import {
  attachSession,
  createSession,
  ensureTmuxAvailable,
  getSessionBySid,
  hasSession,
  killSession,
} from "./tmux-backend";

function printHelp(): void {
  console.log(`TermPilot agent 用法：

  pnpm dev:agent
  pnpm agent:create -- --name claude-main --cwd /path/to/project
  pnpm agent:list
  pnpm agent:kill -- --sid <sid>
  pnpm agent:attach -- --sid <sid>
  pnpm agent:pair
  pnpm agent:doctor
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

function getRelayHttpUrl(): string {
  const relayUrl = process.env.TERMPILOT_RELAY_URL ?? "ws://127.0.0.1:8787/ws";
  const url = new URL(relayUrl);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = "/api/pairing-codes";
  url.search = "";
  return url.toString();
}

async function runPair(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const deviceId = typeof args.deviceId === "string"
    ? args.deviceId
    : process.env.TERMPILOT_DEVICE_ID ?? DEFAULT_DEVICE_ID;
  const agentToken = process.env.TERMPILOT_AGENT_TOKEN ?? DEFAULT_AGENT_TOKEN;

  const response = await fetch(getRelayHttpUrl(), {
    method: "POST",
    headers: {
      authorization: `Bearer ${agentToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ deviceId }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`申请配对码失败: ${message}`);
  }

  const payload = await response.json() as PairingCodeResponse;
  console.log(`设备: ${payload.deviceId}`);
  console.log(`配对码: ${payload.pairingCode}`);
  console.log(`有效期至: ${payload.expiresAt}`);
  console.log("请在手机端输入这个配对码，换取设备访问令牌。");
}

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;

  if (!command || command === "help" || command === "--help") {
    printHelp();
    return;
  }

  await ensureTmuxAvailable();

  switch (command) {
    case "daemon": {
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
      await runCreate(rest);
      return;
    case "list":
      runList();
      return;
    case "kill":
      await runKill(rest);
      return;
    case "attach":
      await runAttach(rest);
      return;
    case "doctor":
      await runDoctor();
      return;
    case "pair":
      await runPair(rest);
      return;
    default:
      printHelp();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
