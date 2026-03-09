import { randomUUID } from "node:crypto";

import type { Pool } from "pg";

import type { AuditAction, AuditActorRole, AuditEventRecord } from "@termpilot/protocol";

export interface AuditStore {
  init(): Promise<void>;
  addEvent(input: {
    deviceId: string;
    action: AuditAction;
    actorRole: AuditActorRole;
    detail: string;
  }): Promise<AuditEventRecord>;
  listEvents(deviceId: string, limit: number): Promise<AuditEventRecord[]>;
}

function now(): string {
  return new Date().toISOString();
}

export class MemoryAuditStore implements AuditStore {
  private readonly events = new Map<string, AuditEventRecord[]>();

  async init(): Promise<void> {}

  async addEvent(input: {
    deviceId: string;
    action: AuditAction;
    actorRole: AuditActorRole;
    detail: string;
  }): Promise<AuditEventRecord> {
    const event: AuditEventRecord = {
      id: randomUUID(),
      deviceId: input.deviceId,
      action: input.action,
      actorRole: input.actorRole,
      detail: input.detail,
      createdAt: now(),
    };
    const bucket = this.events.get(input.deviceId) ?? [];
    bucket.unshift(event);
    this.events.set(input.deviceId, bucket.slice(0, 200));
    return event;
  }

  async listEvents(deviceId: string, limit: number): Promise<AuditEventRecord[]> {
    return (this.events.get(deviceId) ?? []).slice(0, limit);
  }
}

export class PostgresAuditStore implements AuditStore {
  constructor(private readonly pool: Pool) {}

  async init(): Promise<void> {
    await this.pool.query(`
      create table if not exists relay_audit_events (
        id text primary key,
        device_id text not null,
        action text not null,
        actor_role text not null,
        detail text not null,
        created_at timestamptz not null default now()
      );
    `);
    await this.pool.query(`
      create index if not exists relay_audit_events_device_id_idx
      on relay_audit_events (device_id, created_at desc);
    `);
  }

  async addEvent(input: {
    deviceId: string;
    action: AuditAction;
    actorRole: AuditActorRole;
    detail: string;
  }): Promise<AuditEventRecord> {
    const event: AuditEventRecord = {
      id: randomUUID(),
      deviceId: input.deviceId,
      action: input.action,
      actorRole: input.actorRole,
      detail: input.detail,
      createdAt: now(),
    };
    await this.pool.query(
      `
      insert into relay_audit_events (id, device_id, action, actor_role, detail, created_at)
      values ($1, $2, $3, $4, $5, $6)
      `,
      [event.id, event.deviceId, event.action, event.actorRole, event.detail, event.createdAt],
    );
    return event;
  }

  async listEvents(deviceId: string, limit: number): Promise<AuditEventRecord[]> {
    const result = await this.pool.query<{
      id: string;
      device_id: string;
      action: AuditAction;
      actor_role: AuditActorRole;
      detail: string;
      created_at: string;
    }>(
      `
      select id, device_id, action, actor_role, detail, created_at
      from relay_audit_events
      where device_id = $1
      order by created_at desc
      limit $2
      `,
      [deviceId, limit],
    );

    return result.rows.map((row) => ({
      id: row.id,
      deviceId: row.device_id,
      action: row.action,
      actorRole: row.actor_role,
      detail: row.detail,
      createdAt: row.created_at,
    }));
  }
}
