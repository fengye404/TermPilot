import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
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

export function getAgentHome(): string {
  return process.env.TERMPILOT_HOME ?? path.join(homedir(), ".termpilot");
}

export function getStateFilePath(): string {
  return path.join(getAgentHome(), "state.json");
}

export function ensureAgentHome(): string {
  const dir = getAgentHome();
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function loadState(): AgentState {
  ensureAgentHome();
  const filePath = getStateFilePath();

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

export function saveState(state: AgentState): void {
  ensureAgentHome();
  const filePath = getStateFilePath();
  const tempFilePath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(tempFilePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  renameSync(tempFilePath, filePath);
}

export function upsertSession(session: SessionRecord): AgentState {
  const state = loadState();
  const sessions = state.sessions.filter((item) => item.sid !== session.sid);
  sessions.push(session);
  sessions.sort((left, right) => left.startedAt.localeCompare(right.startedAt));
  const nextState: AgentState = {
    version: 1,
    sessions,
  };
  saveState(nextState);
  return nextState;
}

export function updateSession(
  sid: string,
  updater: (session: SessionRecord) => SessionRecord,
): AgentState {
  const state = loadState();
  const sessions = state.sessions.map((session) => (session.sid === sid ? updater(session) : session));
  const nextState: AgentState = {
    version: 1,
    sessions,
  };
  saveState(nextState);
  return nextState;
}

export function removeStateFile(): void {
  rmSync(getStateFilePath(), { force: true });
}
