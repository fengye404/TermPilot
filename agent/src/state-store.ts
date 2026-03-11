import { randomUUID } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, hostname } from "node:os";
import path from "node:path";

import { DEFAULT_DEVICE_ID } from "@termpilot/protocol";
import type { SessionRecord } from "@termpilot/protocol";

export interface AgentState {
  version: 1;
  sessions: SessionRecord[];
}

export interface AgentRuntimeInfo {
  pid: number;
  relayUrl: string;
  deviceId: string;
  startedAt: string;
}

export interface AgentConfig {
  relayUrl: string;
  deviceId: string;
}

const INITIAL_STATE: AgentState = {
  version: 1,
  sessions: [],
};
const LOCK_STALE_MS = 10_000;
const LOCK_TIMEOUT_MS = 5_000;
const LOCK_POLL_MS = 20;

function sleepMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function getAgentHome(): string {
  return process.env.TERMPILOT_HOME ?? path.join(homedir(), ".termpilot");
}

export function getStateFilePath(): string {
  return path.join(getAgentHome(), "state.json");
}

export function getAgentRuntimeFilePath(): string {
  return path.join(getAgentHome(), "agent-runtime.json");
}

export function getAgentLogFilePath(): string {
  return path.join(getAgentHome(), "agent.log");
}

export function getAgentConfigFilePath(): string {
  return path.join(getAgentHome(), "config.json");
}

export function getGeneratedDeviceIdFilePath(): string {
  return path.join(getAgentHome(), "device-id");
}

function getStateLockPath(): string {
  return `${getStateFilePath()}.lock`;
}

export function ensureAgentHome(): string {
  const dir = getAgentHome();
  mkdirSync(dir, { recursive: true });
  return dir;
}

function loadStateFromDisk(filePath: string): AgentState {
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as AgentState;
    if (!Array.isArray(parsed.sessions)) {
      return { ...INITIAL_STATE };
    }
    return parsed;
  } catch {
    return { ...INITIAL_STATE };
  }
}

export function loadState(): AgentState {
  ensureAgentHome();
  return loadStateFromDisk(getStateFilePath());
}

function saveStateToDisk(filePath: string, state: AgentState): void {
  const tempFilePath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(tempFilePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  renameSync(tempFilePath, filePath);
}

function withStateLock<T>(action: (filePath: string) => T): T {
  ensureAgentHome();
  const filePath = getStateFilePath();
  const lockPath = getStateLockPath();
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  while (true) {
    try {
      const lockFd = openSync(lockPath, "wx");
      closeSync(lockFd);
      break;
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      if (code !== "EEXIST") {
        throw error;
      }
      try {
        const stat = statSync(lockPath);
        if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
          rmSync(lockPath, { force: true });
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error("等待状态文件锁超时，请稍后重试。");
      }
      sleepMs(LOCK_POLL_MS);
    }
  }

  try {
    return action(filePath);
  } finally {
    rmSync(lockPath, { force: true });
  }
}

export function saveState(state: AgentState): void {
  withStateLock((filePath) => {
    saveStateToDisk(filePath, state);
  });
}

function sanitizeDeviceLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function generateDeviceId(): string {
  const base = sanitizeDeviceLabel(hostname().split(".")[0] ?? "") || "pc";
  return `${base}-${randomUUID().slice(0, 8)}`;
}

export function getOrCreateGeneratedDeviceId(): string {
  ensureAgentHome();
  const filePath = getGeneratedDeviceIdFilePath();

  try {
    const existing = readFileSync(filePath, "utf8").trim();
    if (existing && existing !== DEFAULT_DEVICE_ID) {
      return existing;
    }
  } catch {
    // ignore missing file and generate one below
  }

  const deviceId = generateDeviceId();
  writeFileSync(filePath, `${deviceId}\n`, "utf8");
  return deviceId;
}

export function rewriteSessionsDeviceId(previousDeviceId: string, nextDeviceId: string): AgentState {
  return withStateLock((filePath) => {
    const state = loadStateFromDisk(filePath);
    const nextState: AgentState = {
      version: 1,
      sessions: state.sessions.map((session) =>
        session.deviceId === previousDeviceId
          ? {
              ...session,
              deviceId: nextDeviceId,
            }
          : session),
    };
    saveStateToDisk(filePath, nextState);
    return nextState;
  });
}

export function upsertSession(session: SessionRecord): AgentState {
  return withStateLock((filePath) => {
    const state = loadStateFromDisk(filePath);
    const sessions = state.sessions.filter((item) => item.sid !== session.sid);
    sessions.push(session);
    sessions.sort((left, right) => left.startedAt.localeCompare(right.startedAt));
    const nextState: AgentState = {
      version: 1,
      sessions,
    };
    saveStateToDisk(filePath, nextState);
    return nextState;
  });
}

export function updateSession(
  sid: string,
  updater: (session: SessionRecord) => SessionRecord,
): AgentState {
  return withStateLock((filePath) => {
    const state = loadStateFromDisk(filePath);
    const sessions = state.sessions.map((session) => (session.sid === sid ? updater(session) : session));
    const nextState: AgentState = {
      version: 1,
      sessions,
    };
    saveStateToDisk(filePath, nextState);
    return nextState;
  });
}

export function removeStateFile(): void {
  rmSync(getStateFilePath(), { force: true });
  rmSync(getStateLockPath(), { force: true });
}

export function loadAgentRuntime(): AgentRuntimeInfo | null {
  ensureAgentHome();
  try {
    const raw = readFileSync(getAgentRuntimeFilePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<AgentRuntimeInfo>;
    if (
      typeof parsed.pid !== "number" ||
      typeof parsed.relayUrl !== "string" ||
      typeof parsed.deviceId !== "string" ||
      typeof parsed.startedAt !== "string"
    ) {
      return null;
    }
    return {
      pid: parsed.pid,
      relayUrl: parsed.relayUrl,
      deviceId: parsed.deviceId,
      startedAt: parsed.startedAt,
    };
  } catch {
    return null;
  }
}

export function saveAgentRuntime(runtime: AgentRuntimeInfo): void {
  ensureAgentHome();
  writeFileSync(getAgentRuntimeFilePath(), `${JSON.stringify(runtime, null, 2)}\n`, "utf8");
}

export function clearAgentRuntime(expectedPid?: number): void {
  const current = loadAgentRuntime();
  if (expectedPid !== undefined && current?.pid !== expectedPid) {
    return;
  }
  rmSync(getAgentRuntimeFilePath(), { force: true });
}

export function loadAgentConfig(): AgentConfig | null {
  ensureAgentHome();
  try {
    const raw = readFileSync(getAgentConfigFilePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<AgentConfig>;
    if (typeof parsed.relayUrl !== "string" || typeof parsed.deviceId !== "string") {
      return null;
    }
    const relayUrl = parsed.relayUrl.trim();
    const deviceId = parsed.deviceId.trim();
    if (!relayUrl || !deviceId) {
      return null;
    }
    return { relayUrl, deviceId };
  } catch {
    return null;
  }
}

export function saveAgentConfig(config: AgentConfig): void {
  ensureAgentHome();
  writeFileSync(getAgentConfigFilePath(), `${JSON.stringify(config, null, 2)}\n`, "utf8");
}
