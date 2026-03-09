export const DEFAULT_DEVICE_ID = "pc-main";
export const DEFAULT_AGENT_TOKEN = "demo-agent-token";
export const DEFAULT_CLIENT_TOKEN = "demo-client-token";

export type ConnectionRole = "agent" | "client";
export type SessionStatus = "running" | "exited";
export type SessionBackend = "tmux";
export type AuditActorRole = "agent" | "client" | "relay";
export type AuditAction =
  | "pairing.code_created"
  | "pairing.redeemed"
  | "grant.revoked"
  | "session.create_requested"
  | "session.kill_requested";
export type InputKey =
  | "enter"
  | "tab"
  | "ctrl_c"
  | "ctrl_d"
  | "escape"
  | "arrow_up"
  | "arrow_down"
  | "arrow_left"
  | "arrow_right";

export interface SessionRecord {
  sid: string;
  deviceId: string;
  name: string;
  backend: SessionBackend;
  shell: string;
  cwd: string;
  status: SessionStatus;
  startedAt: string;
  lastSeq: number;
  lastActivityAt: string;
  tmuxSessionName: string;
}

export interface RelayStateMessage {
  type: "relay.state";
  payload: {
    agents: Array<{
      deviceId: string;
      online: boolean;
    }>;
  };
}

export interface AuthOkMessage {
  type: "auth.ok";
  payload: {
    role: ConnectionRole;
    deviceId?: string;
  };
}

export interface PairingCodeRequest {
  deviceId: string;
}

export interface PairingCodeResponse {
  deviceId: string;
  pairingCode: string;
  expiresAt: string;
}

export interface PairingRedeemRequest {
  pairingCode: string;
}

export interface PairingRedeemResponse {
  deviceId: string;
  accessToken: string;
}

export interface ClientGrantRecord {
  accessToken: string;
  deviceId: string;
  createdAt: string;
  lastUsedAt: string;
}

export interface AuditEventRecord {
  id: string;
  deviceId: string;
  action: AuditAction;
  actorRole: AuditActorRole;
  detail: string;
  createdAt: string;
}

export interface ErrorMessage {
  type: "error";
  reqId?: string;
  deviceId?: string;
  code: string;
  message: string;
}

export interface SessionListMessage {
  type: "session.list";
  reqId: string;
  deviceId: string;
}

export interface SessionListResultMessage {
  type: "session.list.result";
  reqId?: string;
  deviceId: string;
  payload: {
    sessions: SessionRecord[];
  };
}

export interface SessionCreateMessage {
  type: "session.create";
  reqId: string;
  deviceId: string;
  payload: {
    name?: string;
    cwd?: string;
    shell?: string;
  };
}

export interface SessionCreatedMessage {
  type: "session.created";
  reqId?: string;
  deviceId: string;
  payload: {
    session: SessionRecord;
  };
}

export interface SessionInputMessage {
  type: "session.input";
  reqId?: string;
  deviceId: string;
  sid: string;
  payload: {
    text?: string;
    key?: InputKey;
  };
}

export interface SessionResizeMessage {
  type: "session.resize";
  reqId?: string;
  deviceId: string;
  sid: string;
  payload: {
    cols: number;
    rows: number;
  };
}

export interface SessionKillMessage {
  type: "session.kill";
  reqId?: string;
  deviceId: string;
  sid: string;
}

export interface SessionReplayMessage {
  type: "session.replay";
  reqId?: string;
  deviceId: string;
  sid: string;
  payload?: {
    afterSeq?: number;
  };
}

export interface SessionOutputMessage {
  type: "session.output";
  deviceId: string;
  sid: string;
  seq: number;
  payload: {
    data: string;
    mode: "replace";
  };
}

export interface SessionStateMessage {
  type: "session.state";
  reqId?: string;
  deviceId: string;
  sid: string;
  payload: {
    session: SessionRecord;
  };
}

export interface SessionExitMessage {
  type: "session.exit";
  reqId?: string;
  deviceId: string;
  sid: string;
  payload: {
    reason: string;
    exitCode?: number | null;
  };
}

export type ClientToRelayMessage =
  | SessionListMessage
  | SessionCreateMessage
  | SessionInputMessage
  | SessionResizeMessage
  | SessionKillMessage
  | SessionReplayMessage;

export type AgentToRelayMessage =
  | SessionListResultMessage
  | SessionCreatedMessage
  | SessionStateMessage
  | SessionOutputMessage
  | SessionExitMessage
  | ErrorMessage;

export type RelayToClientMessage =
  | AuthOkMessage
  | RelayStateMessage
  | SessionListResultMessage
  | SessionCreatedMessage
  | SessionStateMessage
  | SessionOutputMessage
  | SessionExitMessage
  | ErrorMessage;

export type RelayToAgentMessage =
  | AuthOkMessage
  | SessionListMessage
  | SessionCreateMessage
  | SessionInputMessage
  | SessionResizeMessage
  | SessionKillMessage;

export function createReqId(prefix = "req"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function parseJsonMessage<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
