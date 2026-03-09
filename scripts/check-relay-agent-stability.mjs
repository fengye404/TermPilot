import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

import WebSocket from "ws";

const cwd = "/Users/fengye/workspace/TermPilot";
const relayUrl = "ws://127.0.0.1:8787/ws";
const healthUrl = "http://127.0.0.1:8787/health";
const deviceId = "pc-stability";
const sessionName = `stability-${Date.now()}`;

function startProcess(name, command, args, env = {}) {
  const child = spawn(command, args, {
    cwd,
    env: {
      ...process.env,
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`[${name}] ${chunk.toString("utf8")}`);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[${name}] ${chunk.toString("utf8")}`);
  });

  return child;
}

async function waitForHealth(expectedAgentsOnline) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        const payload = await response.json();
        if (payload.ok && payload.agentsOnline >= expectedAgentsOnline) {
          return payload;
        }
      }
    } catch {
      // retry
    }
    await delay(500);
  }
  throw new Error("等待 relay /health 超时");
}

async function runPnpm(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(stderr || stdout || `pnpm ${args.join(" ")} failed`));
    });
  });
}

function connectClient() {
  const socket = new WebSocket(`${relayUrl}?role=client&token=demo-client-token`);
  const queue = [];
  const waiters = [];

  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    queue.push(message);
    while (waiters.length > 0) {
      const waiter = waiters.shift();
      waiter();
    }
  });

  async function nextMessage(predicate, timeoutMs = 10_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const index = queue.findIndex(predicate);
      if (index >= 0) {
        return queue.splice(index, 1)[0];
      }
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          const idx = waiters.indexOf(onMessage);
          if (idx >= 0) {
            waiters.splice(idx, 1);
          }
          reject(new Error("等待 WebSocket 消息超时"));
        }, Math.min(500, Math.max(10, deadline - Date.now())));
        function onMessage() {
          clearTimeout(timeout);
          resolve();
        }
        waiters.push(onMessage);
      });
    }
    throw new Error("等待 WebSocket 消息超时");
  }

  async function open() {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("WebSocket 连接超时")), 10_000);
      socket.once("open", () => {
        clearTimeout(timeout);
        resolve();
      });
      socket.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
    await nextMessage((message) => message.type === "auth.ok");
  }

  return {
    socket,
    open,
    nextMessage,
    send(payload) {
      socket.send(JSON.stringify(payload));
    },
    close() {
      socket.close();
    },
  };
}

async function createManagedSession() {
  const output = await runPnpm(["agent:create", "--", "--deviceId", deviceId, "--name", sessionName]);
  const match = output.match(/已创建会话\s+([a-f0-9-]+)/i);
  if (!match) {
    throw new Error(`无法从创建输出中解析 sid: ${output}`);
  }
  return match[1];
}

async function killManagedSession(sid) {
  await runPnpm(["agent:kill", "--", "--sid", sid]);
}

async function waitForOutput(client, sid, text, timeoutMs = 15_000) {
  const message = await client.nextMessage(
    (payload) => payload.type === "session.output" && payload.sid === sid && typeof payload.payload?.data === "string" && payload.payload.data.includes(text),
    timeoutMs,
  );
  return message;
}

async function main() {
  let relay = null;
  let agent = null;
  let sid = null;

  try {
    relay = startProcess("relay", "pnpm", ["dev:relay"], {
      HOST: "127.0.0.1",
      PORT: "8787",
    });
    agent = startProcess("agent", "pnpm", ["dev:agent"], {
      TERMPILOT_DEVICE_ID: deviceId,
      TERMPILOT_RELAY_URL: relayUrl,
    });

    await waitForHealth(1);
    sid = await createManagedSession();

    const clientA = connectClient();
    await clientA.open();
    console.log("stability: client A connected");
    clientA.send({ type: "session.list", reqId: "list-a", deviceId });
    await clientA.nextMessage((message) => message.type === "session.list.result" && message.deviceId === deviceId);
    clientA.send({ type: "session.input", reqId: "input-a", deviceId, sid, payload: { text: "echo first-stability\n" } });
    await waitForOutput(clientA, sid, "first-stability");
    clientA.close();

    const clientB = connectClient();
    await clientB.open();
    console.log("stability: client B connected");
    clientB.send({ type: "session.input", reqId: "input-b", deviceId, sid, payload: { text: "echo while-disconnected\n" } });
    await delay(2000);
    clientB.close();

    const clientC = connectClient();
    await clientC.open();
    console.log("stability: client C connected");
    clientC.send({ type: "session.replay", reqId: "replay-c", deviceId, sid, payload: { afterSeq: -1 } });
    await waitForOutput(clientC, sid, "while-disconnected");
    clientC.close();

    relay.kill("SIGINT");
    await new Promise((resolve) => relay.once("close", resolve));
    relay = startProcess("relay", "pnpm", ["dev:relay"], {
      HOST: "127.0.0.1",
      PORT: "8787",
    });

    await waitForHealth(1);

    const clientD = connectClient();
    await clientD.open();
    console.log("stability: client D connected after relay restart");
    clientD.send({ type: "session.list", reqId: "list-d", deviceId });
    const listResult = await clientD.nextMessage((message) => message.type === "session.list.result" && message.deviceId === deviceId);
    if (!listResult.payload.sessions.some((session) => session.sid === sid)) {
      throw new Error("relay 重启后未恢复当前设备的会话列表");
    }
    clientD.send({ type: "session.input", reqId: "input-d", deviceId, sid, payload: { text: "echo after-relay-restart\n" } });
    const replayed = await waitForOutput(clientD, sid, "after-relay-restart");
    const buffer = replayed.payload.data;
    if (!buffer.includes("first-stability") || !buffer.includes("while-disconnected")) {
      throw new Error("relay 重启后输出缓冲与会话状态不一致");
    }
    clientD.close();

    console.log("relay/agent stability check ok");
  } finally {
    if (sid) {
      try {
        await killManagedSession(sid);
      } catch {
        // ignore cleanup failures
      }
    }
    agent?.kill("SIGINT");
    relay?.kill("SIGINT");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
