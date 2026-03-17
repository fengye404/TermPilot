import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

import packageJson from "../package.json" with { type: "json" };

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

function startRelay(env) {
  const child = spawn("node", ["dist/cli.js", "relay", "run"], {
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

async function waitForHealth(baseUrl, child, getLogs) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`relay 提前退出。\n${getLogs()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/health`, { cache: "no-store" });
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // retry
    }
    await delay(250);
  }
  throw new Error(`等待 relay /health 超时。\n${getLogs()}`);
}

async function main() {
  const relayHome = mkdtempSync(path.join(tmpdir(), "termpilot-app-versioning-"));
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const { child, getLogs } = startRelay({
    HOST: "127.0.0.1",
    PORT: String(port),
    TERMPILOT_HOME: relayHome,
  });

  try {
    const health = await waitForHealth(baseUrl, child, getLogs);
    if (health.appVersion !== packageJson.version) {
      throw new Error(`relay /health 返回的 appVersion 应为 ${packageJson.version}，实际是 ${health.appVersion}`);
    }
    if (typeof health.appBuild !== "string" || health.appBuild.trim().length === 0) {
      throw new Error("relay /health 没有返回有效的 appBuild");
    }

    const htmlResponse = await fetch(baseUrl, { cache: "no-store" });
    const html = await htmlResponse.text();
    if (!html.includes('name="termpilot-app-version"')) {
      throw new Error("首页 HTML 缺少 termpilot-app-version 元数据");
    }
    if (!html.includes('name="termpilot-app-build"')) {
      throw new Error("首页 HTML 缺少 termpilot-app-build 元数据");
    }

    console.log("app versioning checks ok");
  } finally {
    await stopChild(child);
    rmSync(relayHome, { recursive: true, force: true });
  }
}

await main();
