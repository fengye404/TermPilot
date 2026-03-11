import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export interface RelayRuntimeInfo {
  pid: number;
  host: string;
  port: number;
  startedAt: string;
}

function getRelayHome(): string {
  return process.env.TERMPILOT_HOME ?? path.join(homedir(), ".termpilot");
}

export function ensureRelayHome(): string {
  const dir = getRelayHome();
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function getRelayRuntimeFilePath(): string {
  return path.join(getRelayHome(), "relay-runtime.json");
}

export function getRelayLogFilePath(): string {
  return path.join(getRelayHome(), "relay.log");
}

export function loadRelayRuntime(): RelayRuntimeInfo | null {
  ensureRelayHome();
  try {
    const raw = readFileSync(getRelayRuntimeFilePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<RelayRuntimeInfo>;
    if (
      typeof parsed.pid !== "number" ||
      typeof parsed.host !== "string" ||
      typeof parsed.port !== "number" ||
      typeof parsed.startedAt !== "string"
    ) {
      return null;
    }
    return {
      pid: parsed.pid,
      host: parsed.host,
      port: parsed.port,
      startedAt: parsed.startedAt,
    };
  } catch {
    return null;
  }
}

export function saveRelayRuntime(runtime: RelayRuntimeInfo): void {
  ensureRelayHome();
  writeFileSync(getRelayRuntimeFilePath(), `${JSON.stringify(runtime, null, 2)}\n`, "utf8");
}

export function clearRelayRuntime(expectedPid?: number): void {
  const current = loadRelayRuntime();
  if (expectedPid !== undefined && current?.pid !== expectedPid) {
    return;
  }
  rmSync(getRelayRuntimeFilePath(), { force: true });
}
