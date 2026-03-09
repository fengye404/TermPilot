import type { Pool } from "pg";

import type { SessionRecord } from "@termpilot/protocol";

export interface SessionStore {
  replaceSessions(deviceId: string, sessions: SessionRecord[]): Promise<void>;
  upsertSession(session: SessionRecord): Promise<void>;
  markSessionExited(deviceId: string, sid: string): Promise<void>;
  listSessions(deviceId: string): Promise<SessionRecord[]>;
  close(): Promise<void>;
}

export class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, Map<string, SessionRecord>>();

  async replaceSessions(deviceId: string, sessions: SessionRecord[]): Promise<void> {
    const bucket = new Map<string, SessionRecord>();
    for (const session of sessions) {
      bucket.set(session.sid, session);
    }
    this.sessions.set(deviceId, bucket);
  }

  async upsertSession(session: SessionRecord): Promise<void> {
    const bucket = this.sessions.get(session.deviceId) ?? new Map<string, SessionRecord>();
    bucket.set(session.sid, session);
    this.sessions.set(session.deviceId, bucket);
  }

  async markSessionExited(deviceId: string, sid: string): Promise<void> {
    const bucket = this.sessions.get(deviceId);
    const session = bucket?.get(sid);
    if (!bucket || !session) {
      return;
    }

    bucket.set(sid, {
      ...session,
      status: "exited",
      lastActivityAt: new Date().toISOString(),
    });
  }

  async listSessions(deviceId: string): Promise<SessionRecord[]> {
    return Array.from(this.sessions.get(deviceId)?.values() ?? []);
  }

  async close(): Promise<void> {}
}

export class PostgresSessionStore implements SessionStore {
  constructor(private readonly pool: Pool) {}

  async init(): Promise<void> {
    await this.pool.query(`
      create table if not exists relay_sessions (
        sid text primary key,
        device_id text not null,
        name text not null,
        backend text not null,
        shell text not null,
        cwd text not null,
        status text not null,
        started_at timestamptz not null,
        last_seq integer not null,
        last_activity_at timestamptz not null,
        tmux_session_name text not null,
        updated_at timestamptz not null default now()
      );
    `);
    await this.pool.query(`
      create index if not exists relay_sessions_device_id_idx
      on relay_sessions (device_id);
    `);
  }

  async replaceSessions(deviceId: string, sessions: SessionRecord[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("delete from relay_sessions where device_id = $1", [deviceId]);
      for (const session of sessions) {
        await this.upsertSessionWithClient(client, session);
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async upsertSession(session: SessionRecord): Promise<void> {
    const client = await this.pool.connect();
    try {
      await this.upsertSessionWithClient(client, session);
    } finally {
      client.release();
    }
  }

  private async upsertSessionWithClient(client: { query: Pool["query"] }, session: SessionRecord): Promise<void> {
    await client.query(
      `
      insert into relay_sessions (
        sid, device_id, name, backend, shell, cwd, status, started_at, last_seq, last_activity_at, tmux_session_name, updated_at
      ) values (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now()
      )
      on conflict (sid) do update set
        device_id = excluded.device_id,
        name = excluded.name,
        backend = excluded.backend,
        shell = excluded.shell,
        cwd = excluded.cwd,
        status = excluded.status,
        started_at = excluded.started_at,
        last_seq = excluded.last_seq,
        last_activity_at = excluded.last_activity_at,
        tmux_session_name = excluded.tmux_session_name,
        updated_at = now()
      `,
      [
        session.sid,
        session.deviceId,
        session.name,
        session.backend,
        session.shell,
        session.cwd,
        session.status,
        session.startedAt,
        session.lastSeq,
        session.lastActivityAt,
        session.tmuxSessionName,
      ],
    );
  }

  async markSessionExited(deviceId: string, sid: string): Promise<void> {
    await this.pool.query(
      `
      update relay_sessions
      set status = 'exited', last_activity_at = now(), updated_at = now()
      where device_id = $1 and sid = $2
      `,
      [deviceId, sid],
    );
  }

  async listSessions(deviceId: string): Promise<SessionRecord[]> {
    const result = await this.pool.query(
      `
      select
        sid,
        device_id as "deviceId",
        name,
        backend,
        shell,
        cwd,
        status,
        started_at as "startedAt",
        last_seq as "lastSeq",
        last_activity_at as "lastActivityAt",
        tmux_session_name as "tmuxSessionName"
      from relay_sessions
      where device_id = $1
      order by started_at desc
      `,
      [deviceId],
    );

    return result.rows as SessionRecord[];
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
