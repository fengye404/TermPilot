import { gcm } from "@noble/ciphers/aes.js";
import { p256 } from "@noble/curves/nist.js";
import { sha256 } from "@noble/hashes/sha2.js";

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
  lastOutputAt?: string;
  attachedClientCount?: number;
  detachedAt?: string | null;
  idleSince?: string | null;
  orphanWarningAt?: string | null;
  autoCleanupAt?: string | null;
  suspectedOrphaned?: boolean;
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

export interface SecureEnvelopeContext {
  channel: "client" | "agent";
  deviceId: string;
  accessToken?: string;
  reqId?: string;
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

const RAW_P256_PUBLIC_PREFIX = "tp-p256-public:";
const RAW_P256_PRIVATE_PREFIX = "tp-p256-private:";
const P256_SPKI_PREFIX = Uint8Array.from([
  0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
  0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00,
]);

function hasWebCryptoSubtle(): boolean {
  return Boolean(globalThis.crypto?.subtle);
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

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function buildEnvelopeAad(context?: SecureEnvelopeContext): ArrayBuffer | undefined {
  if (!context) {
    return undefined;
  }
  return toArrayBuffer(textEncoder().encode(JSON.stringify({
    channel: context.channel,
    deviceId: context.deviceId,
    accessToken: context.accessToken ?? "",
    reqId: context.reqId ?? "",
  })));
}

function buildEnvelopeAadBytes(context?: SecureEnvelopeContext): Uint8Array | undefined {
  const aad = buildEnvelopeAad(context);
  return aad ? new Uint8Array(aad) : undefined;
}

function decodeRawKey(value: string, prefix: string): Uint8Array | null {
  if (!value.startsWith(prefix)) {
    return null;
  }
  return fromBase64(value.slice(prefix.length));
}

function spkiToRawPublic(spkiBase64: string): Uint8Array {
  const bytes = fromBase64(spkiBase64);
  if (bytes.length === 33 || bytes.length === 65) {
    return bytes;
  }
  if (bytes.length >= P256_SPKI_PREFIX.length + 33 && bytesEqual(bytes.slice(0, P256_SPKI_PREFIX.length), P256_SPKI_PREFIX)) {
    return bytes.slice(P256_SPKI_PREFIX.length);
  }
  throw new Error("无法解析对端公钥。");
}

function pkcs8ToRawPrivate(pkcs8Base64: string): Uint8Array {
  const bytes = fromBase64(pkcs8Base64);
  if (bytes.length === 32) {
    return bytes;
  }
  for (let index = 0; index <= bytes.length - 34; index += 1) {
    if (bytes[index] === 0x04 && bytes[index + 1] === 0x20) {
      return bytes.slice(index + 2, index + 34);
    }
  }
  throw new Error("无法解析本地私钥。");
}

function normalizePublicKeyToRaw(publicKeySpki: string): Uint8Array {
  return decodeRawKey(publicKeySpki, RAW_P256_PUBLIC_PREFIX) ?? spkiToRawPublic(publicKeySpki);
}

function normalizePrivateKeyToRaw(privateKeyPkcs8: string): Uint8Array {
  return decodeRawKey(privateKeyPkcs8, RAW_P256_PRIVATE_PREFIX) ?? pkcs8ToRawPrivate(privateKeyPkcs8);
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

function shouldUsePureJsCrypto(privateKeyPkcs8: string, publicKeySpki: string): boolean {
  return !hasWebCryptoSubtle()
    || privateKeyPkcs8.startsWith(RAW_P256_PRIVATE_PREFIX)
    || publicKeySpki.startsWith(RAW_P256_PUBLIC_PREFIX);
}

function deriveSharedKeyBytesPureJs(privateKeyPkcs8: string, publicKeySpki: string): Uint8Array {
  const privateKey = normalizePrivateKeyToRaw(privateKeyPkcs8);
  const publicKey = normalizePublicKeyToRaw(publicKeySpki);
  return p256.getSharedSecret(privateKey, publicKey).slice(1);
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
  if (hasWebCryptoSubtle()) {
    try {
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
    } catch {
      // Fall through to the pure-JS implementation when subtle exists but ECDH is unavailable.
    }
  }
  const { secretKey, publicKey } = p256.keygen();
  return {
    publicKey: `${RAW_P256_PUBLIC_PREFIX}${toBase64(publicKey)}`,
    privateKey: `${RAW_P256_PRIVATE_PREFIX}${toBase64(secretKey)}`,
  };
}

export async function encryptForPeer(
  plaintext: string,
  privateKeyPkcs8: string,
  publicKeySpki: string,
  context?: SecureEnvelopeContext,
): Promise<SecureEnvelopePayload> {
  if (shouldUsePureJsCrypto(privateKeyPkcs8, publicKeySpki)) {
    const key = deriveSharedKeyBytesPureJs(privateKeyPkcs8, publicKeySpki);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = gcm(key, iv, buildEnvelopeAadBytes(context)).encrypt(textEncoder().encode(plaintext));
    return {
      iv: toBase64(iv),
      ciphertext: toBase64(ciphertext),
    };
  }
  try {
    const key = await deriveSharedKey(privateKeyPkcs8, publicKeySpki);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await getSubtle().encrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(iv),
        additionalData: buildEnvelopeAad(context),
      },
      key,
      toArrayBuffer(textEncoder().encode(plaintext)),
    );
    return {
      iv: toBase64(iv),
      ciphertext: toBase64(new Uint8Array(ciphertext)),
    };
  } catch {
    const key = deriveSharedKeyBytesPureJs(privateKeyPkcs8, publicKeySpki);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = gcm(key, iv, buildEnvelopeAadBytes(context)).encrypt(textEncoder().encode(plaintext));
    return {
      iv: toBase64(iv),
      ciphertext: toBase64(ciphertext),
    };
  }
}

export async function decryptFromPeer(
  payload: SecureEnvelopePayload,
  privateKeyPkcs8: string,
  publicKeySpki: string,
  context?: SecureEnvelopeContext,
): Promise<string> {
  if (shouldUsePureJsCrypto(privateKeyPkcs8, publicKeySpki)) {
    const key = deriveSharedKeyBytesPureJs(privateKeyPkcs8, publicKeySpki);
    const plaintext = gcm(key, fromBase64(payload.iv), buildEnvelopeAadBytes(context)).decrypt(fromBase64(payload.ciphertext));
    return textDecoder().decode(plaintext);
  }
  try {
    const key = await deriveSharedKey(privateKeyPkcs8, publicKeySpki);
    const plaintext = await getSubtle().decrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(fromBase64(payload.iv)),
        additionalData: buildEnvelopeAad(context),
      },
      key,
      toArrayBuffer(fromBase64(payload.ciphertext)),
    );
    return textDecoder().decode(plaintext);
  } catch {
    const key = deriveSharedKeyBytesPureJs(privateKeyPkcs8, publicKeySpki);
    const plaintext = gcm(key, fromBase64(payload.iv), buildEnvelopeAadBytes(context)).decrypt(fromBase64(payload.ciphertext));
    return textDecoder().decode(plaintext);
  }
}

export async function getPublicKeyFingerprint(publicKeySpki: string): Promise<string> {
  const publicKeyBytes = normalizePublicKeyToRaw(publicKeySpki);
  let digest: Uint8Array;
  if (hasWebCryptoSubtle()) {
    try {
      digest = new Uint8Array(await getSubtle().digest("SHA-256", toArrayBuffer(publicKeyBytes)));
    } catch {
      digest = sha256(publicKeyBytes);
    }
  } else {
    digest = sha256(publicKeyBytes);
  }
  const hex = toHex(digest).toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
}
