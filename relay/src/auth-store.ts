import { randomBytes } from "node:crypto";

import type { Pool } from "pg";
import type { ClientGrantRecord } from "@termpilot/protocol";

interface PairingCodeRecord {
  deviceId: string;
  expiresAt: string;
  agentPublicKey: string;
}

export interface AuthStore {
  init(): Promise<void>;
  createPairingCode(deviceId: string, ttlMinutes: number, agentPublicKey: string): Promise<PairingCodeRecord & { pairingCode: string }>;
  redeemPairingCode(pairingCode: string, clientPublicKey: string): Promise<(ClientGrantRecord & { agentPublicKey: string }) | null>;
  getGrantByAccessToken(accessToken: string): Promise<ClientGrantRecord | null>;
  listGrants(deviceId: string): Promise<ClientGrantRecord[]>;
  revokeGrant(deviceId: string, accessToken: string): Promise<boolean>;
}

function createPairingCodeValue(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  const chars = Array.from(bytes, (value) => alphabet[value % alphabet.length]);
  return `${chars.slice(0, 3).join("")}-${chars.slice(3).join("")}`;
}

function createAccessToken(): string {
  return randomBytes(24).toString("hex");
}

export class MemoryAuthStore implements AuthStore {
  private readonly pairingCodes = new Map<string, PairingCodeRecord & { redeemedAt?: string }>();

  private readonly grants = new Map<string, ClientGrantRecord>();

  async init(): Promise<void> {}

  async createPairingCode(deviceId: string, ttlMinutes: number, agentPublicKey = ""): Promise<PairingCodeRecord & { pairingCode: string }> {
    const pairingCode = createPairingCodeValue();
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
    this.pairingCodes.set(pairingCode, {
      deviceId,
      expiresAt,
      agentPublicKey,
    });
    return {
      deviceId,
      pairingCode,
      expiresAt,
      agentPublicKey,
    };
  }

  async redeemPairingCode(pairingCode: string, clientPublicKey: string): Promise<(ClientGrantRecord & { agentPublicKey: string }) | null> {
    const record = this.pairingCodes.get(pairingCode);
    if (!record || record.redeemedAt || Date.parse(record.expiresAt) <= Date.now() || !record.agentPublicKey || !clientPublicKey.trim()) {
      return null;
    }

    record.redeemedAt = new Date().toISOString();
    this.pairingCodes.set(pairingCode, record);

    const accessToken = createAccessToken();
    const now = new Date().toISOString();
    const grant = {
      accessToken,
      deviceId: record.deviceId,
      clientPublicKey: clientPublicKey.trim(),
      createdAt: now,
      lastUsedAt: now,
    };
    this.grants.set(accessToken, grant);
    return {
      ...grant,
      agentPublicKey: record.agentPublicKey,
    };
  }

  async getGrantByAccessToken(accessToken: string): Promise<ClientGrantRecord | null> {
    const grant = this.grants.get(accessToken);
    if (!grant) {
      return null;
    }

    const nextGrant = {
      ...grant,
      lastUsedAt: new Date().toISOString(),
    };
    this.grants.set(accessToken, nextGrant);
    return nextGrant;
  }

