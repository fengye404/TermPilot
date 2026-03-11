import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Fastify, { type FastifyReply } from "fastify";
import websocket from "@fastify/websocket";
import { Pool } from "pg";

import type {
  AgentToRelayMessage,
  AuditEventRecord,
  ClientGrantRecord,
  ClientToRelayMessage,
  ErrorMessage,
  PairingCodeRequest,
  PairingCodeResponse,
  PairingRedeemRequest,
  PairingRedeemResponse,
  RelayStateMessage,
  RelayToClientMessage,
  SessionListResultMessage,
  SessionOutputMessage,
  SessionRecord,
} from "@termpilot/protocol";
import { parseJsonMessage } from "@termpilot/protocol";

import { MemoryAuthStore, PostgresAuthStore, type AuthStore } from "./auth-store.js";
import { MemoryAuditStore, PostgresAuditStore, type AuditStore } from "./audit-store.js";
import { loadConfig, type RelayConfig } from "./config.js";
import { MemorySessionStore, PostgresSessionStore, type SessionStore } from "./session-store.js";

type ClientSocket = import("ws").WebSocket;

interface AgentConnection {
  socket: ClientSocket;
  deviceId: string;
}

interface ClientConnection {
  socket: ClientSocket;
  deviceScope: "*" | Set<string>;
  accessToken?: string;
}

interface OutputBuffer {
  frames: SessionOutputMessage[];
}

interface RelayServerOptions {
  config?: Partial<RelayConfig>;
  webDir?: string;
}

const STATIC_CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

