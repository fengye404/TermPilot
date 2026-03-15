import { DEFAULT_AGENT_TOKEN, DEFAULT_CLIENT_TOKEN } from "@termpilot/protocol";

import { getRelayDatabaseFilePath } from "./runtime-store.js";

export type RelayStoreMode = "memory" | "sqlite" | "postgres";

export interface RelayConfig {
  host: string;
  port: number;
  agentToken: string;
  clientToken?: string;
  storeMode: RelayStoreMode;
  databaseUrl?: string;
  sqlitePath?: string;
  pairingTtlMinutes: number;
}

export function loadConfig(): RelayConfig {
  const rawClientToken = process.env.TERMPILOT_CLIENT_TOKEN?.trim();
  const clientToken = rawClientToken && rawClientToken !== DEFAULT_CLIENT_TOKEN
    ? rawClientToken
    : undefined;
  const databaseUrl = process.env.DATABASE_URL?.trim() || undefined;
  const requestedStoreMode = process.env.TERMPILOT_RELAY_STORE?.trim().toLowerCase();
  const storeMode: RelayStoreMode = databaseUrl
    ? "postgres"
    : requestedStoreMode === "memory"
      ? "memory"
      : "sqlite";
  const sqlitePath = storeMode === "sqlite"
    ? (process.env.TERMPILOT_SQLITE_PATH?.trim() || getRelayDatabaseFilePath())
    : undefined;

  return {
    host: process.env.HOST ?? "0.0.0.0",
    port: Number(process.env.PORT ?? 8787),
    agentToken: process.env.TERMPILOT_AGENT_TOKEN ?? DEFAULT_AGENT_TOKEN,
    clientToken,
    storeMode,
    databaseUrl,
    sqlitePath,
    pairingTtlMinutes: Number(process.env.TERMPILOT_PAIRING_TTL_MINUTES ?? 10),
  };
}
