import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import packageJson from "../package.json" with { type: "json" };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
    const payload = await waitForHealth(baseUrl, child, getLogs);
    const healthResponse = await fetch(`${baseUrl}/health`, { cache: "no-store" });
    if (payload.appVersion !== packageJson.version) {
      throw new Error(`relay /health 返回的 appVersion 应为 ${packageJson.version}，实际是 ${payload.appVersion}`);
    }
    if (payload.appBuild !== packageJson.version) {
      throw new Error(`relay /health 返回的 appBuild 应默认与 package 版本一致（${packageJson.version}），实际是 ${payload.appBuild}`);
    }
    if (healthResponse.headers.get("access-control-allow-origin") !== "*") {
      throw new Error("relay /health 没有返回跨域版本探测需要的 access-control-allow-origin: *");
    }
    if (healthResponse.headers.get("cache-control") !== "no-store, must-revalidate") {
      throw new Error(`relay /health cache-control 应为 no-store, must-revalidate，实际是 ${healthResponse.headers.get("cache-control")}`);
    }
    if (healthResponse.headers.get("x-termpilot-app-version") !== packageJson.version) {
      throw new Error("relay /health 没有返回正确的 x-termpilot-app-version");
    }
    if (healthResponse.headers.get("x-termpilot-app-build") !== payload.appBuild) {
      throw new Error("relay /health 没有返回正确的 x-termpilot-app-build");
    }
    if (typeof payload.appBuild !== "string" || payload.appBuild.trim().length === 0) {
      throw new Error("relay /health 没有返回有效的 appBuild");
    }

    const htmlResponse = await fetch(baseUrl, { cache: "no-store" });
    const html = await htmlResponse.text();
    if (htmlResponse.headers.get("cache-control") !== "no-store, must-revalidate") {
      throw new Error(`首页 HTML cache-control 应为 no-store, must-revalidate，实际是 ${htmlResponse.headers.get("cache-control")}`);
    }
    if (htmlResponse.headers.get("x-termpilot-app-build") !== payload.appBuild) {
      throw new Error("首页 HTML 没有返回正确的 x-termpilot-app-build");
    }
    if (!html.includes('name="termpilot-app-version"')) {
      throw new Error("首页 HTML 缺少 termpilot-app-version 元数据");
    }
    if (!html.includes('name="termpilot-app-build"')) {
      throw new Error("首页 HTML 缺少 termpilot-app-build 元数据");
    }
    const scriptMatch = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/);
    if (!scriptMatch) {
      throw new Error("首页 HTML 缺少模块入口脚本");
    }
    const assetResponse = await fetch(new URL(scriptMatch[1], `${baseUrl}/`), { cache: "no-store" });
    if (!assetResponse.ok) {
      throw new Error("模块入口脚本无法访问");
    }
    if (assetResponse.headers.get("cache-control") !== "public, max-age=31536000, immutable") {
      throw new Error(`模块入口脚本 cache-control 应为 immutable，实际是 ${assetResponse.headers.get("cache-control")}`);
    }
    if (assetResponse.headers.get("x-termpilot-app-build") !== payload.appBuild) {
      throw new Error("模块入口脚本没有返回正确的 x-termpilot-app-build");
    }

    const overridePort = await getFreePort();
    const overrideBaseUrl = `http://127.0.0.1:${overridePort}`;
    const overrideBuild = `${packageJson.version}-hotfix`;
    const overrideHome = mkdtempSync(path.join(tmpdir(), "termpilot-app-versioning-override-"));
    const overrideRelay = startRelay({
      HOST: "127.0.0.1",
      PORT: String(overridePort),
      TERMPILOT_HOME: overrideHome,
      TERMPILOT_APP_BUILD_ID: overrideBuild,
    });

    try {
      const overrideHealth = await waitForHealth(overrideBaseUrl, overrideRelay.child, overrideRelay.getLogs);
      if (overrideHealth.appBuild !== overrideBuild) {
        throw new Error(`relay /health 没有使用显式 TERMPILOT_APP_BUILD_ID，期望 ${overrideBuild}，实际是 ${overrideHealth.appBuild}`);
      }
    } finally {
      await stopChild(overrideRelay.child);
      rmSync(overrideHome, { recursive: true, force: true });
    }

    console.log("app versioning checks ok");
  } finally {
    await stopChild(child);
    rmSync(relayHome, { recursive: true, force: true });
  }
}

await main();
