import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { Pool } from "pg";
import type { DatabaseSync } from "node:sqlite";

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
  RelayToAgentMessage,
} from "@termpilot/protocol";
import { DEFAULT_CLIENT_TOKEN, parseJsonMessage } from "@termpilot/protocol";
import packageJson from "../../package.json";

import { MemoryAuthStore, PostgresAuthStore, SqliteAuthStore, type AuthStore } from "./auth-store.js";
import { MemoryAuditStore, PostgresAuditStore, SqliteAuditStore, type AuditStore } from "./audit-store.js";
import { loadConfig, type RelayConfig } from "./config.js";
import { openRelaySqliteDatabase } from "./sqlite-db.js";

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

function createStaticPath(webDir: string, urlPath: string): string | null {
  const requestPath = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  const relativePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const resolvedPath = path.resolve(webDir, relativePath);
  const hasExplicitExtension = path.extname(relativePath) !== "";
  if (!resolvedPath.startsWith(path.resolve(webDir))) {
    return hasExplicitExtension ? null : path.join(webDir, "index.html");
  }
  if (!existsSync(resolvedPath)) {
    return hasExplicitExtension ? null : path.join(webDir, "index.html");
  }
  try {
    if (statSync(resolvedPath).isDirectory()) {
      return path.join(webDir, "index.html");
    }
  } catch {
    return hasExplicitExtension ? null : path.join(webDir, "index.html");
  }
  return resolvedPath;
}

