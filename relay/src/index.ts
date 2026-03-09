import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";

import { WebSocketServer, type WebSocket } from "ws";

import type {
  AgentToRelayMessage,
  ClientToRelayMessage,
  ErrorMessage,
  RelayStateMessage,
  RelayToClientMessage,
  SessionExitMessage,
  SessionListResultMessage,
  SessionOutputMessage,
  SessionRecord,
  SessionStateMessage,
} from "../../shared/protocol";
import {
  DEFAULT_AGENT_TOKEN,
  DEFAULT_CLIENT_TOKEN,
  isRecord,
  parseJsonMessage,
} from "../../shared/protocol";

interface ClientConnection {
  socket: WebSocket;
  role: "client";
}

interface AgentConnection {
  socket: WebSocket;
  role: "agent";
  deviceId: string;
}

interface OutputBuffer {
  frames: SessionOutputMessage[];
}

const port = Number(process.env.PORT ?? 8787);
const agentToken = process.env.TERMPILOT_AGENT_TOKEN ?? DEFAULT_AGENT_TOKEN;
const clientToken = process.env.TERMPILOT_CLIENT_TOKEN ?? DEFAULT_CLIENT_TOKEN;

const agents = new Map<string, AgentConnection>();
const clients = new Set<ClientConnection>();
const sessionCache = new Map<string, Map<string, SessionRecord>>();
const outputBuffers = new Map<string, OutputBuffer>();

