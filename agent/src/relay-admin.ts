import type { AuditEventRecord, ClientGrantRecord, PairingCodeResponse } from "@termpilot/protocol";
import { DEFAULT_AGENT_TOKEN, DEFAULT_DEVICE_ID } from "@termpilot/protocol";
import { getOrCreateGeneratedDeviceId, loadAgentConfig, loadAgentRuntime } from "./state-store.js";

const DEFAULT_RELAY_URL = "ws://127.0.0.1:8787/ws";

function isLocalRelayHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || /^10\./.test(hostname) || /^192\.168\./.test(hostname) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
}

interface RelayBaseCandidate {
  baseUrl: string;
  relayUrl: string;
}

function getConfiguredRelayUrl(): string {
  const envRelayUrl = process.env.TERMPILOT_RELAY_URL?.trim();
  if (envRelayUrl) {
    return envRelayUrl;
  }

  const runtimeRelayUrl = loadAgentRuntime()?.relayUrl.trim();
  if (runtimeRelayUrl) {
    return runtimeRelayUrl;
  }

  const savedRelayUrl = loadAgentConfig()?.relayUrl.trim();
  if (savedRelayUrl) {
    return savedRelayUrl;
  }

  return DEFAULT_RELAY_URL;
}

function getRelayBaseCandidates(relayUrl = getConfiguredRelayUrl()): RelayBaseCandidate[] {
  let url: URL;
  try {
    url = new URL(relayUrl);
  } catch {
    throw new Error("TERMPILOT_RELAY_URL 无效，请提供完整的 ws:// 或 wss:// 地址。");
  }

  const wsUrl = new URL(url.toString());
  wsUrl.search = "";
  wsUrl.hash = "";
  if (!wsUrl.pathname || wsUrl.pathname === "/") {
    wsUrl.pathname = "/ws";
  }

  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = "/";
  url.search = "";
  url.hash = "";

  const candidates: RelayBaseCandidate[] = [{
    baseUrl: url.toString(),
    relayUrl: wsUrl.toString(),
  }];

  if (!isLocalRelayHost(url.hostname) && url.port === "8787") {
    const fallbackBase = new URL(url.toString());
    fallbackBase.port = "";
    const fallbackRelay = new URL(wsUrl.toString());
    fallbackRelay.port = "";
    candidates.push({
      baseUrl: fallbackBase.toString(),
      relayUrl: fallbackRelay.toString(),
    });
  }

  return candidates;
}

async function isRelayReachable(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(new URL("/health", baseUrl), {
      signal: AbortSignal.timeout(2_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function resolvePreferredRelayUrl(relayUrl: string): Promise<string> {
  const candidates = getRelayBaseCandidates(relayUrl);
  if (candidates.length === 1) {
    return candidates[0]!.relayUrl;
  }

  const primary = candidates[0]!;
  if (await isRelayReachable(primary.baseUrl)) {
    return primary.relayUrl;
  }

  for (const candidate of candidates.slice(1)) {
    if (await isRelayReachable(candidate.baseUrl)) {
      return candidate.relayUrl;
    }
  }

  return primary.relayUrl;
}

function getAgentToken(): string {
  return process.env.TERMPILOT_AGENT_TOKEN ?? DEFAULT_AGENT_TOKEN;
}

export function resolveDeviceId(value?: string): string {
  const normalized = value?.trim() || process.env.TERMPILOT_DEVICE_ID?.trim();
  if (normalized && normalized !== DEFAULT_DEVICE_ID) {
    return normalized;
  }
  return getOrCreateGeneratedDeviceId();
}

async function readJsonOrThrow<T>(response: Response, message: string): Promise<T> {
  if (!response.ok) {
    throw new Error(`${message}: ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

async function fetchJson<T>(input: URL, init: RequestInit, message: string): Promise<T> {
  const candidates = getRelayBaseCandidates();
  let lastError: unknown = null;
  let lastOrigin = input.origin;

  for (const candidate of candidates) {
    const target = new URL(input.pathname + input.search, candidate.baseUrl);
    lastOrigin = target.origin;
    let response: Response;
    try {
      response = await fetch(target, init);
    } catch (error) {
      lastError = error;
      continue;
    }

    if (process.env.TERMPILOT_RELAY_URL !== candidate.relayUrl) {
      process.env.TERMPILOT_RELAY_URL = candidate.relayUrl;
    }
    return readJsonOrThrow<T>(response, message);
  }

  const detail = lastError instanceof Error ? lastError.message : "未知网络错误";
  throw new Error(`${message}: 无法连接 relay (${lastOrigin})，${detail}`);
}

export async function createPairingCode(deviceId: string, agentPublicKey: string): Promise<PairingCodeResponse> {
  return fetchJson<PairingCodeResponse>(
    new URL("/api/pairing-codes", "https://placeholder.invalid"),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${getAgentToken()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ deviceId, agentPublicKey }),
    },
    "申请配对码失败",
  );
}

export async function listDeviceGrants(deviceId: string): Promise<{ deviceId: string; grants: ClientGrantRecord[] }> {
  return fetchJson<{ deviceId: string; grants: ClientGrantRecord[] }>(
    new URL(`/api/devices/${deviceId}/grants`, "https://placeholder.invalid"),
    {
      headers: {
        authorization: `Bearer ${getAgentToken()}`,
      },
    },
    "读取访问令牌失败",
  );
}

export async function revokeDeviceGrant(deviceId: string, accessToken: string): Promise<void> {
  await fetchJson<{ ok: true }>(
    new URL(`/api/devices/${deviceId}/grants/${accessToken}`, "https://placeholder.invalid"),
    {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${getAgentToken()}`,
      },
    },
    "撤销访问令牌失败",
  );
}

export async function listAuditEvents(deviceId: string, limit: number): Promise<{ deviceId: string; events: AuditEventRecord[] }> {
  const constrainedLimit = Math.max(1, Math.min(limit, 100));
  return fetchJson<{ deviceId: string; events: AuditEventRecord[] }>(
    new URL(`/api/devices/${deviceId}/audit-events?limit=${constrainedLimit}`, "https://placeholder.invalid"),
    {
      headers: {
        authorization: `Bearer ${getAgentToken()}`,
      },
    },
    "读取审计日志失败",
  );
}