export function resolveDefaultWebDir(moduleUrl: string): string {
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
  const webDir = options.webDir ?? resolveDefaultWebDir(import.meta.url);
  const storeMode = config.storeMode;
  const appVersion = process.env.TERMPILOT_APP_VERSION?.trim() || packageJson.version;
  const appBuild = process.env.TERMPILOT_APP_BUILD_ID?.trim() || appVersion;
  let pool: Pool | null = null;
  let sqliteDatabase: DatabaseSync | null = null;

  if ((process.env.TERMPILOT_CLIENT_TOKEN ?? "").trim() === DEFAULT_CLIENT_TOKEN) {
    app.log.warn("检测到 TERMPILOT_CLIENT_TOKEN 仍为默认 demo-client-token。出于隔离安全考虑，relay 已自动禁用全局客户端访问令牌。");
  }
  if (config.clientToken) {
    app.log.warn("TERMPILOT_CLIENT_TOKEN 已不再支持。当前安全模型要求通过设备配对建立端到端密钥。");
  }

  const storesPromise: Promise<{ authStore: AuthStore; auditStore: AuditStore }> = (async () => {
    if (storeMode === "memory") {
      app.log.warn("当前 relay 使用内存存储授权与审计元数据；重启后服务端元数据会丢失。");
      const authStore = new MemoryAuthStore();
      const auditStore = new MemoryAuditStore();
      await authStore.init();
      await auditStore.init();
      return { authStore, auditStore };
    }

    if (storeMode === "sqlite") {
      sqliteDatabase = openRelaySqliteDatabase(config.sqlitePath!);
      const authStore = new SqliteAuthStore(sqliteDatabase);
      const auditStore = new SqliteAuditStore(sqliteDatabase);
      await authStore.init();
      await auditStore.init();
      app.log.info(`relay 已连接 SQLite: ${config.sqlitePath}，当前仅持久化配对、授权与审计元数据。`);
      return { authStore, auditStore };
    }

    pool = new Pool({ connectionString: config.databaseUrl });
    const authStore = new PostgresAuthStore(pool);
    const auditStore = new PostgresAuditStore(pool);
    await authStore.init();
    await auditStore.init();
    app.log.info("relay 已连接 PostgreSQL，当前仅持久化配对、授权与审计元数据。");
    return { authStore, auditStore };
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
      case "secure.agent":
        return client.accessToken === message.accessToken && clientCanAccessDevice(client, message.deviceId)
          ? JSON.stringify(message)
          : null;
      default:
        return null;
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

  function sendToAgent(deviceId: string, message: RelayToAgentMessage): boolean {
    const agent = agents.get(deviceId);
    if (!agent || agent.socket.readyState !== agent.socket.OPEN) {
      return false;
    }
    agent.socket.send(JSON.stringify(message));
    return true;
  }

  function sendError(socket: ClientSocket, code: string, message: string, reqId?: string, deviceId?: string): void {
    if (socket.readyState !== socket.OPEN) {
      return;
    }
    const payload: ErrorMessage = {
      type: "error",
      code,
      message,
      reqId,
      deviceId,
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

  async function handleAgentMessage(message: AgentToRelayMessage): Promise<void> {
    switch (message.type) {
      case "secure.agent":
        broadcastToClients(message);
        return;
      case "error":
        broadcastToClients(message);
    }
  }

  async function handleClientMessage(client: ClientConnection, message: ClientToRelayMessage): Promise<void> {
    if (!clientCanAccessDevice(client, message.deviceId)) {
      sendError(client.socket, "DEVICE_FORBIDDEN", `当前客户端无权访问设备 ${message.deviceId}`, message.reqId, message.deviceId);
      return;
    }

    if (!client.accessToken) {
      sendError(client.socket, "E2EE_REQUIRED", "当前客户端未绑定端到端密钥，请重新配对后再访问会话。", message.reqId, message.deviceId);
      return;
    }
    if (message.accessToken && message.accessToken !== client.accessToken) {
      sendError(client.socket, "AUTH_FAILED", "消息里的访问令牌与当前连接不匹配。", message.reqId, message.deviceId);
      return;
    }

    const forwarded: RelayToAgentMessage = {
      ...message,
      accessToken: client.accessToken,
    };

    if (!sendToAgent(message.deviceId, forwarded)) {
      sendError(client.socket, "DEVICE_OFFLINE", `设备 ${message.deviceId} 当前不在线`, message.reqId, message.deviceId);
    }
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
    if (pool) {
      await pool.end();
    }
    sqliteDatabase?.close();
  });

  app.get("/health", async () => ({
    ok: true,
    appVersion,
    appBuild,
    storeMode,
    agentsOnline: agents.size,
    clientsOnline: clients.size,
    webUiReady: existsSync(webDir),
    adminClientTokenEnabled: false,
    security: {
      relayStoresSessionContent: false,
      endToEndEncryptionRequiredForPairedClients: true,
    },
  }));

  app.post<{ Body: PairingCodeRequest }>("/api/pairing-codes", async (request, reply) => {
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
    if (token !== config.agentToken) {
      return reply.code(401).send({ message: "agent 认证失败" });
    }

    const deviceId = request.body?.deviceId?.trim();
    const agentPublicKey = request.body?.agentPublicKey?.trim();
    if (!deviceId) {
      return reply.code(400).send({ message: "deviceId 不能为空" });
    }
    if (!agentPublicKey) {
      return reply.code(400).send({ message: "agentPublicKey 不能为空" });
    }
    if (!agents.has(deviceId)) {
      return reply.code(404).send({ message: `设备 ${deviceId} 当前不在线` });
    }

    const { authStore } = await storesPromise;
    const pairing = await authStore.createPairingCode(deviceId, config.pairingTtlMinutes, agentPublicKey);
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
    const clientPublicKey = request.body?.clientPublicKey?.trim();
    if (!pairingCode) {
      return reply.code(400).send({ message: "pairingCode 不能为空" });
    }
    if (!clientPublicKey) {
      return reply.code(400).send({ message: "浏览器未初始化本地配对密钥，请刷新页面后重试。" });
    }

    const { authStore } = await storesPromise;
    const grant = await authStore.redeemPairingCode(pairingCode, clientPublicKey);
    if (!grant) {
      return reply.code(400).send({ message: "配对码无效、已使用、已过期，或设备端到端密钥未就绪" });
    }
    await appendAuditEvent({
      deviceId: grant.deviceId,
      action: "pairing.redeemed",
      actorRole: "client",
      detail: `使用配对码 ${pairingCode} 完成端到端密钥绑定，并签发访问令牌 ${grant.accessToken.slice(0, 8)}...`,
    });

    const payload: PairingRedeemResponse = {
      deviceId: grant.deviceId,
      accessToken: grant.accessToken,
      agentPublicKey: grant.agentPublicKey,
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
        sendError(previousAgent.socket, "AGENT_REPLACED", `设备 ${deviceId} 已由新的 agent 接管`, undefined, deviceId);
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
        if (config.clientToken && token === config.clientToken) {
          sendError(socket, "AUTH_FAILED", "全局 client token 已停用，请改用设备配对建立访问令牌。");
          socket.close();
          return;
        } else if (token) {
          const { authStore } = await storesPromise;
          const grant = await authStore.getGrantByAccessToken(token);
          if (grant) {
            if (!grant.clientPublicKey) {
              sendError(socket, "AUTH_FAILED", "该访问令牌缺少端到端密钥绑定，请重新配对。", undefined, grant.deviceId);
              socket.close();
              return;
            }
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

  app.get("/*", async (request, reply) => {
    const filePath = createStaticPath(webDir, request.raw.url ?? "/");
    if (!filePath) {
      reply.raw.setHeader("cache-control", "no-store");
      return reply.code(404).send({ message: "Not Found" });
    }
    if (path.extname(filePath).toLowerCase() === ".html") {
      reply.raw.setHeader("cache-control", "no-store, must-revalidate");
    } else {
      reply.raw.setHeader("cache-control", "public, max-age=31536000, immutable");
    }
    reply.header("content-type", getMimeType(filePath));
    return reply.send(createReadStream(filePath));
  });

  const host = config.host;
  const port = config.port;
  await app.listen({ host, port });
  app.log.info(`relay listening on http://${host}:${port}`);

  return app;
}
