import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { chromium, type Page } from "playwright";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const TEST_HOME = mkdtempSync(path.join(tmpdir(), "termpilot-ui-smoke-"));
const RELAY_PORT = await getFreePort();
const APP_URL = `http://127.0.0.1:${RELAY_PORT}`;
const RELAY_URL = `ws://127.0.0.1:${RELAY_PORT}/ws`;
const AGENT_TOKEN = "ui-smoke-agent-token";
const APP_STORAGE_KEY = "termpilot-app-state";
const SCREENSHOT_PATH = path.join(tmpdir(), "termpilot-ui-smoke.png");

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
        reject(new Error("unable to allocate a free port"));
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

function runCli(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["dist/cli.js", ...args], {
      cwd: ROOT,
      env: sharedEnv(),
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
      reject(new Error(`CLI failed: node dist/cli.js ${args.join(" ")}\n${stdout}\n${stderr}`));
    });
  });
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
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const output = await runCli(["agent", "--pair"]);
      const match = output.match(/配对码:\s*(\S+)/);
      if (match) {
        return match[1];
      }
      lastError = new Error(`unable to parse pairing code\n${output}`);
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }
  throw lastError instanceof Error ? lastError : new Error("timed out waiting for pairing code");
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
    await delay(500);
  }
  throw new Error("pairing did not persist a client token");
}

async function waitForStoredBinding(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const stored = await page.evaluate((storageKey) => {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        return false;
      }
      try {
        const parsed = JSON.parse(raw);
        const token = typeof parsed.clientToken === "string" ? parsed.clientToken.trim() : "";
        const publicKey = typeof parsed.clientKeyPair?.publicKey === "string" ? parsed.clientKeyPair.publicKey.trim() : "";
        const privateKey = typeof parsed.clientKeyPair?.privateKey === "string" ? parsed.clientKeyPair.privateKey.trim() : "";
        const agentPublicKey = typeof parsed.agentPublicKey === "string" ? parsed.agentPublicKey.trim() : "";
        return Boolean(token && publicKey && privateKey && agentPublicKey);
      } catch {
        return false;
      }
    }, APP_STORAGE_KEY);
    if (stored) {
      return;
    }
    await delay(500);
  }
  throw new Error("pairing did not persist the secure binding");
}

async function waitForClearedToken(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
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
    if (stored === "") {
      return;
    }
    await delay(250);
  }
  throw new Error("stored client token was not cleared");
}

async function waitForWorkspaceInViewport(page: Page, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const workspace = document.querySelector("[data-testid='terminal-workspace']");
      if (!(workspace instanceof HTMLElement)) {
        return { visible: false };
      }
      const rect = workspace.getBoundingClientRect();
      return {
        visible: rect.y < window.innerHeight,
      };
    });
    if (state.visible) {
      return;
    }
    await delay(100);
  }
  throw new Error("terminal workspace did not scroll into the viewport");
}

async function waitForTerminalText(page: Page, text: string, timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const content = await page.locator(".tp-ansi-snapshot").first().innerText().catch(() => "");
    if (content.includes(text)) {
      return;
    }
    await delay(200);
  }
  throw new Error(`terminal output did not include "${text}"`);
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

async function ensureSessionListVisible(page: Page): Promise<void> {
  const backButton = page.getByRole("button", { name: "返回会话列表" }).first();
  if (await backButton.isVisible().catch(() => false)) {
    await backButton.click();
  }
}

async function main(): Promise<void> {
  const sessionSuffix = `${Date.now()}`;
  const sessionOne = `ui-one-${sessionSuffix}`;
  const sessionTwo = `ui-two-${sessionSuffix}`;
  let sidOne = "";
  let sidTwo = "";
  let relay: ReturnType<typeof startRelay> | null = null;

  try {
    relay = startRelay();
    await waitForHealth(relay);

    const pairingCode = await waitForPairingCode();
    sidOne = await createSession(sessionOne);
    sidTwo = await createSession(sessionTwo);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => {
      errors.push(`pageerror: ${String(error)}`);
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(`console:error: ${message.text()}`);
      }
    });

    try {
      await gotoWithRetry(page, APP_URL);
      await page.getByPlaceholder("ABC-234").fill(pairingCode);
      await page.getByRole("button", { name: "配对" }).click();
      await waitForStoredToken(page);
      await waitForStoredBinding(page);
      await page.reload({ waitUntil: "networkidle" });
      await waitForStoredBinding(page);

      await ensureSessionListVisible(page);
      await waitForSessionCard(page, sessionOne);
      await page.locator(`[data-session-name="${sessionOne}"]:visible`).getByRole("button", { name: "查看" }).click();
      await page.getByText(sessionOne, { exact: false }).first().waitFor({ timeout: 15000 });
      await waitForWorkspaceInViewport(page);

      const workspace = page.getByTestId("terminal-workspace");
      const terminalText = `ui-smoke-${Date.now()}`;
      await workspace.getByPlaceholder("例如：claude code / git status / npm test").fill(`printf '${terminalText}'`);
      await workspace.getByRole("button", { name: "发送", exact: true }).click();
      await waitForTerminalText(page, terminalText);

      const keyboardText = `kb-smoke-${Date.now()}`;
      await workspace.getByPlaceholder("点这里唤起键盘，直接往当前光标输入").fill(`printf '${keyboardText}'`);
      await page.keyboard.press("Enter");
      await waitForTerminalText(page, keyboardText);

      await page.getByRole("button", { name: "返回会话列表" }).click();
      await waitForSessionCard(page, sessionTwo);
      await page.locator(`[data-session-name="${sessionTwo}"]:visible`).getByRole("button", { name: "查看" }).click();
      await page.getByText(sessionTwo, { exact: false }).first().waitFor({ timeout: 15000 });
      await page.getByRole("button", { name: "返回会话列表" }).click();

      await page.locator(`[data-session-name="${sessionOne}"]:visible`).getByRole("button", { name: "关闭" }).click();
      await page.getByText("已发送关闭会话请求。", { exact: false }).waitFor({ timeout: 10000 });

      await page.locator("summary", { hasText: "连接与设备设置" }).click();
      await page.getByRole("button", { name: "清除本机绑定" }).click();
      await page.getByText("已清除本机保存的访问令牌", { exact: false }).waitFor({ timeout: 10000 });
      await waitForClearedToken(page);

      await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });

      if (errors.length > 0) {
        throw new Error(errors.join("\n"));
      }
    } catch (error) {
      await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true }).catch(() => undefined);
      throw error;
    } finally {
      await browser.close();
    }

    console.log(`ui smoke ok (${SCREENSHOT_PATH})`);
  } finally {
    for (const sid of [sidOne, sidTwo]) {
      if (!sid) {
        continue;
      }
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
