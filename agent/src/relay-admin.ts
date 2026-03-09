import type { AuditEventRecord, ClientGrantRecord, PairingCodeResponse } from "@termpilot/protocol";
import { DEFAULT_AGENT_TOKEN, DEFAULT_DEVICE_ID } from "@termpilot/protocol";

function getRelayBaseUrl(): string {
  const relayUrl = process.env.TERMPILOT_RELAY_URL ?? "ws://127.0.0.1:8787/ws";
  let url: URL;
  try {
    url = new URL(relayUrl);
  } catch {
    throw new Error("TERMPILOT_RELAY_URL 无效，请提供完整的 ws:// 或 wss:// 地址。");
  }
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = "/";
  url.search = "";
  return url.toString();
}

function getAgentToken(): string {
  return process.env.TERMPILOT_AGENT_TOKEN ?? DEFAULT_AGENT_TOKEN;
}

export function resolveDeviceId(value?: string): string {
  return value?.trim() || process.env.TERMPILOT_DEVICE_ID || DEFAULT_DEVICE_ID;
}

async function readJsonOrThrow<T>(response: Response, message: string): Promise<T> {
  if (!response.ok) {
    throw new Error(`${message}: ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

async function fetchJson<T>(input: URL, init: RequestInit, message: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "未知网络错误";
    throw new Error(`${message}: 无法连接 relay (${input.origin})，${detail}`);
  }
  return readJsonOrThrow<T>(response, message);
}

export async function createPairingCode(deviceId: string): Promise<PairingCodeResponse> {
  return fetchJson<PairingCodeResponse>(
    new URL("/api/pairing-codes", getRelayBaseUrl()),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${getAgentToken()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ deviceId }),
    },
    "申请配对码失败",
  );
}

export async function listDeviceGrants(deviceId: string): Promise<{ deviceId: string; grants: ClientGrantRecord[] }> {
  return fetchJson<{ deviceId: string; grants: ClientGrantRecord[] }>(
    new URL(`/api/devices/${deviceId}/grants`, getRelayBaseUrl()),
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
    new URL(`/api/devices/${deviceId}/grants/${accessToken}`, getRelayBaseUrl()),
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
    new URL(`/api/devices/${deviceId}/audit-events?limit=${constrainedLimit}`, getRelayBaseUrl()),
    {
      headers: {
        authorization: `Bearer ${getAgentToken()}`,
      },
    },
    "读取审计日志失败",
  );
}
