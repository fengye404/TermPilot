import { setTimeout as delay } from "node:timers/promises";

import WebSocket from "ws";

import type {
  AgentBusinessMessage,
  AgentToRelayMessage,
  E2EEKeyPair,
  ErrorMessage,
  RelayToAgentMessage,
  SecureAgentEnvelopeMessage,
  SessionCreateMessage,
  SessionExitMessage,
  SessionInputMessage,
  SessionListResultMessage,
  SessionOutputMessage,
  SessionRecord,
  SessionReplayMessage,
  SessionResizeMessage,
} from "@termpilot/protocol";
import {
  DEFAULT_AGENT_TOKEN,
  DEFAULT_DEVICE_ID,
  createReqId,
  decryptFromPeer,
  encryptForPeer,
  parseJsonMessage,
} from "@termpilot/protocol";
import { listDeviceGrants } from "./relay-admin";
import { getOrCreateDeviceKeyPairAsync, loadState } from "./state-store";
import {
  bumpSessionSeq,
  captureSession,
  createSession,
  ensureTmuxAvailable,
  getAttachedClientCount,
  getSessionBySid,
  hasSession,
  killSession,
  listSessions,
  markSessionExited,
  normalizeSessionWindow,
  syncSessionRuntimeMetadata,
  resizeSession,
  sendInput,
} from "./tmux-backend";

const DEFAULT_RELAY_URL = "ws://127.0.0.1:8787/ws";
const OUTPUT_FRAME_LIMIT = 40;
const GRANT_REFRESH_INTERVAL_MS = 1_000;
const ORPHAN_WARNING_MS = 60 * 60 * 1000;
const ORPHAN_CLEANUP_MS = 12 * 60 * 60 * 1000;

interface DaemonOptions {
  relayUrl: string;
  agentToken: string;
  deviceId: string;
  pollIntervalMs: number;
  orphanWarningMs: number;
  orphanCleanupMs: number;
}

interface SessionRuntimeState {
  lastRenderedBuffer: string;
  lastStatus: SessionRecord["status"];
  layoutNormalized: boolean;
}

type EncryptedClientMessage = RelayToAgentMessage & { type: "secure.client"; accessToken?: string };

export class AgentDaemon {
  private readonly runtimeState = new Map<string, SessionRuntimeState>();

  private readonly outputBuffers = new Map<string, SessionOutputMessage[]>();

  private readonly grantPublicKeys = new Map<string, string>();

  private socket: WebSocket | null = null;

  private running = false;

  private deviceKeyPair: E2EEKeyPair | null = null;

  private lastGrantRefreshAt = 0;

  constructor(private readonly options: DaemonOptions) {}

