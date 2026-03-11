import { DEFAULT_AGENT_TOKEN, DEFAULT_CLIENT_TOKEN } from "@termpilot/protocol";

export interface RelayConfig {
  host: string;
  port: number;
  agentToken: string;
  clientToken?: string;
  databaseUrl?: string;
  pairingTtlMinutes: number;
}

export function loadConfig(): RelayConfig {
  const rawClientToken = process.env.TERMPILOT_CLIENT_TOKEN?.trim();
  const clientToken = rawClientToken && rawClientToken !== DEFAULT_CLIENT_TOKEN
    ? rawClientToken
    : undefined;

  return {
    host: process.env.HOST ?? "0.0.0.0",
    port: Number(process.env.PORT ?? 8787),
    agentToken: process.env.TERMPILOT_AGENT_TOKEN ?? DEFAULT_AGENT_TOKEN,
    clientToken,
    databaseUrl: process.env.DATABASE_URL?.trim() || undefined,
    pairingTtlMinutes: Number(process.env.TERMPILOT_PAIRING_TTL_MINUTES ?? 10),
  };
}
