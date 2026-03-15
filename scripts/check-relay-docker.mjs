import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const ROOT = "/Users/fengye/workspace/TermPilot";
const IMAGE = `termpilot-relay:test-${Date.now()}`;
const CONTAINER = `termpilot-relay-smoke-${Date.now()}`;
const PORT = 18910;

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

async function waitForHealth() {
  const url = `http://127.0.0.1:${PORT}/health`;
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
  await cleanup();
  await run("docker", ["build", "-f", "Dockerfile.relay", "-t", IMAGE, "."]);
  await run("docker", [
    "run",
    "-d",
    "--name",
    CONTAINER,
    "-p",
    `${PORT}:8787`,
    "-e",
    "TERMPILOT_AGENT_TOKEN=test-agent-token",
    IMAGE,
  ]);

  try {
    const health = await waitForHealth();
    if (health.storeMode !== "sqlite") {
      throw new Error(`Docker relay 应默认使用 sqlite，实际是 ${health.storeMode}`);
    }
    console.log("relay docker smoke ok");
  } finally {
    await cleanup();
  }
}

await main();