  async start(): Promise<void> {
    await ensureTmuxAvailable();
    this.deviceKeyPair = await getOrCreateDeviceKeyPairAsync();
    await this.refreshGrantPublicKeys(true);
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
        void this.refreshGrantPublicKeys(true);
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
      await this.refreshGrantPublicKeys();
      const sessions = loadState().sessions.filter((session) => session.deviceId === this.options.deviceId);

      for (const session of sessions) {
        await this.syncSession(session);
      }

      await delay(this.options.pollIntervalMs);
    }
  }

  private async refreshGrantPublicKeys(force = false): Promise<void> {
    if (!force && Date.now() - this.lastGrantRefreshAt < GRANT_REFRESH_INTERVAL_MS) {
      return;
    }

    try {
      const payload = await listDeviceGrants(this.options.deviceId);
      this.grantPublicKeys.clear();
      for (const grant of payload.grants) {
        if (grant.clientPublicKey) {
          this.grantPublicKeys.set(grant.accessToken, grant.clientPublicKey);
        }
      }
      this.lastGrantRefreshAt = Date.now();
    } catch (error) {
      if (force) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`刷新访问令牌失败: ${message}`);
      }
    }
  }

  private async syncSession(session: SessionRecord): Promise<void> {
    const existingRuntimeState = this.runtimeState.get(session.sid);
    const runtimeState = existingRuntimeState ?? {
      lastRenderedBuffer: "",
      lastStatus: session.status,
      layoutNormalized: false,
    };

    if (session.status === "exited") {
      if (runtimeState.lastStatus !== "exited") {
        this.runtimeState.set(session.sid, {
          ...runtimeState,
          lastStatus: "exited",
        });
        await this.broadcastBusinessMessage({
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
        const exitMessage: SessionExitMessage = {
          type: "session.exit",
          deviceId: this.options.deviceId,
          sid: exitedSession.sid,
          payload: {
            reason: "tmux 会话不存在，已标记退出",
            exitCode: null,
          },
        };
        await this.broadcastBusinessMessage(exitMessage);
        await this.broadcastBusinessMessage({
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

    if (!runtimeState.layoutNormalized) {
      await normalizeSessionWindow(session);
      runtimeState.layoutNormalized = true;
      this.runtimeState.set(session.sid, runtimeState);
    }

    const attachedClientCount = await getAttachedClientCount(session);
    const previousAttachedClientCount = session.attachedClientCount ?? 0;
    const nowIso = new Date().toISOString();
    const detachedAt = attachedClientCount === 0
      ? (previousAttachedClientCount > 0 ? nowIso : (session.detachedAt ?? nowIso))
      : null;
    const lastOutputAt = session.lastOutputAt ?? session.startedAt;
    const idleSince = Math.max(
      Date.parse(lastOutputAt) || 0,
      detachedAt ? (Date.parse(detachedAt) || 0) : 0,
    );
    const isManagedDetached = session.launchMode === "command" && attachedClientCount === 0;
    const idleSinceIso = isManagedDetached && idleSince > 0 ? new Date(idleSince).toISOString() : null;
    const orphanWarningAt = idleSinceIso ? new Date(idleSince + this.options.orphanWarningMs).toISOString() : null;
    const autoCleanupAt = idleSinceIso ? new Date(idleSince + this.options.orphanCleanupMs).toISOString() : null;
    const suspectedOrphaned = isManagedDetached && Date.now() - idleSince >= this.options.orphanWarningMs;
    const shouldAutoCleanup = isManagedDetached && Date.now() - idleSince >= this.options.orphanCleanupMs;

    let nextSession = session;
    const metadataChanged = previousAttachedClientCount !== attachedClientCount
      || (session.detachedAt ?? null) !== detachedAt
      || (session.idleSince ?? null) !== idleSinceIso
      || (session.orphanWarningAt ?? null) !== orphanWarningAt
      || (session.autoCleanupAt ?? null) !== autoCleanupAt
      || Boolean(session.suspectedOrphaned) !== suspectedOrphaned;

    if (metadataChanged) {
      const updated = syncSessionRuntimeMetadata(session.sid, {
        attachedClientCount,
        detachedAt,
        idleSince: idleSinceIso,
        orphanWarningAt,
        autoCleanupAt,
        suspectedOrphaned,
      });
      if (updated) {
        nextSession = updated;
      }
    }

    if (shouldAutoCleanup) {
      const exitedSession = await killSession(session.sid);
      const exitMessage: SessionExitMessage = {
        type: "session.exit",
        deviceId: this.options.deviceId,
        sid: exitedSession.sid,
        payload: {
          reason: "无人附着且长时间无输出，已自动清理",
          exitCode: null,
        },
      };
      await this.broadcastBusinessMessage(exitMessage);
      await this.broadcastBusinessMessage({
        type: "session.state",
        deviceId: this.options.deviceId,
        sid: exitedSession.sid,
        payload: {
          session: exitedSession,
        },
      });
      this.runtimeState.set(session.sid, {
        ...runtimeState,
        lastStatus: "exited",
      });
      return;
    }

    const buffer = await captureSession(session);
    if (buffer === runtimeState.lastRenderedBuffer && runtimeState.lastStatus === nextSession.status && !metadataChanged) {
      if (!existingRuntimeState) {
        this.runtimeState.set(session.sid, runtimeState);
        await this.broadcastBusinessMessage({
          type: "session.state",
          deviceId: this.options.deviceId,
          sid: session.sid,
          payload: {
            session: nextSession,
          },
        });
      }
      return;
    }

    if (buffer !== runtimeState.lastRenderedBuffer || runtimeState.lastStatus !== nextSession.status) {
      const bumpedSession = bumpSessionSeq(session.sid);
      if (!bumpedSession) {
        return;
      }
      nextSession = bumpedSession;

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
      this.pushOutputFrame(outputMessage);
      await this.broadcastBusinessMessage(outputMessage);
    }

    this.runtimeState.set(session.sid, {
      lastRenderedBuffer: buffer,
      lastStatus: nextSession.status,
      layoutNormalized: runtimeState.layoutNormalized,
    });

    const stateMessage: AgentBusinessMessage = {
      type: "session.state",
      deviceId: this.options.deviceId,
      sid: nextSession.sid,
      payload: {
        session: nextSession,
      },
    };

    await this.broadcastBusinessMessage(stateMessage);
  }

  private pushOutputFrame(frame: SessionOutputMessage): void {
    const key = `${frame.deviceId}:${frame.sid}`;
    const nextFrames = [...(this.outputBuffers.get(key) ?? []), frame].slice(-OUTPUT_FRAME_LIMIT);
    this.outputBuffers.set(key, nextFrames);
  }

  private async handleMessage(message: RelayToAgentMessage): Promise<void> {
    switch (message.type) {
      case "auth.ok":
        await this.refreshGrantPublicKeys(true);
        return;
      case "error":
        this.handleError(message);
        return;
      case "secure.client":
        await this.handleSecureClientMessage(message);
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

  private async handleSecureClientMessage(message: EncryptedClientMessage): Promise<void> {
    const accessToken = message.accessToken?.trim();
    if (!accessToken || !this.deviceKeyPair) {
      return;
    }

    let clientPublicKey = this.grantPublicKeys.get(accessToken);
    if (!clientPublicKey) {
      await this.refreshGrantPublicKeys(true);
      clientPublicKey = this.grantPublicKeys.get(accessToken);
      if (!clientPublicKey) {
        return;
      }
    }

    let plaintext: string;
    try {
      plaintext = await decryptFromPeer(message.payload, this.deviceKeyPair.privateKey, clientPublicKey, {
        channel: "client",
        deviceId: message.deviceId,
        accessToken,
        reqId: message.reqId,
      });
    } catch {
      await this.sendEncryptedError(accessToken, message.reqId, "E2EE_DECRYPT_FAILED", "无法解密当前请求，请重新配对。");
      return;
    }

    const inner = parseJsonMessage<SessionCreateMessage | SessionInputMessage | SessionResizeMessage | SessionReplayMessage | { type: "session.kill"; reqId?: string; sid: string } | { type: "session.list"; reqId: string; deviceId: string }>(plaintext);
    if (!inner) {
      await this.sendEncryptedError(accessToken, message.reqId, "INVALID_MESSAGE", "请求格式无效。");
      return;
    }

    switch (inner.type) {
      case "session.list":
        await this.sendSessionListResult(accessToken, {
          type: "session.list.result",
          reqId: inner.reqId,
          deviceId: this.options.deviceId,
          payload: {
            sessions: listSessions().filter((session) => session.deviceId === this.options.deviceId),
          },
        });
        return;
      case "session.replay":
        await this.handleReplay(accessToken, inner);
        return;
      case "session.create":
        await this.handleCreate(accessToken, inner);
        return;
      case "session.input":
        await this.handleInput(accessToken, inner);
        return;
      case "session.resize":
        await this.handleResize(accessToken, inner);
        return;
      case "session.kill":
        await this.handleKill(accessToken, inner);
        return;
    }
  }

  private async handleReplay(accessToken: string, message: SessionReplayMessage): Promise<void> {
    const key = `${this.options.deviceId}:${message.sid}`;
    const afterSeq = message.payload?.afterSeq ?? -1;
    const frames = (this.outputBuffers.get(key) ?? []).filter((item) => item.seq > afterSeq);
    for (const frame of frames) {
      await this.sendBusinessMessageToClient(accessToken, frame);
    }
  }

  private async handleCreate(accessToken: string, message: SessionCreateMessage): Promise<void> {
    try {
      const session = await createSession({
        deviceId: this.options.deviceId,
        name: message.payload.name,
        cwd: message.payload.cwd,
        shell: message.payload.shell,
      });

      await this.sendBusinessMessageToClient(accessToken, {
        type: "session.created",
        reqId: message.reqId,
        deviceId: this.options.deviceId,
        payload: {
          session,
        },
      });
      await this.broadcastBusinessMessage({
        type: "session.state",
        deviceId: this.options.deviceId,
        sid: session.sid,
        payload: {
          session,
        },
      });
    } catch (error) {
      await this.sendEncryptedError(accessToken, message.reqId, "SESSION_CREATE_FAILED", error);
    }
  }

  private async handleInput(accessToken: string, message: SessionInputMessage): Promise<void> {
    try {
      const session = getSessionBySid(message.sid);
      if (!session) {
        await this.sendEncryptedError(accessToken, message.reqId, "SESSION_NOT_FOUND", `会话 ${message.sid} 不存在`);
        return;
      }

      await sendInput(session, message.payload.text, message.payload.key);
    } catch (error) {
      await this.sendEncryptedError(accessToken, message.reqId, "SESSION_INPUT_FAILED", error);
    }
  }

  private async handleResize(accessToken: string, message: SessionResizeMessage): Promise<void> {
    try {
      const session = getSessionBySid(message.sid);
      if (!session) {
        await this.sendEncryptedError(accessToken, message.reqId, "SESSION_NOT_FOUND", `会话 ${message.sid} 不存在`);
        return;
      }
      await resizeSession(session, message.payload.cols, message.payload.rows);
    } catch (error) {
      await this.sendEncryptedError(accessToken, message.reqId, "SESSION_RESIZE_FAILED", error);
    }
  }

  private async handleKill(accessToken: string, message: { reqId?: string; sid: string }): Promise<void> {
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

      const stateMessage: AgentBusinessMessage = {
        type: "session.state",
        reqId: message.reqId,
        deviceId: this.options.deviceId,
        sid: session.sid,
        payload: {
          session,
        },
      };

      await this.broadcastBusinessMessage(exitMessage);
      await this.broadcastBusinessMessage(stateMessage);
    } catch (error) {
      await this.sendEncryptedError(accessToken, message.reqId, "SESSION_KILL_FAILED", error);
    }
  }

  private async sendSessionListResult(accessToken: string, message: SessionListResultMessage): Promise<void> {
    await this.sendBusinessMessageToClient(accessToken, message);
  }

  private async sendEncryptedError(accessToken: string, reqId: string | undefined, code: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    const payload: ErrorMessage = {
      type: "error",
      reqId,
      deviceId: this.options.deviceId,
      code,
      message,
    };
    await this.sendBusinessMessageToClient(accessToken, payload);
  }

  private async sendBusinessMessageToClient(accessToken: string, message: AgentBusinessMessage): Promise<void> {
    if (!this.deviceKeyPair) {
      return;
    }

    let clientPublicKey = this.grantPublicKeys.get(accessToken);
    if (!clientPublicKey) {
      await this.refreshGrantPublicKeys(true);
      clientPublicKey = this.grantPublicKeys.get(accessToken);
      if (!clientPublicKey) {
        return;
      }
    }

    const payload = await encryptForPeer(
      JSON.stringify(message),
      this.deviceKeyPair.privateKey,
      clientPublicKey,
      {
        channel: "agent",
        deviceId: this.options.deviceId,
        accessToken,
        reqId: "reqId" in message ? message.reqId : undefined,
      },
    );
    const envelope: SecureAgentEnvelopeMessage = {
      type: "secure.agent",
      reqId: "reqId" in message ? message.reqId : undefined,
      deviceId: this.options.deviceId,
      accessToken,
      payload,
    };
    this.sendRelayMessage(envelope);
  }

  private async broadcastBusinessMessage(message: AgentBusinessMessage): Promise<void> {
    let accessTokens = Array.from(this.grantPublicKeys.keys());
    if (accessTokens.length === 0) {
      await this.refreshGrantPublicKeys(true);
      accessTokens = Array.from(this.grantPublicKeys.keys());
    } else {
      await this.refreshGrantPublicKeys();
      accessTokens = Array.from(this.grantPublicKeys.keys());
    }
    for (const accessToken of accessTokens) {
      await this.sendBusinessMessageToClient(accessToken, message);
    }
  }

  private sendRelayMessage(message: AgentToRelayMessage): void {
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
    orphanWarningMs: Number(process.env.TERMPILOT_ORPHAN_WARNING_MS ?? ORPHAN_WARNING_MS),
    orphanCleanupMs: Number(process.env.TERMPILOT_MANAGED_SESSION_AUTOCLEANUP_MS ?? ORPHAN_CLEANUP_MS),
  });
}
