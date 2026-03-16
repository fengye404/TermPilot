import { existsSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const ROOT = "/Users/fengye/workspace/TermPilot";

async function getFreePort() {
  const { createServer } = await import("node:net");
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("无法获取空闲端口"));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
    server.on("error", reject);
  });
}

function startRelay(command, args, env) {
  const child = spawn(command, args, {
    cwd: ROOT,
    env: {
      ...process.env,
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let logs = "";
  child.stdout.on("data", (chunk) => {
    logs += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk.toString("utf8");
  });

  return { child, getLogs: () => logs };
}

async function waitForHealth(port, label, child, getLogs) {
  const url = `http://127.0.0.1:${port}/health`;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`${label} 提前退出。\n${getLogs()}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // retry
    }
    await delay(250);
  }
  throw new Error(`等待 ${label} /health 超时。\n${getLogs()}`);
}

async function stopChild(child) {
  if (child.exitCode !== null) {
    return;
  }
  child.kill("SIGTERM");
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (child.exitCode !== null) {
      return;
    }
    await delay(100);
  }
  child.kill("SIGKILL");
}

async function assertDefaultSqliteMode() {
  const relayHome = mkdtempSync(path.join(tmpdir(), "termpilot-relay-sqlite-"));
  const port = await getFreePort();
  const { child, getLogs } = startRelay("node", ["dist/cli.js", "relay", "run"], {
    HOST: "127.0.0.1",
    PORT: String(port),
    TERMPILOT_HOME: relayHome,
  });

  try {
    const health = await waitForHealth(port, "default sqlite relay", child, getLogs);
    if (health.storeMode !== "sqlite") {
      throw new Error(`默认 relay 存储模式应为 sqlite，实际是 ${health.storeMode}`);
    }
    if (!existsSync(path.join(relayHome, "relay.db"))) {
      throw new Error("默认 SQLite relay 未生成 relay.db");
    }
  } finally {
    await stopChild(child);
    rmSync(relayHome, { recursive: true, force: true });
  }
}

async function assertMemoryOverride() {
  const relayHome = mkdtempSync(path.join(tmpdir(), "termpilot-relay-memory-"));
  const port = await getFreePort();
  const { child, getLogs } = startRelay("node", ["dist/cli.js", "relay", "run"], {
    HOST: "127.0.0.1",
    PORT: String(port),
    TERMPILOT_HOME: relayHome,
    TERMPILOT_RELAY_STORE: "memory",
  });

  try {
    const health = await waitForHealth(port, "memory relay", child, getLogs);
    if (health.storeMode !== "memory") {
      throw new Error(`显式 memory relay 存储模式应为 memory，实际是 ${health.storeMode}`);
    }
    if (existsSync(path.join(relayHome, "relay.db"))) {
      throw new Error("memory relay 不应生成 relay.db");
    }
  } finally {
    await stopChild(child);
    rmSync(relayHome, { recursive: true, force: true });
  }
}

async function main() {
  await assertDefaultSqliteMode();
  await assertMemoryOverride();
  console.log("relay storage checks ok");
}

await main();
