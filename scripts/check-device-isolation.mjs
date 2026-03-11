import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

import { WebSocket } from "ws";

const ROOT = "/Users/fengye/workspace/TermPilot";
const RELAY_PORT = 19000 + Math.floor(Math.random() * 1000);
const HTTP_BASE = `http://127.0.0.1:${RELAY_PORT}`;
const WS_BASE = `ws://127.0.0.1:${RELAY_PORT}/ws`;
const AGENT_TOKEN = "test-agent-token";
const RELAY_HOME = mkdtempSync(path.join(tmpdir(), "termpilot-isolation-"));

class MessageSocket {
  constructor(ws) {
    this.ws = ws;
    this.queue = [];
    this.waiters = [];
    this.ws.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      const waiterIndex = this.waiters.findIndex((waiter) => waiter.predicate(message));
      if (waiterIndex >= 0) {
        const [waiter] = this.waiters.splice(waiterIndex, 1);
        clearTimeout(waiter.timeoutId);
        waiter.resolve(message);
        return;
      }
      this.queue.push(message);
    });
  }

  async waitFor(predicate, label, timeoutMs = 2000) {
    const queuedIndex = this.queue.findIndex(predicate);
    if (queuedIndex >= 0) {
      return this.queue.splice(queuedIndex, 1)[0];
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.waiters = this.waiters.filter((waiter) => waiter.timeoutId !== timeoutId);
        reject(new Error(`等待消息超时: ${label}`));
      }, timeoutMs);
      this.waiters.push({ predicate, resolve, timeoutId });
    });
  }

  send(message) {
    this.ws.send(JSON.stringify(message));
  }

  close() {
    this.ws.close();
  }
}

async function waitForRelay() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${HTTP_BASE}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // ignore until relay is ready
    }
    await delay(200);
  }
  throw new Error("等待 relay 就绪超时");
}

async function connectSocket(url) {
  return await new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timeoutId = setTimeout(() => {
      ws.close();
      reject(new Error(`连接超时: ${url}`));
    }, 2000);

    ws.once("open", () => {
      clearTimeout(timeoutId);
      resolve(new MessageSocket(ws));
    });
    ws.once("error", (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });
  });
}

async function createPairingCode(deviceId) {
  const response = await fetch(`${HTTP_BASE}/api/pairing-codes`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${AGENT_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ deviceId }),
  });
  if (!response.ok) {
    throw new Error(`创建设备 ${deviceId} 配对码失败: ${await response.text()}`);
  }
  return response.json();
}

async function redeemPairingCode(pairingCode) {
  const response = await fetch(`${HTTP_BASE}/api/pairings/redeem`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ pairingCode }),
  });
  if (!response.ok) {
    throw new Error(`兑换配对码失败: ${await response.text()}`);
  }
  return response.json();
}

async function expectNoMessage(socket, predicate, timeoutMs, label) {
  try {
    await socket.waitFor(predicate, label, timeoutMs);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("等待消息超时")) {
      return;
    }
    throw error;
  }
  throw new Error(`收到不该出现的消息: ${label}`);
}

