import { randomUUID } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import type { SessionRecord } from "@termpilot/protocol";

export interface AgentState {
  version: 1;
  sessions: SessionRecord[];
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
