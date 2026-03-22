import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { chromium, type Page } from "playwright";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const TEST_HOME = mkdtempSync(path.join(tmpdir(), "termpilot-resize-check-"));
const RELAY_PORT = await getFreePort();
const APP_URL = `http://127.0.0.1:${RELAY_PORT}`;
const RELAY_URL = `ws://127.0.0.1:${RELAY_PORT}/ws`;
const AGENT_TOKEN = "resize-check-agent-token";
const APP_STORAGE_KEY = "termpilot-app-state";
const SCREENSHOT_PATH = path.join(tmpdir(), "termpilot-terminal-resize-check.png");

function sharedEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: String(RELAY_PORT),
    TERMPILOT_HOME: TEST_HOME,
    TERMPILOT_RELAY_URL: RELAY_URL,
    TERMPILOT_AGENT_TOKEN: AGENT_TOKEN,
  };
}

async function getFreePort(): Promise<number> {
  const { createServer } = await import("node:net");
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("unable to allocate free port"));
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

function runCommand(command: string, args: string[], env = sharedEnv()): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env,
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
      reject(new Error(`command failed: ${command} ${args.join(" ")}\n${stdout}\n${stderr}`));
    });
  });
}

function runCli(args: string[]): Promise<string> {
  return runCommand("node", ["dist/cli.js", ...args]);
}

function startRelay() {
  const child = spawn("node", ["dist/cli.js", "relay", "run"], {
    cwd: ROOT,
    env: sharedEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });

  let logs = "";
  child.stdout.on("data", (chunk) => {
    logs += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk.toString("utf8");
  });

  return {
    child,
    getLogs() {
      return logs;
    },
  };
}

async function waitForHealth(relay: ReturnType<typeof startRelay>): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (relay.child.exitCode !== null) {
      throw new Error(`relay exited before /health was ready\n${relay.getLogs()}`);
    }
    try {
      const response = await fetch(`${APP_URL}/health`, { cache: "no-store" });
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }
    await delay(250);
  }
  throw new Error(`timed out waiting for relay /health\n${relay.getLogs()}`);
}

async function stopChild(child: ReturnType<typeof startRelay>["child"] | null): Promise<void> {
  if (!child || child.exitCode !== null) {
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

async function waitForPairingCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const output = await runCli(["agent", "--pair"]).catch(() => "");
    const match = output.match(/配对码:\s*(\S+)/);
    if (match) {
      return match[1];
    }
    await delay(500);
  }
  throw new Error("timed out waiting for pairing code");
}

async function createSession(name: string): Promise<string> {
  const output = await runCli(["create", "--name", name]);
  const match = output.match(/已创建会话\s+([a-f0-9-]+)/i);
  if (!match) {
    throw new Error(`unable to parse session sid\n${output}`);
  }
  return match[1];
}

async function killSession(sid: string): Promise<void> {
  await runCli(["kill", "--sid", sid]);
}

async function gotoWithRetry(page: Page, url: string, attempts = 6): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "networkidle" });
      return;
    } catch (error) {
      lastError = error;
      await delay(1000);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("page navigation failed");
}

async function waitForStoredToken(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const stored = await page.evaluate((storageKey) => {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        return "";
      }
      try {
        const parsed = JSON.parse(raw);
        return typeof parsed.clientToken === "string" ? parsed.clientToken : "";
      } catch {
        return "";
      }
    }, APP_STORAGE_KEY);
    if (stored !== "") {
      return;
    }
    await delay(250);
  }
  throw new Error("pairing did not persist client token");
}

async function waitForSessionCard(page: Page, name: string, timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const locator = page.locator(`[data-session-name="${name}"]:visible`).first();
    if (await locator.isVisible().catch(() => false)) {
      return;
    }
    await delay(200);
  }
  throw new Error(`session card did not appear for ${name}`);
}

function getTmuxSessionName(sid: string): string {
  const raw = readFileSync(path.join(TEST_HOME, "state.json"), "utf8");
  const parsed = JSON.parse(raw) as {
    sessions?: Array<{ sid?: string; tmuxSessionName?: string }>;
  };
  const match = parsed.sessions?.find((session) => session.sid === sid);
  if (!match?.tmuxSessionName) {
    throw new Error(`unable to find tmux session name for sid ${sid}`);
  }
  return match.tmuxSessionName;
}

async function readTmuxSize(tmuxSessionName: string): Promise<{ cols: number; rows: number }> {
  const output = await runCommand("tmux", [
    "display-message",
    "-p",
    "-t",
    tmuxSessionName,
    "#{window_width}x#{window_height}",
  ], process.env);
  const match = output.trim().match(/^(\d+)x(\d+)$/);
  if (!match) {
    throw new Error(`unable to parse tmux size\n${output}`);
  }
  return {
    cols: Number.parseInt(match[1]!, 10),
    rows: Number.parseInt(match[2]!, 10),
  };
}

async function waitForTmuxResize(tmuxSessionName: string, minCols: number, timeoutMs = 10000): Promise<{ cols: number; rows: number }> {
  const deadline = Date.now() + timeoutMs;
  let last = { cols: 0, rows: 0 };
  while (Date.now() < deadline) {
    last = await readTmuxSize(tmuxSessionName);
    if (last.cols >= minCols) {
      return last;
    }
    await delay(200);
  }
  throw new Error(`tmux window stayed too narrow: ${last.cols}x${last.rows} (expected cols >= ${minCols})`);
}

async function main(): Promise<void> {
  const sessionName = `resize-check-${Date.now()}`;
  let sid = "";
  let relay: ReturnType<typeof startRelay> | null = null;

  try {
    relay = startRelay();
    await waitForHealth(relay);

    const pairingCode = await waitForPairingCode();
    sid = await createSession(sessionName);
    const tmuxSessionName = getTmuxSessionName(sid);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 1600, height: 1100 },
    });

    try {
      await gotoWithRetry(page, APP_URL);
      await page.getByPlaceholder("ABC-234").fill(pairingCode);
      await page.getByRole("button", { name: "配对" }).click();
      await waitForStoredToken(page);

      await waitForSessionCard(page, sessionName);
      await page.locator(`[data-session-name="${sessionName}"]:visible`).getByRole("button", { name: "查看" }).click();
      await page.getByText(sessionName, { exact: false }).first().waitFor({ timeout: 15000 });
      await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
    } finally {
      await browser.close();
    }

    const size = await waitForTmuxResize(tmuxSessionName, 100);
    console.log(`terminal resize ok: ${size.cols}x${size.rows} (${SCREENSHOT_PATH})`);
  } finally {
    if (sid) {
      await killSession(sid).catch(() => undefined);
    }
    await runCli(["agent", "stop"]).catch(() => undefined);
    await stopChild(relay?.child ?? null);
    rmSync(TEST_HOME, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
