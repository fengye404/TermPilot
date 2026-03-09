import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "xterm";

import type {
  InputKey,
  PairingRedeemResponse,
  RelayToClientMessage,
  SessionRecord,
} from "@termpilot/protocol";
import { createReqId } from "@termpilot/protocol";

type SessionMap = Record<string, string>;
type ConnectionPhase = "idle" | "connecting" | "connected" | "reconnecting";
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

  const [wsUrl, setWsUrl] = useState(getDefaultWsUrl);
  const [clientToken, setClientToken] = useState(DEFAULT_CLIENT_TOKEN);
  const [deviceId, setDeviceId] = useState(DEFAULT_DEVICE_ID);
  const [connectionPhase, setConnectionPhase] = useState<ConnectionPhase>("idle");
  const [deviceOnline, setDeviceOnline] = useState(false);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [buffers, setBuffers] = useState<SessionMap>({});
  const [activeSid, setActiveSid] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState("");
  const [pairingMessage, setPairingMessage] = useState("");
  const [pairingPending, setPairingPending] = useState(false);
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
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [activeSid, clientToken, deviceId, wsUrl]);

  useEffect(() => {
    if (!terminalRef.current || terminal.current) {
      return;
    }

    const instance = new Terminal({
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
    fitAddon.fit();
    terminal.current = instance;
    fitAddonRef.current = fitAddon;

    return () => {
      instance.dispose();
      terminal.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!terminalRef.current || !fitAddonRef.current) {
      return;
    }

    const resize = () => {
      if (!fitAddonRef.current || !terminal.current) {
        return;
      }

      fitAddonRef.current.fit();
      if (!connected || !activeSid) {
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
      requestSessions();
      if (activeSid) {
        requestReplay(activeSid);
      }
    }
  }, [activeSid, connected]);

  function sendMessage(message: unknown): void {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    socket.send(JSON.stringify(message));
  }

  function requestSessions(): void {
    sendMessage({
      type: "session.list",
      reqId: createReqId("list"),
      deviceId,
    });
  }

  function requestReplay(sid: string): void {
    sendMessage({
      type: "session.replay",
      reqId: createReqId("replay"),
      deviceId,
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

  function disconnect(): void {
    manuallyDisconnectedRef.current = true;
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
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
      reconnectAttemptRef.current = 0;
      setConnectionPhase("connected");
      requestSessions();
    });

    socket.addEventListener("close", () => {
      setConnectionPhase((current) => (manuallyDisconnectedRef.current ? "idle" : current));
      setDeviceOnline(false);
      if (!manuallyDisconnectedRef.current) {
        scheduleReconnect();
      }
    });

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data) as RelayToClientMessage;

      switch (message.type) {
        case "auth.ok":
          if (message.payload.deviceId) {
            setDeviceId(message.payload.deviceId);
          }
          return;
        case "relay.state":
          setDeviceOnline(message.payload.agents.some((agent) => agent.deviceId === deviceId && agent.online));
          return;
        case "session.list.result":
          if (message.deviceId !== deviceId) {
            return;
          }
          setSessions(message.payload.sessions);
          setActiveSid((current) => {
            const next = current ?? message.payload.sessions[0]?.sid ?? null;
            if (next) {
              requestReplay(next);
            }
            return next;
          });
          return;
        case "session.created":
        case "session.state": {
          const session = message.payload.session;
          if (session.deviceId !== deviceId) {
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
          if (message.deviceId !== deviceId) {
            return;
          }
          setBuffers((current) => ({ ...current, [message.sid]: message.payload.data }));
          return;
        case "session.exit":
          if (message.deviceId !== deviceId) {
            return;
          }
          setSessions((current) =>
            current.map((session) =>
              session.sid === message.sid ? { ...session, status: "exited" } : session,
            ),
          );
          return;
        case "error":
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
          <Panel title="连接">
            <div className="space-y-3">
              <Field label="WebSocket 地址" value={wsUrl} onChange={setWsUrl} />
              <Field label="访问令牌" value={clientToken} onChange={setClientToken} />
              <Field label="设备 ID" value={deviceId} onChange={setDeviceId} />
              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3">
                <p className="text-sm font-medium text-white">设备配对</p>
                <p className="mt-1 text-xs text-slate-500">
                  电脑上执行 `pnpm agent:pair` 获取一次性配对码，手机输入后会自动换取设备访问令牌。
                </p>
                <div className="mt-3 flex gap-3">
                  <input
                    className="flex-1 rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm uppercase outline-none placeholder:text-slate-500"
                    value={pairingCode}
                    onChange={(event) => setPairingCode(event.target.value)}
                    placeholder="ABC-234"
                  />
                  <button
                    className="rounded-full bg-emerald-400 px-4 py-3 text-sm font-medium text-slate-950 disabled:opacity-60"
                    type="button"
                    disabled={pairingPending}
                    onClick={() => {
                      void handleRedeemPairingCode();
                    }}
                  >
                    {pairingPending ? "配对中" : "配对"}
                  </button>
                </div>
                {pairingMessage ? <p className="mt-2 text-xs text-slate-400">{pairingMessage}</p> : null}
              </div>
              <div className="flex gap-3">
                <button
                  className="flex-1 rounded-full bg-sky-500 px-4 py-2.5 text-sm font-medium text-slate-950 disabled:opacity-60"
                  disabled={connectionPhase === "connecting"}
                  onClick={() => connect(true)}
                >
                  {connected ? "重新连接" : connectionPhase === "connecting" ? "连接中" : "连接"}
                </button>
                <button className="rounded-full border border-slate-700 px-4 py-2.5 text-sm text-slate-200" onClick={requestSessions}>
                  刷新
                </button>
                <button className="rounded-full border border-slate-700 px-4 py-2.5 text-sm text-slate-200" onClick={disconnect}>
                  断开
                </button>
              </div>
              <button
                className="w-full rounded-full border border-rose-500/40 px-4 py-2.5 text-sm text-rose-200"
                type="button"
                onClick={clearBinding}
              >
                清除本机绑定
              </button>
              <p className="text-xs text-slate-500">
                断线后会自动重连。连接参数、访问令牌和最近查看的会话会保存在本机浏览器里。
              </p>
            </div>
          </Panel>

          <Panel title="创建会话">
            <form className="space-y-3" onSubmit={handleCreateSession}>
              <Field label="名称" value={createName} onChange={setCreateName} placeholder="claude-main" />
              <Field label="工作目录" value={createCwd} onChange={setCreateCwd} placeholder="/Users/..." />
              <Field label="Shell" value={createShell} onChange={setCreateShell} placeholder="/bin/zsh" />
              <button className="w-full rounded-full bg-emerald-400 px-4 py-2.5 text-sm font-medium text-slate-950" type="submit">
                创建
              </button>
            </form>
          </Panel>

          <Panel title="会话列表">
            <div className="space-y-2">
              {sessions.length === 0 ? (
                <p className="text-sm text-slate-400">当前没有会话。</p>
              ) : (
                sessions.map((session) => (
                  <div
                    key={session.sid}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                      session.sid === activeSid
                        ? "border-sky-400/70 bg-sky-500/10"
                        : "border-slate-800 bg-slate-950/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-white">{session.name}</p>
                        <p className="mt-1 text-xs text-slate-400">{session.cwd}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] ${session.status === "running" ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-700 text-slate-300"}`}>
                        {session.status === "running" ? "运行中" : "已退出"}
                      </span>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-200"
                        type="button"
                        onClick={() => {
                          setActiveSid(session.sid);
                          requestReplay(session.sid);
                        }}
                      >
                        查看
                      </button>
                      <button
                        className="rounded-full border border-rose-500/40 px-3 py-1.5 text-xs text-rose-200 disabled:opacity-40"
                        type="button"
                        disabled={session.status !== "running"}
                        onClick={() => {
                          sendMessage({
                            type: "session.kill",
                            reqId: createReqId("kill"),
                            deviceId,
                            sid: session.sid,
                          });
                        }}
                      >
                        关闭
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>

        <Panel title={activeSession ? `${activeSession.name} · ${activeSession.status === "running" ? "运行中" : "已退出"}` : "当前未选择会话"}>
          <div className="flex h-full min-h-[68vh] flex-col gap-4">
            <div className="flex flex-wrap gap-2 md:sticky md:top-0 md:z-10 md:bg-slate-900/72 md:pb-2">
              {SHORTCUT_KEYS.map(({ key, label }) => (
                <button
                  key={key}
                  className="min-h-11 rounded-full border border-slate-700 px-3 py-2 text-sm text-slate-200 disabled:opacity-40"
                  disabled={!activeSid || !connected}
                  onClick={() => sendKey(key)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="min-h-[440px] flex-1 overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/95 p-3">
              <div ref={terminalRef} className="h-full w-full overflow-hidden" />
            </div>

            <form className="flex flex-col gap-3 md:flex-row" onSubmit={handleSendCommand}>
              <input
                className="flex-1 rounded-full border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm outline-none ring-0 placeholder:text-slate-500 disabled:opacity-50"
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                placeholder="输入命令，发送时会自动追加回车"
                disabled={!activeSid || !connected}
              />
              <button className="rounded-full bg-sky-500 px-5 py-3 text-sm font-medium text-slate-950 disabled:opacity-60" type="submit" disabled={!activeSid || !connected}>
                发送
              </button>
            </form>
            <div className="rounded-3xl border border-slate-800 bg-slate-950/35 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-white">粘贴大段命令</p>
                <span className="text-xs text-slate-500">适合脚本、多行命令和长 prompt</span>
              </div>
              <textarea
                className="mt-3 min-h-32 w-full rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm outline-none placeholder:text-slate-500 disabled:opacity-50"
                value={pasteBuffer}
                onChange={(event) => setPasteBuffer(event.target.value)}
                placeholder="在这里粘贴多行内容。原样发送不会自动补回车；发送并回车会在末尾补一个回车。"
                disabled={!activeSid || !connected}
              />
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <button
                  className="min-h-11 flex-1 rounded-full border border-slate-700 px-4 py-3 text-sm text-slate-200 disabled:opacity-40"
                  type="button"
                  disabled={!activeSid || !connected || !pasteBuffer}
                  onClick={() => handleSendPaste("raw")}
                >
                  原样发送
                </button>
                <button
                  className="min-h-11 flex-1 rounded-full bg-emerald-400 px-4 py-3 text-sm font-medium text-slate-950 disabled:opacity-40"
                  type="button"
                  disabled={!activeSid || !connected || !pasteBuffer}
                  onClick={() => handleSendPaste("line")}
                >
                  发送并回车
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              当前模式是浏览器直开 PWA。适合查看流式输出、补命令和关闭会话，不适合重度长文本输入。
            </p>
          </div>
        </Panel>
      </section>
    </main>
  );
}

function Panel(props: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-slate-800/80 bg-slate-900/72 p-5 shadow-2xl shadow-slate-950/30 backdrop-blur">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">{props.title}</h2>
      </div>
      {props.children}
    </section>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-slate-400">{props.label}</span>
      <input
        className="w-full rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm outline-none placeholder:text-slate-500"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
      />
    </label>
  );
}

function StatusBadge(props: { active: boolean; label: string }) {
  return (
    <span
      className={`rounded-full border px-3 py-2 text-xs font-medium ${
        props.active
          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-200"
          : "border-rose-500/40 bg-rose-500/10 text-rose-200"
      }`}
    >
      {props.label}
    </span>
  );
}
