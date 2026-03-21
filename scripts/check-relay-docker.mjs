import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import packageJson from "../package.json" with { type: "json" };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IMAGE = `termpilot-relay:test-${Date.now()}`;
const CONTAINER = `termpilot-relay-smoke-${Date.now()}`;

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

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
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
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} 失败 (exit ${code})\n${stdout}\n${stderr}`));
    });
  });
}

async function waitForHealth(port) {
  const url = `http://127.0.0.1:${port}/health`;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // retry
    }
    await delay(500);
  }
  throw new Error("等待 Docker relay /health 超时");
}

async function cleanup() {
  try {
    const { stdout } = await run("docker", ["ps", "-aq", "--filter", "name=termpilot-relay-smoke-"]);
    const ids = stdout.split("\n").map((line) => line.trim()).filter(Boolean);
    if (ids.length > 0) {
      await run("docker", ["rm", "-f", ...ids]);
    }
  } catch {
    // ignore
  }
  try {
    await run("docker", ["rm", "-f", CONTAINER]);
  } catch {
    // ignore
  }
  try {
    await run("docker", ["rmi", "-f", IMAGE]);
  } catch {
    // ignore
  }
}

async function main() {
  const port = await getFreePort();
  await cleanup();
  await run("docker", ["build", "-f", "Dockerfile.relay", "-t", IMAGE, "."]);
  await run("docker", [
    "run",
    "-d",
    "--name",
    CONTAINER,
    "-p",
    `${port}:8787`,
    "-e",
    "TERMPILOT_AGENT_TOKEN=test-agent-token",
    IMAGE,
  ]);

  try {
    const health = await waitForHealth(port);
    if (health.storeMode !== "sqlite") {
      throw new Error(`Docker relay 应默认使用 sqlite，实际是 ${health.storeMode}`);
    }
    if (health.appVersion !== packageJson.version) {
      throw new Error(`Docker relay 的 appVersion 应为 ${packageJson.version}，实际是 ${health.appVersion}`);
    }
    if (typeof health.appBuild !== "string" || health.appBuild.trim().length === 0) {
      throw new Error("Docker relay 未返回有效的 appBuild");
    }
    console.log("relay docker smoke ok");
  } finally {
    await cleanup();
  }
}

await main();
