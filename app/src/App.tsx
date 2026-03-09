import { useEffect, useMemo, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "xterm";
import "xterm/css/xterm.css";

import type {
  InputKey,
  PairingRedeemResponse,
  RelayToClientMessage,
  SessionRecord,
} from "@termpilot/protocol";
import { createReqId } from "@termpilot/protocol";
import { ConnectionPanel } from "./components/ConnectionPanel";
import { CreateSessionPanel } from "./components/CreateSessionPanel";
import { SessionListPanel } from "./components/SessionListPanel";
import { StatusBadge } from "./components/chrome";
import { TerminalWorkspace } from "./components/TerminalWorkspace";

type SessionMap = Record<string, string>;
type ConnectionPhase = "idle" | "connecting" | "connected" | "reconnecting";
type SessionStatusFilter = "all" | "running" | "exited";
const SHORTCUT_KEYS: Array<{ key: InputKey; label: string }> = [
  { key: "enter", label: "Enter" },
  { key: "tab", label: "Tab" },
  { key: "ctrl_c", label: "Ctrl+C" },
  { key: "ctrl_d", label: "Ctrl+D" },
  { key: "escape", label: "Esc" },
  { key: "arrow_up", label: "↑" },
  { key: "arrow_down", label: "↓" },
  { key: "arrow_left", label: "←" },
  { key: "arrow_right", label: "→" },
];

const DEFAULT_WS_URL = "ws://127.0.0.1:8787/ws";
const DEFAULT_CLIENT_TOKEN = "demo-client-token";
const DEFAULT_DEVICE_ID = "pc-main";
const STORAGE_KEY = "termpilot-app-state";

interface StoredState {
  wsUrl: string;
  clientToken: string;
  deviceId: string;
  activeSid: string | null;
  pinnedSids?: string[];
  notificationsEnabled?: boolean;
}

function getDefaultWsUrl(): string {
  const envUrl = import.meta.env.VITE_RELAY_WS_URL;
  if (envUrl) {
    return envUrl;
  }

  if (typeof window === "undefined") {
    return DEFAULT_WS_URL;
  }

  return `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:8787/ws`;
}

function getRelayHttpBaseUrl(wsUrl: string): string {
  const url = new URL(wsUrl);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export default function App() {
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const terminal = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const manuallyDisconnectedRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const deviceIdRef = useRef(DEFAULT_DEVICE_ID);
  const previousDeviceOnlineRef = useRef(false);
  const previousSessionStatusRef = useRef<Record<string, SessionRecord["status"]>>({});
  const bootstrappedNotificationsRef = useRef(false);

  const [wsUrl, setWsUrl] = useState(getDefaultWsUrl);
  const [clientToken, setClientToken] = useState(DEFAULT_CLIENT_TOKEN);
  const [deviceId, setDeviceId] = useState(DEFAULT_DEVICE_ID);
  const [connectionPhase, setConnectionPhase] = useState<ConnectionPhase>("idle");
  const [deviceOnline, setDeviceOnline] = useState(false);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [buffers, setBuffers] = useState<SessionMap>({});
  const [activeSid, setActiveSid] = useState<string | null>(null);
  const [pinnedSids, setPinnedSids] = useState<string[]>([]);
  const [sessionQuery, setSessionQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<SessionStatusFilter>("all");
  const [pairingCode, setPairingCode] = useState("");
  const [pairingMessage, setPairingMessage] = useState("");
  const [pairingPending, setPairingPending] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [command, setCommand] = useState("");
  const [pasteBuffer, setPasteBuffer] = useState("");
  const [createName, setCreateName] = useState("");
  const [createCwd, setCreateCwd] = useState("");
  const [createShell, setCreateShell] = useState("");

  const activeSession = useMemo(
    () => sessions.find((session) => session.sid === activeSid) ?? null,
    [activeSid, sessions],
  );
  const connected = connectionPhase === "connected";
  const relayHttpBaseUrl = useMemo(() => getRelayHttpBaseUrl(wsUrl), [wsUrl]);
  const filteredSessions = useMemo(() => {
    const query = sessionQuery.trim().toLowerCase();
    return sessions
      .filter((session) => {
        if (statusFilter !== "all" && session.status !== statusFilter) {
          return false;
        }
        if (!query) {
          return true;
        }
        return session.name.toLowerCase().includes(query) || session.cwd.toLowerCase().includes(query);
      })
      .sort((left, right) => {
        const leftPinned = pinnedSids.includes(left.sid);
        const rightPinned = pinnedSids.includes(right.sid);
        if (leftPinned !== rightPinned) {
          return leftPinned ? -1 : 1;
        }
        return right.startedAt.localeCompare(left.startedAt);
      });
  }, [pinnedSids, sessionQuery, sessions, statusFilter]);

  useEffect(() => {
    deviceIdRef.current = deviceId;
  }, [deviceId]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as Partial<StoredState>;
      if (parsed.wsUrl) setWsUrl(parsed.wsUrl);
      if (parsed.clientToken) setClientToken(parsed.clientToken);
      if (parsed.deviceId) setDeviceId(parsed.deviceId);
      if (typeof parsed.activeSid === "string" || parsed.activeSid === null) setActiveSid(parsed.activeSid ?? null);
      if (Array.isArray(parsed.pinnedSids)) setPinnedSids(parsed.pinnedSids.filter((value): value is string => typeof value === "string"));
      if (typeof parsed.notificationsEnabled === "boolean") setNotificationsEnabled(parsed.notificationsEnabled);
    } catch {
      // ignore malformed local state
    }
  }, []);

  useEffect(() => {
    const payload: StoredState = {
      wsUrl,
      clientToken,
      deviceId,
      activeSid,
      pinnedSids,
      notificationsEnabled,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [activeSid, clientToken, deviceId, notificationsEnabled, pinnedSids, wsUrl]);

  useEffect(() => {
    if (!terminalRef.current || terminal.current) {
      return;
    }

    let instance: Terminal | null = null;
    let frameId = 0;
    let fitFrameId = 0;

    frameId = window.requestAnimationFrame(() => {
      if (!terminalRef.current) {
        return;
      }

      instance = new Terminal({
        convertEol: true,
        cursorBlink: true,
        fontFamily: '"SF Mono", "JetBrains Mono", Menlo, monospace',
        fontSize: 13,
        theme: {
          background: "#020617",
          foreground: "#e2e8f0",
          cursor: "#38bdf8",
          black: "#0f172a",
          brightBlack: "#334155",
        },
      });
      const fitAddon = new FitAddon();

      instance.loadAddon(fitAddon);
      instance.open(terminalRef.current);
      terminal.current = instance;
      fitAddonRef.current = fitAddon;
      fitFrameId = window.requestAnimationFrame(() => {
        fitTerminal();
      });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      window.cancelAnimationFrame(fitFrameId);
      instance?.dispose();
      terminal.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!terminalRef.current || !fitAddonRef.current) {
      return;
    }

    const resize = () => {
      if (!terminal.current || !fitTerminal()) {
        return;
      }
      if (!connected || !activeSid) {
        return;
      }
      if (terminal.current.cols === 0 || terminal.current.rows === 0) {
        return;
      }

      sendMessage({
        type: "session.resize",
        reqId: createReqId("resize"),
        deviceId,
        sid: activeSid,
        payload: {
          cols: terminal.current.cols,
          rows: terminal.current.rows,
        },
      });
    };

    const observer = new ResizeObserver(() => resize());
    observer.observe(terminalRef.current);
    resize();

    return () => {
      observer.disconnect();
    };
  }, [activeSid, connected, deviceId]);

  useEffect(() => {
    if (!terminal.current) {
      return;
    }

    terminal.current.clear();
    terminal.current.write((buffers[activeSid ?? ""] ?? "").replace(/\n/g, "\r\n"));
  }, [activeSid, buffers]);

  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      socketRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (connected) {
      requestSessions(deviceIdRef.current);
      if (activeSid) {
        requestReplay(activeSid, deviceIdRef.current);
      }
    }
  }, [activeSid, connected]);

  useEffect(() => {
    const existing = new Set(sessions.map((session) => session.sid));
    setPinnedSids((current) => current.filter((sid) => existing.has(sid)));
  }, [sessions]);

  useEffect(() => {
    const previousDeviceOnline = previousDeviceOnlineRef.current;
    const previousSessionStatus = previousSessionStatusRef.current;
    const nextSessionStatus = Object.fromEntries(sessions.map((session) => [session.sid, session.status]));

    if (bootstrappedNotificationsRef.current && notificationsEnabled && typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted" && document.hidden) {
      if (previousDeviceOnline && !deviceOnline) {
        new Notification("TermPilot", {
          body: `设备 ${deviceId} 已离线`,
        });
      }

      for (const session of sessions) {
        if (previousSessionStatus[session.sid] === "running" && session.status === "exited") {
          new Notification("会话已退出", {
            body: `${session.name} 已结束`,
          });
        }
      }
    }

    previousDeviceOnlineRef.current = deviceOnline;
    previousSessionStatusRef.current = nextSessionStatus;
    bootstrappedNotificationsRef.current = true;
  }, [deviceId, deviceOnline, notificationsEnabled, sessions]);

  function fitTerminal(): boolean {
    if (!fitAddonRef.current || !terminal.current || !terminalRef.current) {
      return false;
    }
    if (terminalRef.current.clientWidth === 0 || terminalRef.current.clientHeight === 0) {
      return false;
    }

    try {
      fitAddonRef.current.fit();
      return true;
    } catch {
      return false;
    }
  }

  function sendMessage(message: unknown): void {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    socket.send(JSON.stringify(message));
  }

  function requestSessions(deviceIdOverride?: string): void {
    sendMessage({
      type: "session.list",
      reqId: createReqId("list"),
      deviceId: deviceIdOverride ?? deviceIdRef.current,
    });
  }

  function requestReplay(sid: string, deviceIdOverride?: string): void {
    sendMessage({
      type: "session.replay",
      reqId: createReqId("replay"),
      deviceId: deviceIdOverride ?? deviceIdRef.current,
      sid,
      payload: {
        afterSeq: -1,
      },
    });
  }

  function scheduleReconnect(): void {
    if (manuallyDisconnectedRef.current) {
      return;
    }
    const attempt = reconnectAttemptRef.current + 1;
    reconnectAttemptRef.current = attempt;
    const delayMs = Math.min(1000 * 2 ** Math.min(attempt, 4), 12000);
    setConnectionPhase("reconnecting");
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      connect(false);
    }, delayMs);
  }

  function stopReconnectLoop(): void {
    manuallyDisconnectedRef.current = true;
    reconnectAttemptRef.current = 0;
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }

  function disconnect(): void {
    stopReconnectLoop();
    socketRef.current?.close();
    socketRef.current = null;
    setConnectionPhase("idle");
    setDeviceOnline(false);
  }

  function clearBinding(): void {
    disconnect();
    setClientToken("");
    setDeviceId(DEFAULT_DEVICE_ID);
    setActiveSid(null);
    setSessions([]);
    setBuffers({});
    setPairingMessage("已清除本机保存的访问令牌，请重新配对。");
    previousDeviceOnlineRef.current = false;
    previousSessionStatusRef.current = {};
    bootstrappedNotificationsRef.current = false;
  }

  function togglePinnedSession(sid: string): void {
    setPinnedSids((current) => current.includes(sid) ? current.filter((item) => item !== sid) : [sid, ...current]);
  }

  async function toggleNotifications(): Promise<void> {
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      setPairingMessage("已关闭浏览器提醒。");
      return;
    }

    if (typeof window === "undefined" || !("Notification" in window)) {
      setPairingMessage("当前浏览器不支持通知。");
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      setNotificationsEnabled(true);
      setPairingMessage("已开启浏览器提醒。页面在后台时，会在会话退出或设备离线时提醒。");
      return;
    }

    setNotificationsEnabled(false);
    setPairingMessage("通知权限未开启。");
  }

  function connect(resetManual = true, tokenOverride?: string): void {
    if (resetManual) {
      manuallyDisconnectedRef.current = false;
      reconnectAttemptRef.current = 0;
    }

    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    socketRef.current?.close();
    setConnectionPhase(resetManual ? "connecting" : "reconnecting");

    const url = new URL(wsUrl);
    url.searchParams.set("role", "client");
    url.searchParams.set("token", tokenOverride ?? clientToken);

    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      if (socketRef.current !== socket) {
        return;
      }
      reconnectAttemptRef.current = 0;
      setConnectionPhase("connected");
    });

    socket.addEventListener("close", () => {
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      if (socketRef.current !== null && socketRef.current !== socket) {
        return;
      }
      setConnectionPhase((current) => (manuallyDisconnectedRef.current ? "idle" : current));
      setDeviceOnline(false);
      if (!manuallyDisconnectedRef.current) {
        scheduleReconnect();
      }
    });

    socket.addEventListener("message", (event) => {
      if (socketRef.current !== socket) {
        return;
      }
      const message = JSON.parse(event.data) as RelayToClientMessage;

      switch (message.type) {
        case "auth.ok":
          {
            const nextDeviceId = message.payload.deviceId ?? deviceIdRef.current;
            const previousDeviceId = deviceIdRef.current;
            deviceIdRef.current = nextDeviceId;
            if (nextDeviceId !== previousDeviceId) {
              setSessions([]);
              setBuffers({});
              setActiveSid(null);
            }
            if (message.payload.deviceId) {
              setDeviceId(message.payload.deviceId);
            }
            requestSessions(nextDeviceId);
            if (activeSid) {
              requestReplay(activeSid, nextDeviceId);
            }
          }
          return;
        case "relay.state":
          setDeviceOnline(message.payload.agents.some((agent) => agent.deviceId === deviceIdRef.current && agent.online));
          return;
        case "session.list.result":
          if (message.deviceId !== deviceIdRef.current) {
            return;
          }
          setSessions(message.payload.sessions);
          setBuffers((current) => {
            const nextBuffers: SessionMap = {};
            for (const session of message.payload.sessions) {
              if (current[session.sid]) {
                nextBuffers[session.sid] = current[session.sid];
              }
            }
            return nextBuffers;
          });
          setActiveSid((current) => {
            const next = current && message.payload.sessions.some((session) => session.sid === current)
              ? current
              : message.payload.sessions[0]?.sid ?? null;
            if (next) {
              requestReplay(next, deviceIdRef.current);
            }
            return next;
          });
          return;
        case "session.created":
        case "session.state": {
          const session = message.payload.session;
          if (session.deviceId !== deviceIdRef.current) {
            return;
          }
          setSessions((current) => {
            const next = current.filter((item) => item.sid !== session.sid);
            next.push(session);
            next.sort((left, right) => right.startedAt.localeCompare(left.startedAt));
            return next;
          });
          setActiveSid((current) => current ?? session.sid);
          return;
        }
        case "session.output":
          if (message.deviceId !== deviceIdRef.current) {
            return;
          }
          setBuffers((current) => ({ ...current, [message.sid]: message.payload.data }));
          return;
        case "session.exit":
          if (message.deviceId !== deviceIdRef.current) {
            return;
          }
          setSessions((current) =>
            current.map((session) =>
              session.sid === message.sid ? { ...session, status: "exited" } : session,
            ),
          );
          return;
        case "error":
          if (message.code === "AUTH_FAILED" || message.code === "AUTH_REVOKED") {
            stopReconnectLoop();
            setConnectionPhase("idle");
            setDeviceOnline(false);
            if (message.code === "AUTH_REVOKED") {
              setClientToken("");
            }
            setPairingMessage(message.message);
            socket.close();
            return;
          }
          window.alert(message.message);
      }
    });
  }

  async function handleRedeemPairingCode(): Promise<void> {
    const code = pairingCode.trim().toUpperCase();
    if (!code) {
      setPairingMessage("请先输入配对码。");
      return;
    }

    setPairingPending(true);
    setPairingMessage("");
    try {
      const response = await fetch(`${relayHttpBaseUrl}/api/pairings/redeem`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ pairingCode: code }),
      });

      const payload = await response.json().catch(() => null) as PairingRedeemResponse | { message?: string } | null;
      if (!response.ok || !payload || !("accessToken" in payload)) {
        const message = payload && "message" in payload && payload.message ? payload.message : "配对失败";
        throw new Error(message);
      }

      setSessions([]);
      setBuffers({});
      setActiveSid(null);
      setDeviceId(payload.deviceId);
      setClientToken(payload.accessToken);
      setPairingCode("");
      setPairingMessage(`已绑定设备 ${payload.deviceId}，现在可以直接连接。`);
      connect(true, payload.accessToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : "配对失败";
      setPairingMessage(message);
    } finally {
      setPairingPending(false);
    }
  }

  function handleCreateSession(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!connected) {
      setPairingMessage("当前未连接 relay，无法创建会话。");
      return;
    }
    sendMessage({
      type: "session.create",
      reqId: createReqId("create"),
      deviceId,
      payload: {
        name: createName || undefined,
        cwd: createCwd || undefined,
        shell: createShell || undefined,
      },
    });
    setCreateName("");
  }

  function handleSendCommand(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!activeSid || !command.trim()) {
      return;
    }

    sendMessage({
      type: "session.input",
      reqId: createReqId("input"),
      deviceId,
      sid: activeSid,
      payload: {
        text: `${command}\n`,
      },
    });
    setCommand("");
  }

  function handleSendPaste(mode: "raw" | "line"): void {
    if (!activeSid || !pasteBuffer) {
      return;
    }

    sendMessage({
      type: "session.input",
      reqId: createReqId("paste"),
      deviceId,
      sid: activeSid,
      payload: {
        text: mode === "line" ? `${pasteBuffer}\n` : pasteBuffer,
      },
    });
    setPasteBuffer("");
  }

  function sendKey(key: InputKey): void {
    if (!activeSid) {
      return;
    }

    sendMessage({
      type: "session.input",
      reqId: createReqId("key"),
      deviceId,
      sid: activeSid,
      payload: {
        key,
      },
    });
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-5 px-4 py-5 text-slate-100 sm:px-6 lg:px-8">
      <header className="rounded-3xl border border-slate-800/80 bg-slate-900/70 p-5 shadow-2xl shadow-slate-950/40 backdrop-blur">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-300">TermPilot</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">手机查看和控制 tmux 会话</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              浏览器直接打开可用，安卓和 iPhone 都走同一套 PWA 页面。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <StatusBadge
              active={connected}
              label={
                connectionPhase === "reconnecting"
                  ? "正在重连"
                  : connected
                    ? "已连接 Relay"
                    : connectionPhase === "connecting"
                      ? "连接中"
                      : "Relay 未连接"
              }
            />
            <StatusBadge active={deviceOnline} label={deviceOnline ? "设备在线" : "设备离线"} />
          </div>
        </div>
      </header>

      <section className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-5">
          <ConnectionPanel
            wsUrl={wsUrl}
            clientToken={clientToken}
            deviceId={deviceId}
            pairingCode={pairingCode}
            pairingMessage={pairingMessage}
            pairingPending={pairingPending}
            connectionPhase={connectionPhase}
            notificationsEnabled={notificationsEnabled}
            onWsUrlChange={setWsUrl}
            onClientTokenChange={setClientToken}
            onDeviceIdChange={setDeviceId}
            onPairingCodeChange={setPairingCode}
            onRedeemPairingCode={() => {
              void handleRedeemPairingCode();
            }}
            onConnect={() => connect(true)}
            onRefresh={() => requestSessions(deviceIdRef.current)}
            onDisconnect={disconnect}
            onClearBinding={clearBinding}
            onToggleNotifications={() => {
              void toggleNotifications();
            }}
          />

          <CreateSessionPanel
            connected={connected}
            createName={createName}
            createCwd={createCwd}
            createShell={createShell}
            onCreateNameChange={setCreateName}
            onCreateCwdChange={setCreateCwd}
            onCreateShellChange={setCreateShell}
            onSubmit={handleCreateSession}
          />

          <SessionListPanel
            sessions={sessions}
            filteredSessions={filteredSessions}
            activeSid={activeSid}
            pinnedSids={pinnedSids}
            sessionQuery={sessionQuery}
            statusFilter={statusFilter}
            onSessionQueryChange={setSessionQuery}
            onStatusFilterChange={setStatusFilter}
            onTogglePinnedSession={togglePinnedSession}
            onSelectSession={(sid) => {
              setActiveSid(sid);
              requestReplay(sid, deviceIdRef.current);
            }}
            onKillSession={(sid) => {
              sendMessage({
                type: "session.kill",
                reqId: createReqId("kill"),
                deviceId,
                sid,
              });
            }}
          />
        </div>

        <TerminalWorkspace
          activeSession={activeSession}
          activeSid={activeSid}
          connected={connected}
          command={command}
          pasteBuffer={pasteBuffer}
          shortcutKeys={SHORTCUT_KEYS}
          terminalRef={terminalRef}
          onCommandChange={setCommand}
          onSubmitCommand={handleSendCommand}
          onPasteBufferChange={setPasteBuffer}
          onSendPaste={handleSendPaste}
          onSendKey={sendKey}
        />
      </section>
    </main>
  );
}
