export const DEFAULT_DEVICE_ID = "pc-main";
export const DEFAULT_AGENT_TOKEN = "demo-agent-token";
export const DEFAULT_CLIENT_TOKEN = "demo-client-token";

export type ConnectionRole = "agent" | "client";
export type SessionStatus = "running" | "exited";
export type SessionBackend = "tmux";
export type SessionLaunchMode = "shell" | "command";
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
  launchMode?: SessionLaunchMode;
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
  agentPublicKey: string;
}

export interface PairingCodeResponse {
  deviceId: string;
  pairingCode: string;
  expiresAt: string;
}

export interface PairingRedeemRequest {
  pairingCode: string;
  clientPublicKey: string;
}

export interface PairingRedeemResponse {
  deviceId: string;
  accessToken: string;
  agentPublicKey: string;
}

export interface ClientGrantRecord {
  accessToken: string;
  deviceId: string;
  clientPublicKey?: string;
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

export interface SecureEnvelopePayload {
  iv: string;
  ciphertext: string;
}

export interface SecureClientEnvelopeMessage {
  type: "secure.client";
  reqId?: string;
  deviceId: string;
  accessToken?: string;
  payload: SecureEnvelopePayload;
}

export interface SecureAgentEnvelopeMessage {
  type: "secure.agent";
  reqId?: string;
  deviceId: string;
  accessToken: string;
  payload: SecureEnvelopePayload;
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

export type ClientBusinessMessage =
  | SessionListMessage
  | SessionCreateMessage
  | SessionInputMessage
  | SessionResizeMessage
  | SessionKillMessage
  | SessionReplayMessage;

export type AgentBusinessMessage =
  | SessionListResultMessage
  | SessionCreatedMessage
  | SessionOutputMessage
  | SessionStateMessage
  | SessionExitMessage
  | ErrorMessage;

export type ClientToRelayMessage =
  | SecureClientEnvelopeMessage;

export type AgentToRelayMessage =
  | SecureAgentEnvelopeMessage
  | ErrorMessage;

export type RelayToClientMessage =
  | AuthOkMessage
  | RelayStateMessage
  | SecureAgentEnvelopeMessage
  | ErrorMessage;

export type RelayToAgentMessage =
  | AuthOkMessage
  | SecureClientEnvelopeMessage
  | ErrorMessage;

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

function getSubtle(): SubtleCrypto {
  const maybeCrypto = globalThis.crypto;
  if (!maybeCrypto?.subtle) {
    throw new Error("当前运行环境不支持 Web Crypto。");
  }
  return maybeCrypto.subtle;
}

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(value, "base64"));
  }
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function textEncoder(): TextEncoder {
  return new TextEncoder();
}

function textDecoder(): TextDecoder {
  return new TextDecoder();
}

async function importPrivateKey(pkcs8Base64: string): Promise<CryptoKey> {
  return getSubtle().importKey(
    "pkcs8",
    toArrayBuffer(fromBase64(pkcs8Base64)),
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    false,
    ["deriveBits"],
  );
}

async function importPublicKey(spkiBase64: string): Promise<CryptoKey> {
  return getSubtle().importKey(
    "spki",
    toArrayBuffer(fromBase64(spkiBase64)),
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    false,
    [],
  );
}

async function deriveSharedKey(privateKeyPkcs8: string, publicKeySpki: string): Promise<CryptoKey> {
  const privateKey = await importPrivateKey(privateKeyPkcs8);
  const publicKey = await importPublicKey(publicKeySpki);
  const bits = await getSubtle().deriveBits(
    {
      name: "ECDH",
      public: publicKey,
    },
    privateKey,
    256,
  );
  return getSubtle().importKey(
    "raw",
    bits,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export interface E2EEKeyPair {
  publicKey: string;
  privateKey: string;
}

export async function generateE2EEKeyPair(): Promise<E2EEKeyPair> {
  const keyPair = await getSubtle().generateKey(
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    true,
    ["deriveBits"],
  );
  const publicKey = await getSubtle().exportKey("spki", keyPair.publicKey);
  const privateKey = await getSubtle().exportKey("pkcs8", keyPair.privateKey);
  return {
    publicKey: toBase64(new Uint8Array(publicKey)),
    privateKey: toBase64(new Uint8Array(privateKey)),
  };
}

export async function encryptForPeer(
  plaintext: string,
  privateKeyPkcs8: string,
  publicKeySpki: string,
): Promise<SecureEnvelopePayload> {
  const key = await deriveSharedKey(privateKeyPkcs8, publicKeySpki);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await getSubtle().encrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(iv),
    },
    key,
    toArrayBuffer(textEncoder().encode(plaintext)),
  );
  return {
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptFromPeer(
  payload: SecureEnvelopePayload,
  privateKeyPkcs8: string,
  publicKeySpki: string,
): Promise<string> {
  const key = await deriveSharedKey(privateKeyPkcs8, publicKeySpki);
  const plaintext = await getSubtle().decrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(fromBase64(payload.iv)),
    },
    key,
    toArrayBuffer(fromBase64(payload.ciphertext)),
  );
  return textDecoder().decode(plaintext);
}