function getMimeType(filePath: string): string {
  return STATIC_CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function createStaticPath(webDir: string, urlPath: string): string {
  const requestPath = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  const relativePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const resolvedPath = path.resolve(webDir, relativePath);
  if (!resolvedPath.startsWith(path.resolve(webDir))) {
    return path.join(webDir, "index.html");
  }
  if (!existsSync(resolvedPath)) {
    return path.join(webDir, "index.html");
  }
  try {
    if (statSync(resolvedPath).isDirectory()) {
      return path.join(webDir, "index.html");
    }
  } catch {
    return path.join(webDir, "index.html");
  }
  return resolvedPath;
}

export function resolveDefaultWebDir(moduleUrl = import.meta.url): string {
  const candidates = [
    "../../app/dist",
    "../app/dist",
    "./app/dist",
  ];

  for (const candidate of candidates) {
    const resolvedDir = fileURLToPath(new URL(candidate, moduleUrl));
    if (existsSync(path.join(resolvedDir, "index.html"))) {
      return resolvedDir;
    }
  }

  return fileURLToPath(new URL("../app/dist", moduleUrl));
}

export async function startRelayServer(options: RelayServerOptions = {}) {
  const config = {
    ...loadConfig(),
    ...options.config,
  };
  const app = Fastify({ logger: true });
  const agents = new Map<string, AgentConnection>();
  const clients = new Set<ClientConnection>();
  const sessionCache = new Map<string, Map<string, SessionRecord>>();
  const outputBuffers = new Map<string, OutputBuffer>();
  const webDir = options.webDir ?? resolveDefaultWebDir(import.meta.url);

  const storesPromise: Promise<{ sessionStore: SessionStore; authStore: AuthStore; auditStore: AuditStore }> = (async () => {
    if (!config.databaseUrl) {
      app.log.warn("未提供 DATABASE_URL，当前 relay 使用内存存储会话元数据。");
      const sessionStore = new MemorySessionStore();
      const authStore = new MemoryAuthStore();
      const auditStore = new MemoryAuditStore();
      await authStore.init();
      await auditStore.init();
      return { sessionStore, authStore, auditStore };
    }

    const pool = new Pool({ connectionString: config.databaseUrl });
    const sessionStore = new PostgresSessionStore(pool);
    const authStore = new PostgresAuthStore(pool);
    const auditStore = new PostgresAuditStore(pool);
    await sessionStore.init();
    await authStore.init();
    await auditStore.init();
    app.log.info("relay 已连接 PostgreSQL，会话元数据将写入数据库。");
    return { sessionStore, authStore, auditStore };
  })();

  async function appendAuditEvent(input: {
    deviceId: string;
    action: Parameters<AuditStore["addEvent"]>[0]["action"];
    actorRole: Parameters<AuditStore["addEvent"]>[0]["actorRole"];
    detail: string;
  }): Promise<void> {
    const { auditStore } = await storesPromise;
    await auditStore.addEvent(input);
  }

  function clientCanAccessDevice(client: ClientConnection, deviceId: string | undefined): boolean {
    if (!deviceId) {
      return true;
    }
    return client.deviceScope === "*" || client.deviceScope.has(deviceId);
  }

  function serializeForClient(client: ClientConnection, message: RelayToClientMessage): string | null {
    switch (message.type) {
      case "relay.state": {
        const scope = client.deviceScope;
        const agentsForClient = scope === "*"
          ? message.payload.agents
          : message.payload.agents.filter((agent) => scope.has(agent.deviceId));
        return JSON.stringify({
          ...message,
          payload: {
            agents: agentsForClient,
          },
        } satisfies RelayStateMessage);
      }
      case "error":
        return clientCanAccessDevice(client, message.deviceId) ? JSON.stringify(message) : null;
      case "auth.ok":
        return JSON.stringify(message);
      default:
        return clientCanAccessDevice(client, message.deviceId) ? JSON.stringify(message) : null;
    }
  }

  function broadcastToClients(message: RelayToClientMessage): void {
    for (const client of clients) {
      if (client.socket.readyState !== client.socket.OPEN) {
        continue;
      }
      const raw = serializeForClient(client, message);
      if (raw) {
        client.socket.send(raw);
      }
    }
  }

  function sendError(socket: ClientSocket, code: string, message: string, reqId?: string): void {
    if (socket.readyState !== socket.OPEN) {
      return;
    }
    const payload: ErrorMessage = {
      type: "error",
      code,
      message,
      reqId,
    };
    socket.send(JSON.stringify(payload));
  }

  function disconnectClientsByAccessToken(accessToken: string): void {
    for (const client of clients) {
      if (client.accessToken !== accessToken) {
        continue;
      }
      sendError(client.socket, "AUTH_REVOKED", "当前访问令牌已被撤销");
      client.socket.close();
    }
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

  function pruneOutputBuffers(deviceId: string, sessions: Map<string, SessionRecord>): void {
    const prefix = `${deviceId}:`;
    for (const key of outputBuffers.keys()) {
      if (!key.startsWith(prefix)) {
        continue;
      }
      const sid = key.slice(prefix.length);
      if (!sessions.has(sid)) {
        outputBuffers.delete(key);
      }
    }
  }

  function setCachedSessions(deviceId: string, sessions: SessionRecord[]): void {
    const bucket = new Map<string, SessionRecord>();
    for (const session of sessions) {
      bucket.set(session.sid, session);
    }
    sessionCache.set(deviceId, bucket);
    pruneOutputBuffers(deviceId, bucket);
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
    const { sessionStore } = await storesPromise;

    switch (message.type) {
      case "session.list.result":
        setCachedSessions(message.deviceId, message.payload.sessions);
        await sessionStore.replaceSessions(message.deviceId, message.payload.sessions);
        broadcastToClients(message);
        return;
      case "session.created":
        upsertCachedSession(message.payload.session);
        await sessionStore.upsertSession(message.payload.session);
        broadcastToClients(message);
        return;
      case "session.state":
        upsertCachedSession(message.payload.session);
        await sessionStore.upsertSession(message.payload.session);
        broadcastToClients(message);
        return;
      case "session.output":
        pushOutputFrame(message);
        broadcastToClients(message);
        return;
      case "session.exit":
        markCachedSessionExited(message.deviceId, message.sid);
        await sessionStore.markSessionExited(message.deviceId, message.sid);
        broadcastToClients(message);
        return;
      case "error":
        broadcastToClients(message);
    }
  }

  async function handleClientMessage(client: ClientConnection, message: ClientToRelayMessage): Promise<void> {
    if (!clientCanAccessDevice(client, message.deviceId)) {
      sendError(client.socket, "DEVICE_FORBIDDEN", `当前客户端无权访问设备 ${message.deviceId}`, "reqId" in message ? message.reqId : undefined);
      return;
    }

    if (message.type === "session.replay") {
      const key = `${message.deviceId}:${message.sid}`;
      const frames = outputBuffers.get(key)?.frames ?? [];
      for (const frame of frames.filter((item) => item.seq > (message.payload?.afterSeq ?? -1))) {
        client.socket.send(JSON.stringify(frame));
      }
      return;
    }

    if (message.type === "session.list" && !agents.has(message.deviceId)) {
      const { sessionStore } = await storesPromise;
      const cached = sessionCache.get(message.deviceId);
      const sessions = cached ? Array.from(cached.values()) : await sessionStore.listSessions(message.deviceId);
      const payload: SessionListResultMessage = {
        type: "session.list.result",
        reqId: message.reqId,
        deviceId: message.deviceId,
        payload: {
          sessions,
        },
      };
      client.socket.send(JSON.stringify(payload));
      return;
    }

    const agent = agents.get(message.deviceId);
    if (!agent || agent.socket.readyState !== agent.socket.OPEN) {
      sendError(client.socket, "DEVICE_OFFLINE", `设备 ${message.deviceId} 当前不在线`, "reqId" in message ? message.reqId : undefined);
      return;
    }

    if (message.type === "session.create") {
      await appendAuditEvent({
        deviceId: message.deviceId,
        action: "session.create_requested",
        actorRole: "client",
        detail: `请求创建会话 ${message.payload.name?.trim() || "(未命名)"}${message.payload.cwd ? ` @ ${message.payload.cwd}` : ""}`,
      });
    }

    if (message.type === "session.kill") {
      await appendAuditEvent({
        deviceId: message.deviceId,
        action: "session.kill_requested",
        actorRole: "client",
        detail: `请求关闭会话 ${message.sid}`,
      });
    }

    agent.socket.send(JSON.stringify(message));
  }

  await app.register(websocket);

  app.addHook("onRequest", async (request, reply) => {
    reply.header("access-control-allow-origin", "*");
    reply.header("access-control-allow-methods", "GET,POST,OPTIONS");
    reply.header("access-control-allow-headers", "content-type,authorization");
    if (request.method === "OPTIONS") {
      return reply.code(204).send();
    }
  });

  app.addHook("onClose", async () => {
    const { sessionStore } = await storesPromise;
    await sessionStore.close();
  });

  app.get("/health", async () => {
    const { sessionStore } = await storesPromise;
    return {
      ok: true,
      storeMode: sessionStore.mode,
      agentsOnline: agents.size,
      clientsOnline: clients.size,
      webUiReady: existsSync(webDir),
    };
  });

  app.post<{ Body: PairingCodeRequest }>("/api/pairing-codes", async (request, reply) => {
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
    if (token !== config.agentToken) {
      return reply.code(401).send({ message: "agent 认证失败" });
    }

    const deviceId = request.body?.deviceId?.trim();
    if (!deviceId) {
      return reply.code(400).send({ message: "deviceId 不能为空" });
    }
    if (!agents.has(deviceId)) {
      return reply.code(404).send({ message: `设备 ${deviceId} 当前不在线` });
    }

    const { authStore } = await storesPromise;
    const pairing = await authStore.createPairingCode(deviceId, config.pairingTtlMinutes);
    await appendAuditEvent({
      deviceId,
      action: "pairing.code_created",
      actorRole: "agent",
      detail: `创建一次性配对码 ${pairing.pairingCode}，有效期至 ${pairing.expiresAt}`,
    });
    const payload: PairingCodeResponse = {
      deviceId: pairing.deviceId,
      pairingCode: pairing.pairingCode,
      expiresAt: pairing.expiresAt,
    };
    return reply.send(payload);
  });

  app.post<{ Body: PairingRedeemRequest }>("/api/pairings/redeem", async (request, reply) => {
    const pairingCode = request.body?.pairingCode?.trim().toUpperCase();
    if (!pairingCode) {
      return reply.code(400).send({ message: "pairingCode 不能为空" });
    }

    const { authStore } = await storesPromise;
    const grant = await authStore.redeemPairingCode(pairingCode);
    if (!grant) {
      return reply.code(400).send({ message: "配对码无效、已使用或已过期" });
    }
    await appendAuditEvent({
      deviceId: grant.deviceId,
      action: "pairing.redeemed",
      actorRole: "client",
      detail: `使用配对码 ${pairingCode} 兑换访问令牌 ${grant.accessToken.slice(0, 8)}...`,
    });

    const payload: PairingRedeemResponse = {
      deviceId: grant.deviceId,
      accessToken: grant.accessToken,
    };
    return reply.send(payload);
  });

  app.get<{ Params: { deviceId: string } }>("/api/devices/:deviceId/grants", async (request, reply) => {
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
    if (token !== config.agentToken) {
      return reply.code(401).send({ message: "agent 认证失败" });
    }

    const deviceId = request.params.deviceId.trim();
    const { authStore } = await storesPromise;
    const grants = await authStore.listGrants(deviceId);
    return reply.send({
      deviceId,
      grants,
    } satisfies { deviceId: string; grants: ClientGrantRecord[] });
  });

  app.get<{ Params: { deviceId: string }; Querystring: { limit?: string } }>("/api/devices/:deviceId/audit-events", async (request, reply) => {
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
    if (token !== config.agentToken) {
      return reply.code(401).send({ message: "agent 认证失败" });
    }

    const deviceId = request.params.deviceId.trim();
    const requestedLimit = Number(request.query.limit ?? 20);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.floor(requestedLimit), 1), 100)
      : 20;
    const { auditStore } = await storesPromise;
    const events = await auditStore.listEvents(deviceId, limit);
    return reply.send({
      deviceId,
      events,
    } satisfies { deviceId: string; events: AuditEventRecord[] });
  });

  app.delete<{ Params: { deviceId: string; accessToken: string } }>("/api/devices/:deviceId/grants/:accessToken", async (request, reply) => {
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
    if (token !== config.agentToken) {
      return reply.code(401).send({ message: "agent 认证失败" });
    }

    const deviceId = request.params.deviceId.trim();
    const accessToken = request.params.accessToken.trim();
    const { authStore } = await storesPromise;
    const revoked = await authStore.revokeGrant(deviceId, accessToken);
    if (!revoked) {
      return reply.code(404).send({ message: "访问令牌不存在" });
    }
    disconnectClientsByAccessToken(accessToken);
    await appendAuditEvent({
      deviceId,
      action: "grant.revoked",
      actorRole: "agent",
      detail: `撤销访问令牌 ${accessToken.slice(0, 8)}...`,
    });
    return reply.send({ ok: true });
  });

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

      const previousAgent = agents.get(deviceId);
      if (previousAgent && previousAgent.socket !== socket) {
        sendError(previousAgent.socket, "AGENT_REPLACED", `设备 ${deviceId} 已由新的 agent 接管`);
        previousAgent.socket.close();
      }
      agents.set(deviceId, { socket, deviceId });
      socket.send(JSON.stringify({ type: "auth.ok", payload: { role: "agent", deviceId } }));
      broadcastRelayState();

      socket.on("message", (raw) => {
        const current = agents.get(deviceId);
        if (current?.socket !== socket) {
          return;
        }
        const message = parseJsonMessage<AgentToRelayMessage>(raw.toString());
        if (!message) {
          return;
        }
        void handleAgentMessage(message);
      });

      socket.on("close", () => {
        const current = agents.get(deviceId);
        if (current?.socket === socket) {
          agents.delete(deviceId);
        }
        broadcastRelayState();
      });
      return;
    }

    if (role === "client") {
      void (async () => {
        let client: ClientConnection | null = null;
        if (token === config.clientToken) {
          client = {
            socket,
            deviceScope: "*",
          };
        } else if (token) {
          const { authStore } = await storesPromise;
          const grant = await authStore.getGrantByAccessToken(token);
          if (grant) {
            client = {
              socket,
              deviceScope: new Set([grant.deviceId]),
              accessToken: grant.accessToken,
            };
          }
        }

        if (!client) {
          sendError(socket, "AUTH_FAILED", "client 认证失败");
          socket.close();
          return;
        }

        clients.add(client);
        const scopedDeviceId = client.deviceScope === "*" ? undefined : Array.from(client.deviceScope)[0];
        socket.send(JSON.stringify({ type: "auth.ok", payload: { role: "client", deviceId: scopedDeviceId } }));
        const relayState = serializeForClient(client, relayStateMessage());
        if (relayState) {
          socket.send(relayState);
        }

        socket.on("message", (raw) => {
          const message = parseJsonMessage<ClientToRelayMessage>(raw.toString());
          if (!message) {
            return;
          }
          void handleClientMessage(client, message);
        });

        socket.on("close", () => {
          if (client) {
            clients.delete(client);
          }
        });
      })();
      return;
    }

    sendError(socket, "AUTH_FAILED", "未知角色");
    socket.close();
  });

  const serveWebUi = async (requestPath: string, reply: FastifyReply) => {
    if (!existsSync(webDir)) {
      return reply
        .code(503)
        .type("text/plain; charset=utf-8")
        .send("TermPilot Web UI 尚未构建，请先运行 `pnpm build` 或安装已打包版本。");
    }

    const filePath = createStaticPath(webDir, requestPath);
    return reply.type(getMimeType(filePath)).send(createReadStream(filePath));
  };

  app.get("/", async (request, reply) => serveWebUi(request.url, reply));
  app.get("/*", async (request, reply) => serveWebUi(request.url, reply));

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void app.close().finally(() => process.exit(0));
    });
  }

  await app.listen({
    host: config.host,
    port: config.port,
  });

  return app;
}
