import { setTimeout as delay } from "node:timers/promises";

import WebSocket from "ws";

import type {
  AgentToRelayMessage,
  ErrorMessage,
  RelayToAgentMessage,
  SessionCreateMessage,
  SessionExitMessage,
  SessionInputMessage,
  SessionListResultMessage,
  SessionOutputMessage,
  SessionRecord,
  SessionResizeMessage,
  SessionStateMessage,
} from "@termpilot/protocol";
import {
  DEFAULT_AGENT_TOKEN,
  DEFAULT_DEVICE_ID,
  parseJsonMessage,
} from "@termpilot/protocol";
import { loadState } from "./state-store";
import {
  bumpSessionSeq,
  captureSession,
  createSession,
  ensureTmuxAvailable,
  getSessionBySid,
  hasSession,
  killSession,
  listSessions,
  markSessionExited,
  resizeSession,
  sendInput,
} from "./tmux-backend";

const DEFAULT_RELAY_URL = "ws://127.0.0.1:8787/ws";

interface DaemonOptions {
  relayUrl: string;
  agentToken: string;
  deviceId: string;
  pollIntervalMs: number;
}

interface SessionRuntimeState {
  lastRenderedBuffer: string;
  lastStatus: SessionRecord["status"];
}

export class AgentDaemon {
  private readonly runtimeState = new Map<string, SessionRuntimeState>();

  private socket: WebSocket | null = null;

  private running = false;

  constructor(private readonly options: DaemonOptions) {}

  async start(): Promise<void> {
    await ensureTmuxAvailable();
    this.running = true;
    await Promise.all([this.connectLoop(), this.syncLoop()]);
  }

  async stop(): Promise<void> {
    this.running = false;
    this.socket?.close();
  }

  private async connectLoop(): Promise<void> {
    while (this.running) {
      const wsUrl = new URL(this.options.relayUrl);
      wsUrl.searchParams.set("role", "agent");
      wsUrl.searchParams.set("token", this.options.agentToken);
      wsUrl.searchParams.set("deviceId", this.options.deviceId);

      const socket = new WebSocket(wsUrl);
      this.socket = socket;

      socket.on("open", () => {
        this.sendSessionListResult({
          type: "session.list.result",
          reqId: "initial-sync",
          deviceId: this.options.deviceId,
          payload: {
            sessions: listSessions().filter((session) => session.deviceId === this.options.deviceId),
          },
        });
      });

      socket.on("message", (raw) => {
        const message = parseJsonMessage<RelayToAgentMessage>(raw.toString("utf8"));
        if (!message) {
          return;
        }
        void this.handleMessage(message);
      });

      const closePromise = new Promise<void>((resolve) => {
        socket.on("close", () => resolve());
        socket.on("error", () => resolve());
      });

      await closePromise;

      if (!this.running) {
        break;
      }

      await delay(1500);
    }
  }

  private async syncLoop(): Promise<void> {
    while (this.running) {
      const sessions = loadState().sessions.filter((session) => session.deviceId === this.options.deviceId);

      for (const session of sessions) {
        await this.syncSession(session);
      }

      await delay(this.options.pollIntervalMs);
    }
  }

  private async syncSession(session: SessionRecord): Promise<void> {
    const runtimeState = this.runtimeState.get(session.sid) ?? {
      lastRenderedBuffer: "",
      lastStatus: session.status,
    };

    if (session.status === "exited") {
      if (runtimeState.lastStatus !== "exited") {
        this.runtimeState.set(session.sid, {
          ...runtimeState,
          lastStatus: "exited",
        });
        this.sendMessage({
          type: "session.state",
          deviceId: this.options.deviceId,
          sid: session.sid,
          payload: {
            session,
          },
        });
      }
      return;
    }

    const exists = await hasSession(session.tmuxSessionName);
    if (!exists) {
      const exitedSession = markSessionExited(session.sid);
      if (exitedSession) {
        this.runtimeState.set(session.sid, {
          ...runtimeState,
          lastStatus: "exited",
        });
        this.sendMessage({
          type: "session.exit",
          deviceId: this.options.deviceId,
          sid: exitedSession.sid,
          payload: {
            reason: "tmux 会话不存在，已标记退出",
            exitCode: null,
          },
        });
        this.sendMessage({
          type: "session.state",
          deviceId: this.options.deviceId,
          sid: exitedSession.sid,
          payload: {
            session: exitedSession,
          },
        });
      }
      return;
    }

    const buffer = await captureSession(session);
    if (buffer === runtimeState.lastRenderedBuffer && runtimeState.lastStatus === session.status) {
      return;
    }

    const nextSession = bumpSessionSeq(session.sid);
    if (!nextSession) {
      return;
    }

    this.runtimeState.set(session.sid, {
      lastRenderedBuffer: buffer,
      lastStatus: nextSession.status,
    });

    const outputMessage: SessionOutputMessage = {
      type: "session.output",
      deviceId: this.options.deviceId,
      sid: session.sid,
      seq: nextSession.lastSeq,
      payload: {
        data: buffer,
        mode: "replace",
      },
    };

    const stateMessage: SessionStateMessage = {
      type: "session.state",
      deviceId: this.options.deviceId,
      sid: session.sid,
      payload: {
        session: nextSession,
      },
    };

    this.sendMessage(outputMessage);
    this.sendMessage(stateMessage);
  }

