import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { cwd as processCwd } from "node:process";

import type { InputKey, SessionRecord } from "@termpilot/protocol";
import { DEFAULT_DEVICE_ID } from "@termpilot/protocol";
import { getOrCreateGeneratedDeviceId, loadState, upsertSession, updateSession } from "./state-store";

export interface CreateSessionInput {
  deviceId?: string;
  name?: string;
  cwd?: string;
  shell?: string;
  command?: string[];
}

const TERM_PREFIX = "termpilot";

function now(): string {
  return new Date().toISOString();
}

function sanitizeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "session";
}

function buildTmuxSessionName(sid: string, name: string): string {
  return `${TERM_PREFIX}-${sanitizeName(name)}-${sid.slice(0, 8)}`;
}

function shellQuote(value: string): string {
  if (value.length === 0) {
    return "''";
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function runTmux(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("tmux", args, {
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
        resolve(stdout.trimEnd());
        return;
      }

      reject(new Error(stderr.trim() || `tmux exited with code ${code ?? "unknown"}`));
    });
  });
}

export async function ensureTmuxAvailable(): Promise<void> {
  await runTmux(["-V"]);
}

export async function createSession(input: CreateSessionInput = {}): Promise<SessionRecord> {
  const sid = randomUUID();
  const name = input.name?.trim() || `session-${sid.slice(0, 6)}`;
  const shell = input.shell?.trim() || process.env.SHELL || "/bin/zsh";
  const workingDirectory = input.cwd?.trim() || processCwd();
  const requestedDeviceId = input.deviceId?.trim() || process.env.TERMPILOT_DEVICE_ID?.trim();
  const deviceId = requestedDeviceId && requestedDeviceId !== DEFAULT_DEVICE_ID
    ? requestedDeviceId
    : getOrCreateGeneratedDeviceId();
  const startedAt = now();
  const tmuxSessionName = buildTmuxSessionName(sid, name);
  const tmuxArgs = ["new-session", "-d", "-s", tmuxSessionName, "-c", workingDirectory];
  if (input.command && input.command.length > 0) {
    const commandText = `exec ${input.command.map(shellQuote).join(" ")}`;
    tmuxArgs.push(shell, "-lc", commandText);
  } else {
    tmuxArgs.push(shell);
  }

  await runTmux(tmuxArgs);
  await runTmux(["set-window-option", "-t", tmuxSessionName, "window-size", "latest"]);
  await runTmux(["set-window-option", "-t", tmuxSessionName, "aggressive-resize", "off"]);

  const session: SessionRecord = {
    sid,
    deviceId,
    name,
    backend: "tmux",
    launchMode: input.command && input.command.length > 0 ? "command" : "shell",
    shell,
    cwd: workingDirectory,
    status: "running",
    startedAt,
    lastSeq: 0,
    lastActivityAt: startedAt,
    tmuxSessionName,
  };

  upsertSession(session);
  return session;
}

export function listSessions(): SessionRecord[] {
  return loadState().sessions;
}

export function getSessionBySid(sid: string): SessionRecord | undefined {
  return loadState().sessions.find((session) => session.sid === sid);
}

export async function hasSession(tmuxSessionName: string): Promise<boolean> {
  try {
    await runTmux(["has-session", "-t", tmuxSessionName]);
    return true;
  } catch {
    return false;
  }
}

export async function captureSession(session: SessionRecord): Promise<string> {
  return runTmux(["capture-pane", "-p", "-e", "-N", "-S", "-2000", "-t", session.tmuxSessionName]);
}

export async function normalizeSessionWindow(session: SessionRecord): Promise<void> {
  await runTmux(["set-window-option", "-t", session.tmuxSessionName, "window-size", "latest"]);
  await runTmux(["set-window-option", "-t", session.tmuxSessionName, "aggressive-resize", "off"]);
}

async function sendLiteralText(tmuxSessionName: string, text: string): Promise<void> {
  if (!text) {
    return;
  }

  await runTmux(["send-keys", "-t", tmuxSessionName, "-l", "--", text]);
}

export async function sendInput(session: SessionRecord, text?: string, key?: InputKey): Promise<void> {
  if (text) {
    const parts = text.split("\n");
    for (let index = 0; index < parts.length; index += 1) {
      await sendLiteralText(session.tmuxSessionName, parts[index] ?? "");
      if (index < parts.length - 1) {
        await runTmux(["send-keys", "-t", session.tmuxSessionName, "Enter"]);
      }
    }
  }

  if (!key) {
    return;
  }

  const keyMap: Record<InputKey, string> = {
    enter: "Enter",
    tab: "Tab",
    ctrl_c: "C-c",
    ctrl_d: "C-d",
    escape: "Escape",
    arrow_up: "Up",
    arrow_down: "Down",
    arrow_left: "Left",
    arrow_right: "Right",
  };

  await runTmux(["send-keys", "-t", session.tmuxSessionName, keyMap[key]]);
}

export async function resizeSession(session: SessionRecord, cols: number, rows: number): Promise<void> {
  void cols;
  void rows;
  await normalizeSessionWindow(session);
}

export async function killSession(sid: string): Promise<SessionRecord> {
  const session = getSessionBySid(sid);
  if (!session) {
    throw new Error(`会话 ${sid} 不存在`);
  }

  const exists = await hasSession(session.tmuxSessionName);
  if (exists) {
    await runTmux(["kill-session", "-t", session.tmuxSessionName]);
  }

  const nextState = updateSession(sid, (current) => ({
    ...current,
    status: "exited",
    lastActivityAt: now(),
  }));

  const nextSession = nextState.sessions.find((item) => item.sid === sid);
  if (!nextSession) {
    throw new Error(`会话 ${sid} 状态更新失败`);
  }
  return nextSession;
}

export function markSessionExited(sid: string): SessionRecord | undefined {
  const nextState = updateSession(sid, (current) => ({
    ...current,
    status: "exited",
    lastActivityAt: now(),
  }));

  return nextState.sessions.find((session) => session.sid === sid);
}

export function bumpSessionSeq(sid: string): SessionRecord | undefined {
  const nextState = updateSession(sid, (current) => ({
    ...current,
    lastSeq: current.lastSeq + 1,
    lastActivityAt: now(),
  }));

  return nextState.sessions.find((session) => session.sid === sid);
}

export function attachSession(session: SessionRecord): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn("tmux", ["attach-session", "-t", session.tmuxSessionName], {
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("close", (code) => resolve(code));
  });
}
