import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { decryptFromPeer, encryptForPeer, generateE2EEKeyPair } from "../packages/protocol/src/index.ts";
import { WebSocket } from "ws";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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

async function createPairingCode(deviceId, agentPublicKey) {
  const response = await fetch(`${HTTP_BASE}/api/pairing-codes`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${AGENT_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ deviceId, agentPublicKey }),
  });
  if (!response.ok) {
    throw new Error(`创建设备 ${deviceId} 配对码失败: ${await response.text()}`);
  }
  return response.json();
}

async function redeemPairingCode(pairingCode, clientPublicKey) {
  const response = await fetch(`${HTTP_BASE}/api/pairings/redeem`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ pairingCode, clientPublicKey }),
  });
  if (!response.ok) {
    throw new Error(`兑换配对码失败: ${await response.text()}`);
  }
  return response.json();
}

async function sendSecureAgentMessage(socket, agentKeyPair, clientPublicKey, accessToken, deviceId, message) {
  const reqId = "reqId" in message ? message.reqId : undefined;
  const payload = await encryptForPeer(
    JSON.stringify(message),
    agentKeyPair.privateKey,
    clientPublicKey,
    {
      channel: "agent",
      deviceId,
      accessToken,
      reqId,
    },
  );
  socket.send({
    type: "secure.agent",
    reqId,
    deviceId,
    accessToken,
    payload,
  });
}

async function waitForDecryptedAgentMessage(socket, clientKeyPair, agentPublicKey, accessToken, deviceId, label, predicate) {
  const envelope = await socket.waitFor(
    (message) => message.type === "secure.agent" && message.accessToken === accessToken && message.deviceId === deviceId,
    label,
  );
  const plaintext = await decryptFromPeer(
    envelope.payload,
    clientKeyPair.privateKey,
    agentPublicKey,
    {
      channel: "agent",
      deviceId,
      accessToken,
      reqId: envelope.reqId,
    },
  );
  const businessMessage = JSON.parse(plaintext);
  if (!predicate(businessMessage)) {
    throw new Error(`收到未匹配的业务消息: ${label}\n${plaintext}`);
  }
  return businessMessage;
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

  const agentAKeys = await generateE2EEKeyPair();
  const agentBKeys = await generateE2EEKeyPair();
  const clientAKeys = await generateE2EEKeyPair();
  const clientBKeys = await generateE2EEKeyPair();

  const agentA = await connectSocket(`${WS_BASE}?role=agent&token=${AGENT_TOKEN}&deviceId=device-a`);
  const agentB = await connectSocket(`${WS_BASE}?role=agent&token=${AGENT_TOKEN}&deviceId=device-b`);
  sockets.push(agentA, agentB);

  await agentA.waitFor((message) => message.type === "auth.ok" && message.payload?.deviceId === "device-a", "agent-a auth");
  await agentB.waitFor((message) => message.type === "auth.ok" && message.payload?.deviceId === "device-b", "agent-b auth");

  const pairingA = await createPairingCode("device-a", agentAKeys.publicKey);
  const pairingB = await createPairingCode("device-b", agentBKeys.publicKey);
  const grantA = await redeemPairingCode(pairingA.pairingCode, clientAKeys.publicKey);
  const grantB = await redeemPairingCode(pairingB.pairingCode, clientBKeys.publicKey);

  const clientA = await connectSocket(`${WS_BASE}?role=client&token=${grantA.accessToken}`);
  const clientB = await connectSocket(`${WS_BASE}?role=client&token=${grantB.accessToken}`);
  sockets.push(clientA, clientB);

  await clientA.waitFor((message) => message.type === "auth.ok" && message.payload?.deviceId === "device-a", "client-a auth");
  await clientB.waitFor((message) => message.type === "auth.ok" && message.payload?.deviceId === "device-b", "client-b auth");
  const stateA = await clientA.waitFor((message) => message.type === "relay.state", "client-a relay state");
  const stateB = await clientB.waitFor((message) => message.type === "relay.state", "client-b relay state");
  if (stateA.payload.agents.length !== 1 || stateA.payload.agents[0]?.deviceId !== "device-a") {
    throw new Error("client-a 看到的 relay.state 设备范围不正确");
  }
  if (stateB.payload.agents.length !== 1 || stateB.payload.agents[0]?.deviceId !== "device-b") {
    throw new Error("client-b 看到的 relay.state 设备范围不正确");
  }

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

  await sendSecureAgentMessage(agentA, agentAKeys, clientAKeys.publicKey, grantA.accessToken, "device-a", {
    type: "session.created",
    deviceId: "device-a",
    payload: { session: sessionA },
  });
  await sendSecureAgentMessage(agentB, agentBKeys, clientBKeys.publicKey, grantB.accessToken, "device-b", {
    type: "session.created",
    deviceId: "device-b",
    payload: { session: sessionB },
  });

  const createdA = await waitForDecryptedAgentMessage(
    clientA,
    clientAKeys,
    grantA.agentPublicKey,
    grantA.accessToken,
    "device-a",
    "client-a own session",
    (message) => message.type === "session.created" && message.payload?.session?.sid === sessionA.sid,
  );
  const createdB = await waitForDecryptedAgentMessage(
    clientB,
    clientBKeys,
    grantB.agentPublicKey,
    grantB.accessToken,
    "device-b",
    "client-b own session",
    (message) => message.type === "session.created" && message.payload?.session?.sid === sessionB.sid,
  );
  if (createdA.payload.session.deviceId !== "device-a" || createdB.payload.session.deviceId !== "device-b") {
    throw new Error("解密后的会话创建消息设备归属不正确");
  }
  await expectNoMessage(clientA, (message) => message.type === "secure.agent" && message.deviceId === "device-b", 600, "client-a saw device-b envelope");
  await expectNoMessage(clientB, (message) => message.type === "secure.agent" && message.deviceId === "device-a", 600, "client-b saw device-a envelope");

  await sendSecureAgentMessage(agentA, agentAKeys, clientAKeys.publicKey, grantA.accessToken, "device-a", {
    type: "session.output",
    deviceId: "device-a",
    sid: sessionA.sid,
    seq: 2,
    payload: {
      data: "hello-from-a",
      mode: "replace",
    },
  });
  await sendSecureAgentMessage(agentB, agentBKeys, clientBKeys.publicKey, grantB.accessToken, "device-b", {
    type: "session.output",
    deviceId: "device-b",
    sid: sessionB.sid,
    seq: 2,
    payload: {
      data: "hello-from-b",
      mode: "replace",
    },
  });

  const outputA = await waitForDecryptedAgentMessage(
    clientA,
    clientAKeys,
    grantA.agentPublicKey,
    grantA.accessToken,
    "device-a",
    "client-a own output",
    (message) => message.type === "session.output" && message.payload?.data === "hello-from-a",
  );
  const outputB = await waitForDecryptedAgentMessage(
    clientB,
    clientBKeys,
    grantB.agentPublicKey,
    grantB.accessToken,
    "device-b",
    "client-b own output",
    (message) => message.type === "session.output" && message.payload?.data === "hello-from-b",
  );
  if (outputA.deviceId !== "device-a" || outputB.deviceId !== "device-b") {
    throw new Error("解密后的输出消息设备归属不正确");
  }
  await expectNoMessage(clientA, (message) => message.type === "secure.agent" && message.deviceId === "device-b", 600, "client-a saw device-b output envelope");
  await expectNoMessage(clientB, (message) => message.type === "secure.agent" && message.deviceId === "device-a", 600, "client-b saw device-a output envelope");

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
