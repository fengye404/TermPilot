import { randomBytes } from "node:crypto";

import type { Pool } from "pg";

interface PairingCodeRecord {
  deviceId: string;
  expiresAt: string;
}

interface ClientGrantRecord {
  accessToken: string;
  deviceId: string;
}

export interface AuthStore {
  init(): Promise<void>;
  createPairingCode(deviceId: string, ttlMinutes: number): Promise<PairingCodeRecord & { pairingCode: string }>;
  redeemPairingCode(pairingCode: string): Promise<ClientGrantRecord | null>;
  getGrantByAccessToken(accessToken: string): Promise<ClientGrantRecord | null>;
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

  async createPairingCode(deviceId: string, ttlMinutes: number): Promise<PairingCodeRecord & { pairingCode: string }> {
    const pairingCode = createPairingCodeValue();
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
    this.pairingCodes.set(pairingCode, {
      deviceId,
      expiresAt,
    });
    return {
      deviceId,
      pairingCode,
      expiresAt,
    };
  }

  async redeemPairingCode(pairingCode: string): Promise<ClientGrantRecord | null> {
    const record = this.pairingCodes.get(pairingCode);
    if (!record || record.redeemedAt || Date.parse(record.expiresAt) <= Date.now()) {
      return null;
    }

    record.redeemedAt = new Date().toISOString();
    this.pairingCodes.set(pairingCode, record);

    const accessToken = createAccessToken();
    const grant = {
      accessToken,
      deviceId: record.deviceId,
    };
    this.grants.set(accessToken, grant);
    return grant;
  }

  async getGrantByAccessToken(accessToken: string): Promise<ClientGrantRecord | null> {
    return this.grants.get(accessToken) ?? null;
  }
}

export class PostgresAuthStore implements AuthStore {
  constructor(private readonly pool: Pool) {}

  async init(): Promise<void> {
    await this.pool.query(`
      create table if not exists relay_pairing_codes (
        pairing_code text primary key,
        device_id text not null,
        expires_at timestamptz not null,
        redeemed_at timestamptz null,
        created_at timestamptz not null default now()
      );
    `);
    await this.pool.query(`
      create table if not exists relay_client_grants (
        access_token text primary key,
        device_id text not null,
        created_at timestamptz not null default now(),
        last_used_at timestamptz not null default now()
      );
    `);
  }

  async createPairingCode(deviceId: string, ttlMinutes: number): Promise<PairingCodeRecord & { pairingCode: string }> {
    const pairingCode = createPairingCodeValue();
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
    await this.pool.query(
      `
      insert into relay_pairing_codes (pairing_code, device_id, expires_at)
      values ($1, $2, $3)
      `,
      [pairingCode, deviceId, expiresAt],
    );
    return {
      deviceId,
      pairingCode,
      expiresAt,
    };
  }

  async redeemPairingCode(pairingCode: string): Promise<ClientGrantRecord | null> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await client.query<{
        device_id: string;
        expires_at: string;
        redeemed_at: string | null;
      }>(
        `
        select device_id, expires_at, redeemed_at
        from relay_pairing_codes
        where pairing_code = $1
        for update
        `,
        [pairingCode],
      );
      const record = result.rows[0];
      if (!record || record.redeemed_at || Date.parse(record.expires_at) <= Date.now()) {
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
        insert into relay_client_grants (access_token, device_id)
        values ($1, $2)
        `,
        [accessToken, record.device_id],
      );
      await client.query("commit");
      return {
        accessToken,
        deviceId: record.device_id,
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async getGrantByAccessToken(accessToken: string): Promise<ClientGrantRecord | null> {
    const result = await this.pool.query<{ access_token: string; device_id: string }>(
      `
      update relay_client_grants
      set last_used_at = now()
      where access_token = $1
      returning access_token, device_id
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
    };
  }
}