  async listGrants(deviceId: string): Promise<ClientGrantRecord[]> {
    return Array.from(this.grants.values())
      .filter((grant) => grant.deviceId === deviceId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async revokeGrant(deviceId: string, accessToken: string): Promise<boolean> {
    const grant = this.grants.get(accessToken);
    if (!grant || grant.deviceId !== deviceId) {
      return false;
    }
    this.grants.delete(accessToken);
    return true;
  }
}

export class PostgresAuthStore implements AuthStore {
  constructor(private readonly pool: Pool) {}

  async init(): Promise<void> {
    await this.pool.query(`
      create table if not exists relay_pairing_codes (
        pairing_code text primary key,
        device_id text not null,
        agent_public_key text null,
        expires_at timestamptz not null,
        redeemed_at timestamptz null,
        created_at timestamptz not null default now()
      );
    `);
    await this.pool.query(`
      create table if not exists relay_client_grants (
        access_token text primary key,
        device_id text not null,
        client_public_key text null,
        created_at timestamptz not null default now(),
        last_used_at timestamptz not null default now()
      );
    `);
    await this.pool.query(`
      alter table relay_pairing_codes
      add column if not exists agent_public_key text null
    `);
    await this.pool.query(`
      alter table relay_client_grants
      add column if not exists client_public_key text null
    `);
  }

  async createPairingCode(deviceId: string, ttlMinutes: number, agentPublicKey = ""): Promise<PairingCodeRecord & { pairingCode: string }> {
    const pairingCode = createPairingCodeValue();
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
    await this.pool.query(
      `
      insert into relay_pairing_codes (pairing_code, device_id, agent_public_key, expires_at)
      values ($1, $2, $3, $4)
      `,
      [pairingCode, deviceId, agentPublicKey, expiresAt],
    );
    return {
      deviceId,
      pairingCode,
      expiresAt,
      agentPublicKey,
    };
  }

  async redeemPairingCode(pairingCode: string, clientPublicKey: string): Promise<(ClientGrantRecord & { agentPublicKey: string }) | null> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await client.query<{
        device_id: string;
        agent_public_key: string | null;
        expires_at: string;
        redeemed_at: string | null;
      }>(
        `
        select device_id, agent_public_key, expires_at, redeemed_at
        from relay_pairing_codes
        where pairing_code = $1
        for update
        `,
        [pairingCode],
      );
      const record = result.rows[0];
      if (!record || record.redeemed_at || Date.parse(record.expires_at) <= Date.now() || !record.agent_public_key || !clientPublicKey.trim()) {
        await client.query("rollback");
        return null;
      }

      const accessToken = createAccessToken();
      await client.query(
        `
        update relay_pairing_codes
        set redeemed_at = now()
        where pairing_code = $1
        `,
        [pairingCode],
      );
      await client.query(
        `
        insert into relay_client_grants (access_token, device_id, client_public_key)
        values ($1, $2, $3)
        `,
        [accessToken, record.device_id, clientPublicKey.trim()],
      );
      await client.query("commit");
      const now = new Date().toISOString();
      return {
        accessToken,
        deviceId: record.device_id,
        clientPublicKey: clientPublicKey.trim(),
        createdAt: now,
        lastUsedAt: now,
        agentPublicKey: record.agent_public_key,
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async getGrantByAccessToken(accessToken: string): Promise<ClientGrantRecord | null> {
    const result = await this.pool.query<{
      access_token: string;
      device_id: string;
      client_public_key: string | null;
      created_at: string;
      last_used_at: string;
    }>(
      `
      update relay_client_grants
      set last_used_at = now()
      where access_token = $1
      returning access_token, device_id, client_public_key, created_at, last_used_at
      `,
      [accessToken],
    );
    const record = result.rows[0];
    if (!record) {
      return null;
    }

    return {
      accessToken: record.access_token,
      deviceId: record.device_id,
      clientPublicKey: record.client_public_key ?? undefined,
      createdAt: record.created_at,
      lastUsedAt: record.last_used_at,
    };
  }

  async listGrants(deviceId: string): Promise<ClientGrantRecord[]> {
    const result = await this.pool.query<{
      access_token: string;
      device_id: string;
      client_public_key: string | null;
      created_at: string;
      last_used_at: string;
    }>(
      `
      select access_token, device_id, client_public_key, created_at, last_used_at
      from relay_client_grants
      where device_id = $1
      order by created_at desc
      `,
      [deviceId],
    );

    return result.rows.map((record) => ({
      accessToken: record.access_token,
      deviceId: record.device_id,
      clientPublicKey: record.client_public_key ?? undefined,
      createdAt: record.created_at,
      lastUsedAt: record.last_used_at,
    }));
  }

  async revokeGrant(deviceId: string, accessToken: string): Promise<boolean> {
    const result = await this.pool.query(
      `
      delete from relay_client_grants
      where device_id = $1 and access_token = $2
      `,
      [deviceId, accessToken],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
