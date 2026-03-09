import { DEFAULT_AGENT_TOKEN, DEFAULT_CLIENT_TOKEN } from "@termpilot/protocol";

export interface RelayConfig {
  host: string;
  port: number;
  agentToken: string;
  clientToken: string;
  databaseUrl?: string;
}

export function loadConfig(): RelayConfig {
  return {
    host: process.env.HOST ?? "127.0.0.1",
    port: Number(process.env.PORT ?? 8787),
    agentToken: process.env.TERMPILOT_AGENT_TOKEN ?? DEFAULT_AGENT_TOKEN,
    clientToken: process.env.TERMPILOT_CLIENT_TOKEN ?? DEFAULT_CLIENT_TOKEN,
    databaseUrl: process.env.DATABASE_URL?.trim() || undefined,
  };
}