function getAppRoot(): string {
  const candidates = [
    path.resolve(__dirname, "../../app"),
    path.resolve(__dirname, "../../../app"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

function getContentType(filePath: string): string {
  const extension = path.extname(filePath);
  switch (extension) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    default:
      return "text/plain; charset=utf-8";
  }
}

function broadcastToClients(message: RelayToClientMessage): void {
  const serialized = JSON.stringify(message);
  for (const client of clients) {
    if (client.socket.readyState === client.socket.OPEN) {
      client.socket.send(serialized);
    }
  }
}

function sendError(socket: WebSocket, code: string, message: string, reqId?: string): void {
  const payload: ErrorMessage = {
    type: "error",
    code,
    message,
    reqId,
  };
  socket.send(JSON.stringify(payload));
}

function broadcastRelayState(): void {
  const message: RelayStateMessage = {
    type: "relay.state",
    payload: {
      agents: Array.from(agents.keys()).map((deviceId) => ({
        deviceId,
        online: true,
      })),
    },
  };
  broadcastToClients(message);
}

function updateSessionCache(deviceId: string, sessions: SessionRecord[]): void {
  const cache = new Map<string, SessionRecord>();
  for (const session of sessions) {
    cache.set(session.sid, session);
  }
  sessionCache.set(deviceId, cache);
}

function upsertCachedSession(session: SessionRecord): void {
  const cache = sessionCache.get(session.deviceId) ?? new Map<string, SessionRecord>();
  cache.set(session.sid, session);
  sessionCache.set(session.deviceId, cache);
}

function markCachedSessionExited(deviceId: string, sid: string): void {
  const cache = sessionCache.get(deviceId);
  if (!cache) {
    return;
  }

  const session = cache.get(sid);
  if (!session) {
    return;
  }

  cache.set(sid, {
    ...session,
    status: "exited",
    lastActivityAt: new Date().toISOString(),
  });
}

function pushOutputFrame(frame: SessionOutputMessage): void {
  const key = `${frame.deviceId}:${frame.sid}`;
  const current = outputBuffers.get(key) ?? { frames: [] };
  current.frames.push(frame);
  current.frames = current.frames.slice(-40);
  outputBuffers.set(key, current);
}

function handleAgentMessage(message: AgentToRelayMessage): void {
  switch (message.type) {
    case "session.list.result":
      updateSessionCache(message.deviceId, message.payload.sessions);
      broadcastToClients(message);
      return;
    case "session.created":
      upsertCachedSession(message.payload.session);
      broadcastToClients(message);
      return;
    case "session.state":
      upsertCachedSession(message.payload.session);
      broadcastToClients(message);
      return;
    case "session.output":
      pushOutputFrame(message);
      broadcastToClients(message);
      return;
    case "session.exit":
      markCachedSessionExited(message.deviceId, message.sid);
      broadcastToClients(message);
      return;
    case "error":
      broadcastToClients(message);
      return;
  }
}

function handleClientMessage(socket: WebSocket, message: ClientToRelayMessage): void {
  if (message.type === "session.replay") {
    const key = `${message.deviceId}:${message.sid}`;
    const buffer = outputBuffers.get(key);
    const frames = buffer?.frames ?? [];
    const filteredFrames = frames.filter((frame) => frame.seq > (message.payload?.afterSeq ?? -1));
    for (const frame of filteredFrames) {
      socket.send(JSON.stringify(frame));
    }
    return;
  }

  if (message.type === "session.list" && !agents.has(message.deviceId)) {
    const sessions = Array.from(sessionCache.get(message.deviceId)?.values() ?? []);
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

  const agent = agents.get(message.deviceId);
  if (!agent || agent.socket.readyState !== agent.socket.OPEN) {
    sendError(socket, "DEVICE_OFFLINE", `设备 ${message.deviceId} 当前不在线`, "reqId" in message ? message.reqId : undefined);
    return;
  }

  agent.socket.send(JSON.stringify(message));
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
  const appRoot = getAppRoot();

  if (url.pathname === "/health") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  const relativePath = url.pathname === "/" ? "/index.html" : url.pathname;
  const resolvedPath = path.normalize(path.join(appRoot, relativePath));

  if (!resolvedPath.startsWith(appRoot) || !existsSync(resolvedPath) || !statSync(resolvedPath).isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not Found");
    return;
  }

  response.writeHead(200, { "content-type": getContentType(resolvedPath) });
  response.end(readFileSync(resolvedPath));
});

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (socket, request) => {
  const url = new URL(request.url ?? "/ws", `http://${request.headers.host ?? "127.0.0.1"}`);
  const role = url.searchParams.get("role");
  const token = url.searchParams.get("token");
  const deviceId = url.searchParams.get("deviceId") ?? undefined;

  if (role === "agent") {
    if (token !== agentToken || !deviceId) {
      sendError(socket, "AUTH_FAILED", "agent 认证失败");
      socket.close();
      return;
    }

    const agentConnection: AgentConnection = {
      socket,
      role: "agent",
      deviceId,
    };

    agents.set(deviceId, agentConnection);
    socket.send(
      JSON.stringify({
        type: "auth.ok",
        payload: {
          role: "agent",
          deviceId,
        },
      }),
    );
    broadcastRelayState();

    socket.on("message", (raw) => {
      const message = parseJsonMessage<AgentToRelayMessage>(raw.toString("utf8"));
      if (!message) {
        return;
      }
      handleAgentMessage(message);
    });

    socket.on("close", () => {
      agents.delete(deviceId);
      broadcastRelayState();
    });

    return;
  }

  if (role === "client") {
    if (token !== clientToken) {
      sendError(socket, "AUTH_FAILED", "client 认证失败");
      socket.close();
      return;
    }

    const clientConnection: ClientConnection = {
      socket,
      role: "client",
    };

    clients.add(clientConnection);
    socket.send(
      JSON.stringify({
        type: "auth.ok",
        payload: {
          role: "client",
        },
      }),
    );
    broadcastRelayState();

    socket.on("message", (raw) => {
      const message = parseJsonMessage<ClientToRelayMessage>(raw.toString("utf8"));
      if (!message || !isRecord(message)) {
        return;
      }
      handleClientMessage(socket, message);
    });

    socket.on("close", () => {
      clients.delete(clientConnection);
    });

    return;
  }

  sendError(socket, "AUTH_FAILED", "未知角色");
  socket.close();
});

server.listen(port, () => {
  console.log(`TermPilot relay 已启动: http://127.0.0.1:${port}`);
});
