import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { Pool } from "pg";

import type {
  AgentToRelayMessage,
  ClientToRelayMessage,
  ErrorMessage,
  RelayStateMessage,
  RelayToClientMessage,
  SessionListResultMessage,
  SessionOutputMessage,
  SessionRecord,
} from "@termpilot/protocol";
import {
  parseJsonMessage,
} from "@termpilot/protocol";

import { loadConfig } from "./config.js";
import { MemorySessionStore, PostgresSessionStore, type SessionStore } from "./session-store.js";

type ClientSocket = import("ws").WebSocket;

interface AgentConnection {
  socket: ClientSocket;
  deviceId: string;
}

interface ClientConnection {
  socket: ClientSocket;
}

interface OutputBuffer {
  frames: SessionOutputMessage[];
}

const config = loadConfig();
const app = Fastify({ logger: true });

const agents = new Map<string, AgentConnection>();
const clients = new Set<ClientConnection>();
const sessionCache = new Map<string, Map<string, SessionRecord>>();
const outputBuffers = new Map<string, OutputBuffer>();

const sessionStorePromise: Promise<SessionStore> = (async () => {
  if (!config.databaseUrl) {
    app.log.warn("未提供 DATABASE_URL，当前 relay 使用内存存储会话元数据。");
    return new MemorySessionStore();
  }

  const pool = new Pool({ connectionString: config.databaseUrl });
  const store = new PostgresSessionStore(pool);
  await store.init();
  return store;
})();

function broadcastToClients(message: RelayToClientMessage): void {
  const raw = JSON.stringify(message);
  for (const client of clients) {
    if (client.socket.readyState === client.socket.OPEN) {
      client.socket.send(raw);
    }
  }
}

function sendError(socket: ClientSocket, code: string, message: string, reqId?: string): void {
  const payload: ErrorMessage = {
    type: "error",
    code,
    message,
    reqId,
  };
  socket.send(JSON.stringify(payload));
}

function relayStateMessage(): RelayStateMessage {
  return {
    type: "relay.state",
    payload: {
      agents: Array.from(agents.keys()).map((deviceId) => ({
        deviceId,
        online: true,
      })),
    },
  };
}

function broadcastRelayState(): void {
  broadcastToClients(relayStateMessage());
}

function setCachedSessions(deviceId: string, sessions: SessionRecord[]): void {
  const bucket = new Map<string, SessionRecord>();
  for (const session of sessions) {
    bucket.set(session.sid, session);
  }
  sessionCache.set(deviceId, bucket);
}

function upsertCachedSession(session: SessionRecord): void {
  const bucket = sessionCache.get(session.deviceId) ?? new Map<string, SessionRecord>();
  bucket.set(session.sid, session);
  sessionCache.set(session.deviceId, bucket);
}

function markCachedSessionExited(deviceId: string, sid: string): void {
  const bucket = sessionCache.get(deviceId);
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

function pushOutputFrame(frame: SessionOutputMessage): void {
  const key = `${frame.deviceId}:${frame.sid}`;
  const buffer = outputBuffers.get(key) ?? { frames: [] };
  buffer.frames.push(frame);
  buffer.frames = buffer.frames.slice(-40);
  outputBuffers.set(key, buffer);
}

async function handleAgentMessage(message: AgentToRelayMessage): Promise<void> {
  const store = await sessionStorePromise;

  switch (message.type) {
    case "session.list.result":
      setCachedSessions(message.deviceId, message.payload.sessions);
      await store.replaceSessions(message.deviceId, message.payload.sessions);
      broadcastToClients(message);
      return;
    case "session.created":
      upsertCachedSession(message.payload.session);
      await store.upsertSession(message.payload.session);
      broadcastToClients(message);
      return;
    case "session.state":
      upsertCachedSession(message.payload.session);
      await store.upsertSession(message.payload.session);
      broadcastToClients(message);
      return;
    case "session.output":
      pushOutputFrame(message);
      broadcastToClients(message);
      return;
    case "session.exit":
      markCachedSessionExited(message.deviceId, message.sid);
      await store.markSessionExited(message.deviceId, message.sid);
      broadcastToClients(message);
      return;
    case "error":
      broadcastToClients(message);
  }
}

async function handleClientMessage(socket: ClientSocket, message: ClientToRelayMessage): Promise<void> {
  if (message.type === "session.replay") {
    const key = `${message.deviceId}:${message.sid}`;
    const frames = outputBuffers.get(key)?.frames ?? [];
    for (const frame of frames.filter((item) => item.seq > (message.payload?.afterSeq ?? -1))) {
      socket.send(JSON.stringify(frame));
    }
    return;
  }

  if (message.type === "session.list") {
    if (!agents.has(message.deviceId)) {
      const store = await sessionStorePromise;
      const cached = sessionCache.get(message.deviceId);
      const sessions = cached ? Array.from(cached.values()) : await store.listSessions(message.deviceId);
      const payload: SessionListResultMessage = {
        type: "session.list.result",
        reqId: message.reqId,
        deviceId: message.deviceId,
        payload: {
          sessions,
        },
      };
      socket.send(JSON.stringify(payload));
      return;
    }
  }

  const agent = agents.get(message.deviceId);
  if (!agent || agent.socket.readyState !== agent.socket.OPEN) {
    sendError(socket, "DEVICE_OFFLINE", `设备 ${message.deviceId} 当前不在线`, "reqId" in message ? message.reqId : undefined);
    return;
  }

  agent.socket.send(JSON.stringify(message));
}

await app.register(websocket);

app.get("/health", async () => ({ ok: true }));

app.get("/ws", { websocket: true }, (connection, request) => {
  const url = new URL(request.raw.url ?? "/ws", `http://${request.headers.host ?? "127.0.0.1"}`);
  const role = url.searchParams.get("role");
  const token = url.searchParams.get("token");
  const deviceId = url.searchParams.get("deviceId") ?? undefined;
  const socket = connection;

  if (role === "agent") {
    if (token !== config.agentToken || !deviceId) {
      sendError(socket, "AUTH_FAILED", "agent 认证失败");
      socket.close();
      return;
    }

    agents.set(deviceId, { socket, deviceId });
    socket.send(JSON.stringify({ type: "auth.ok", payload: { role: "agent", deviceId } }));
    broadcastRelayState();

    socket.on("message", (raw) => {
      const message = parseJsonMessage<AgentToRelayMessage>(raw.toString());
      if (!message) {
        return;
      }
      void handleAgentMessage(message);
    });

    socket.on("close", () => {
      agents.delete(deviceId);
      broadcastRelayState();
    });
    return;
  }

  if (role === "client") {
    if (token !== config.clientToken) {
      sendError(socket, "AUTH_FAILED", "client 认证失败");
      socket.close();
      return;
    }

    const client = { socket };
    clients.add(client);
    socket.send(JSON.stringify({ type: "auth.ok", payload: { role: "client" } }));
    socket.send(JSON.stringify(relayStateMessage()));

    socket.on("message", (raw) => {
      const message = parseJsonMessage<ClientToRelayMessage>(raw.toString());
      if (!message) {
        return;
      }
      void handleClientMessage(socket, message);
    });

    socket.on("close", () => {
      clients.delete(client);
    });
    return;
  }

  sendError(socket, "AUTH_FAILED", "未知角色");
  socket.close();
});

const closeStore = async (): Promise<void> => {
  const store = await sessionStorePromise;
  await store.close();
};

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void app.close().finally(() => closeStore().finally(() => process.exit(0)));
  });
}

await app.listen({
  host: config.host,
  port: config.port,
});