const relayProcess = spawn(process.execPath, ["dist/cli.js", "relay", "run"], {
  cwd: ROOT,
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: String(RELAY_PORT),
    TERMPILOT_HOME: RELAY_HOME,
    TERMPILOT_AGENT_TOKEN: AGENT_TOKEN,
    TERMPILOT_CLIENT_TOKEN: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let relayLogs = "";
relayProcess.stdout.on("data", (chunk) => {
  relayLogs += chunk.toString("utf8");
});
relayProcess.stderr.on("data", (chunk) => {
  relayLogs += chunk.toString("utf8");
});

const sockets = [];

try {
  await waitForRelay();

  const agentA = await connectSocket(`${WS_BASE}?role=agent&token=${AGENT_TOKEN}&deviceId=device-a`);
  const agentB = await connectSocket(`${WS_BASE}?role=agent&token=${AGENT_TOKEN}&deviceId=device-b`);
  sockets.push(agentA, agentB);

  await agentA.waitFor((message) => message.type === "auth.ok" && message.payload?.deviceId === "device-a", "agent-a auth");
  await agentB.waitFor((message) => message.type === "auth.ok" && message.payload?.deviceId === "device-b", "agent-b auth");

  const pairingA = await createPairingCode("device-a");
  const pairingB = await createPairingCode("device-b");
  const grantA = await redeemPairingCode(pairingA.pairingCode);
  const grantB = await redeemPairingCode(pairingB.pairingCode);

  const clientA = await connectSocket(`${WS_BASE}?role=client&token=${grantA.accessToken}`);
  const clientB = await connectSocket(`${WS_BASE}?role=client&token=${grantB.accessToken}`);
  sockets.push(clientA, clientB);

  await clientA.waitFor((message) => message.type === "auth.ok" && message.payload?.deviceId === "device-a", "client-a auth");
  await clientB.waitFor((message) => message.type === "auth.ok" && message.payload?.deviceId === "device-b", "client-b auth");

  const rogue = await connectSocket(`${WS_BASE}?role=client&token=demo-client-token`);
  sockets.push(rogue);
  await rogue.waitFor((message) => message.type === "error" && message.code === "AUTH_FAILED", "rogue auth failed");

  const sessionA = {
    sid: randomUUID(),
    deviceId: "device-a",
    name: "claude-a",
    backend: "tmux",
    shell: "/bin/zsh",
    cwd: "/tmp/a",
    status: "running",
    startedAt: new Date().toISOString(),
    lastSeq: 1,
    lastActivityAt: new Date().toISOString(),
    tmuxSessionName: "tmux-a",
  };
  const sessionB = {
    ...sessionA,
    sid: randomUUID(),
    deviceId: "device-b",
    name: "claude-b",
    cwd: "/tmp/b",
    tmuxSessionName: "tmux-b",
  };

  agentA.send({
    type: "session.created",
    deviceId: "device-a",
    payload: { session: sessionA },
  });
  agentB.send({
    type: "session.created",
    deviceId: "device-b",
    payload: { session: sessionB },
  });

  await clientA.waitFor((message) => message.type === "session.created" && message.deviceId === "device-a", "client-a own session");
  await clientB.waitFor((message) => message.type === "session.created" && message.deviceId === "device-b", "client-b own session");
  await expectNoMessage(clientA, (message) => message.type === "session.created" && message.deviceId === "device-b", 600, "client-a saw device-b session");
  await expectNoMessage(clientB, (message) => message.type === "session.created" && message.deviceId === "device-a", 600, "client-b saw device-a session");

  agentA.send({
    type: "session.output",
    deviceId: "device-a",
    sid: sessionA.sid,
    seq: 2,
    payload: {
      data: "hello-from-a",
      mode: "replace",
    },
  });
  agentB.send({
    type: "session.output",
    deviceId: "device-b",
    sid: sessionB.sid,
    seq: 2,
    payload: {
      data: "hello-from-b",
      mode: "replace",
    },
  });

  await clientA.waitFor((message) => message.type === "session.output" && message.deviceId === "device-a" && message.payload?.data === "hello-from-a", "client-a own output");
  await clientB.waitFor((message) => message.type === "session.output" && message.deviceId === "device-b" && message.payload?.data === "hello-from-b", "client-b own output");
  await expectNoMessage(clientA, (message) => message.type === "session.output" && message.deviceId === "device-b", 600, "client-a saw device-b output");
  await expectNoMessage(clientB, (message) => message.type === "session.output" && message.deviceId === "device-a", 600, "client-b saw device-a output");

  console.log("device isolation ok");
} finally {
  for (const socket of sockets) {
    try {
      socket.close();
    } catch {
      // ignore close failures
    }
  }
  relayProcess.kill("SIGTERM");
  await delay(300);
  if (!relayProcess.killed) {
    relayProcess.kill("SIGKILL");
  }
  rmSync(RELAY_HOME, { recursive: true, force: true });
}

if (relayProcess.exitCode && relayProcess.exitCode !== 0) {
  throw new Error(`relay 进程异常退出:\n${relayLogs}`);
}
