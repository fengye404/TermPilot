import { spawn } from "node:child_process";
import { openSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

import { loadConfig } from "./config.js";
import { getRelayLogFilePath, getRelayRuntimeFilePath, loadRelayRuntime, saveRelayRuntime, clearRelayRuntime } from "./runtime-store.js";
import { resolveDefaultWebDir, startRelayServer } from "./server.js";

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readRuntimeStatus() {
  const runtime = loadRelayRuntime();
  if (!runtime) {
    return { runtime: null, alive: false };
  }
  const alive = isProcessAlive(runtime.pid);
  if (!alive) {
    clearRelayRuntime(runtime.pid);
    return { runtime: null, alive: false };
  }
  return { runtime, alive };
}

function printRuntime(runtime = readRuntimeStatus().runtime): void {
  if (!runtime) {
    console.log("后台 relay 当前未运行。");
    console.log(`运行时文件: ${getRelayRuntimeFilePath()}`);
    console.log(`日志: ${getRelayLogFilePath()}`);
    return;
  }

  console.log("后台 relay 正在运行。");
  console.log(`PID: ${runtime.pid}`);
  console.log(`监听: http://${runtime.host}:${runtime.port}`);
  console.log(`启动时间: ${runtime.startedAt}`);
  if (runtime.cliPath) {
    console.log(`入口: ${runtime.cliPath}`);
  }
  console.log(`日志: ${getRelayLogFilePath()}`);
}

async function runForeground(): Promise<void> {
  const config = loadConfig();
  saveRelayRuntime({
    pid: process.pid,
    host: config.host,
    port: config.port,
    startedAt: new Date().toISOString(),
    cliPath: process.argv[1],
  });
  process.on("exit", () => {
    clearRelayRuntime(process.pid);
  });
  await startRelayServer({ webDir: resolveDefaultWebDir(import.meta.url), config });
  await new Promise<void>(() => {});
}

async function runStart(): Promise<void> {
  const config = loadConfig();
  const existing = readRuntimeStatus();

  if (existing.runtime && existing.alive) {
    const sameConfig = existing.runtime.host === config.host && existing.runtime.port === config.port;
    const sameCliPath = existing.runtime.cliPath === process.argv[1];
    if (sameConfig && sameCliPath) {
      printRuntime(existing.runtime);
      return;
    }

    if (!sameCliPath) {
      console.log("检测到后台 relay 正在运行，但安装版本或入口已变化，正在重启到当前版本。");
    } else {
      console.log("检测到后台 relay 已在运行，但监听配置和当前命令不一致，正在重启。");
    }
    await runStop();
  }

  clearRelayRuntime();

  const logFilePath = getRelayLogFilePath();
  const logFd = openSync(logFilePath, "a");
  const child = spawn(process.execPath, [process.argv[1]!, "relay-daemon"], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: process.env,
  });

  child.unref();

  if (!child.pid) {
    throw new Error("后台 relay 启动失败，未获取到子进程 PID。");
  }

  saveRelayRuntime({
    pid: child.pid,
    host: config.host,
    port: config.port,
    startedAt: new Date().toISOString(),
    cliPath: process.argv[1],
  });

  console.log(`后台 relay 已启动，PID: ${child.pid}`);
  console.log(`监听: http://${config.host}:${config.port}`);
  console.log(`日志: ${logFilePath}`);

  await delay(300);
}

async function runStop(): Promise<void> {
  const { runtime, alive } = readRuntimeStatus();
  if (!runtime || !alive) {
    console.log("后台 relay 当前未运行。");
    clearRelayRuntime();
    return;
  }

  process.kill(runtime.pid, "SIGTERM");
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!isProcessAlive(runtime.pid)) {
      clearRelayRuntime(runtime.pid);
      console.log(`后台 relay 已停止，PID: ${runtime.pid}`);
      return;
    }
    await delay(100);
  }

  process.kill(runtime.pid, "SIGKILL");
  clearRelayRuntime(runtime.pid);
  console.log(`后台 relay 已强制停止，PID: ${runtime.pid}`);
}

export async function runRelayCli(argv = process.argv.slice(2)): Promise<void> {
  const [command] = argv;

  if (!command || command === "start") {
    await runStart();
    return;
  }

  switch (command) {
    case "run":
    case "daemon":
      await runForeground();
      return;
    case "stop":
      await runStop();
      return;
    default:
      throw new Error(`未知 relay 子命令: ${command}`);
  }
}