  private async handleMessage(message: RelayToAgentMessage): Promise<void> {
    switch (message.type) {
      case "auth.ok":
        return;
      case "error":
        this.handleError(message);
        return;
      case "session.list":
        this.sendSessionListResult({
          type: "session.list.result",
          reqId: message.reqId,
          deviceId: this.options.deviceId,
          payload: {
            sessions: listSessions().filter((session) => session.deviceId === this.options.deviceId),
          },
        });
        return;
      case "session.create":
        await this.handleCreate(message);
        return;
      case "session.input":
        await this.handleInput(message);
        return;
      case "session.resize":
        await this.handleResize(message);
        return;
      case "session.kill":
        await this.handleKill(message);
        return;
    }
  }

  private handleError(message: ErrorMessage): void {
    if (message.code === "AUTH_FAILED" || message.code === "AGENT_REPLACED") {
      this.running = false;
      this.socket?.close();
      console.error(`agent 已停止: ${message.message}`);
    }
  }

  private async handleCreate(message: SessionCreateMessage): Promise<void> {
    try {
      const session = await createSession({
        deviceId: this.options.deviceId,
        name: message.payload.name,
        cwd: message.payload.cwd,
        shell: message.payload.shell,
      });

      this.sendMessage({
        type: "session.created",
        reqId: message.reqId,
        deviceId: this.options.deviceId,
        payload: {
          session,
        },
      });
    } catch (error) {
      this.sendError(message.reqId, "SESSION_CREATE_FAILED", error);
    }
  }

  private async handleInput(message: SessionInputMessage): Promise<void> {
    try {
      const session = getSessionBySid(message.sid);
      if (!session) {
        this.sendError(message.reqId, "SESSION_NOT_FOUND", `会话 ${message.sid} 不存在`);
        return;
      }

      await sendInput(session, message.payload.text, message.payload.key);
    } catch (error) {
      this.sendError(message.reqId, "SESSION_INPUT_FAILED", error);
    }
  }

  private async handleResize(message: SessionResizeMessage): Promise<void> {
    try {
      const session = getSessionBySid(message.sid);
      if (!session) {
        this.sendError(message.reqId, "SESSION_NOT_FOUND", `会话 ${message.sid} 不存在`);
        return;
      }
      await resizeSession(session, message.payload.cols, message.payload.rows);
    } catch (error) {
      this.sendError(message.reqId, "SESSION_RESIZE_FAILED", error);
    }
  }

  private async handleKill(message: { reqId?: string; sid: string }): Promise<void> {
    try {
      const session = await killSession(message.sid);

      const exitMessage: SessionExitMessage = {
        type: "session.exit",
        reqId: message.reqId,
        deviceId: this.options.deviceId,
        sid: session.sid,
        payload: {
          reason: "用户主动关闭会话",
          exitCode: null,
        },
      };

      const stateMessage: SessionStateMessage = {
        type: "session.state",
        reqId: message.reqId,
        deviceId: this.options.deviceId,
        sid: session.sid,
        payload: {
          session,
        },
      };

      this.sendMessage(exitMessage);
      this.sendMessage(stateMessage);
    } catch (error) {
      this.sendError(message.reqId, "SESSION_KILL_FAILED", error);
    }
  }

  private sendSessionListResult(message: SessionListResultMessage): void {
    this.sendMessage(message);
  }

  private sendError(reqId: string | undefined, code: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const payload: ErrorMessage = {
      type: "error",
      reqId,
      deviceId: this.options.deviceId,
      code,
      message,
    };
    this.sendMessage(payload);
  }

  private sendMessage(message: AgentToRelayMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify(message));
  }
}

export function createDaemonFromEnv(): AgentDaemon {
  return new AgentDaemon({
    relayUrl: process.env.TERMPILOT_RELAY_URL ?? DEFAULT_RELAY_URL,
    agentToken: process.env.TERMPILOT_AGENT_TOKEN ?? DEFAULT_AGENT_TOKEN,
    deviceId: process.env.TERMPILOT_DEVICE_ID ?? DEFAULT_DEVICE_ID,
    pollIntervalMs: Number(process.env.TERMPILOT_POLL_INTERVAL_MS ?? 500),
  });
}
