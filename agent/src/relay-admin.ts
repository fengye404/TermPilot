import type { AuditEventRecord, ClientGrantRecord, PairingCodeResponse } from "@termpilot/protocol";
import { DEFAULT_AGENT_TOKEN, DEFAULT_DEVICE_ID } from "@termpilot/protocol";

function getRelayBaseUrl(): string {
  const relayUrl = process.env.TERMPILOT_RELAY_URL ?? "ws://127.0.0.1:8787/ws";
  const url = new URL(relayUrl);
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

export async function createPairingCode(deviceId: string): Promise<PairingCodeResponse> {
  const response = await fetch(new URL("/api/pairing-codes", getRelayBaseUrl()), {
    method: "POST",
    headers: {
      authorization: `Bearer ${getAgentToken()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ deviceId }),
  });
  return readJsonOrThrow<PairingCodeResponse>(response, "申请配对码失败");
}

export async function listDeviceGrants(deviceId: string): Promise<{ deviceId: string; grants: ClientGrantRecord[] }> {
  const response = await fetch(new URL(`/api/devices/${deviceId}/grants`, getRelayBaseUrl()), {
    headers: {
      authorization: `Bearer ${getAgentToken()}`,
    },
  });
  return readJsonOrThrow<{ deviceId: string; grants: ClientGrantRecord[] }>(response, "读取访问令牌失败");
}

export async function revokeDeviceGrant(deviceId: string, accessToken: string): Promise<void> {
  const response = await fetch(new URL(`/api/devices/${deviceId}/grants/${accessToken}`, getRelayBaseUrl()), {
    method: "DELETE",
    headers: {
      authorization: `Bearer ${getAgentToken()}`,
    },
  });
  await readJsonOrThrow<{ ok: true }>(response, "撤销访问令牌失败");
}

export async function listAuditEvents(deviceId: string, limit: number): Promise<{ deviceId: string; events: AuditEventRecord[] }> {
  const constrainedLimit = Math.max(1, Math.min(limit, 100));
  const response = await fetch(new URL(`/api/devices/${deviceId}/audit-events?limit=${constrainedLimit}`, getRelayBaseUrl()), {
    headers: {
      authorization: `Bearer ${getAgentToken()}`,
    },
  });
  return readJsonOrThrow<{ deviceId: string; events: AuditEventRecord[] }>(response, "读取审计日志失败");
}
