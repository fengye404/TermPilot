import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentBusinessMessage,
  ClientBusinessMessage,
  ClientToRelayMessage,
  E2EEKeyPair,
  InputKey,
  PairingRedeemResponse,
  RelayToClientMessage,
  SessionRecord,
} from "@termpilot/protocol";
import { createReqId, decryptFromPeer, encryptForPeer, generateE2EEKeyPair, getPublicKeyFingerprint, parseJsonMessage } from "@termpilot/protocol";
import { ConnectionPanel } from "./components/ConnectionPanel";
import { CreateSessionPanel } from "./components/CreateSessionPanel";
import { SessionListPanel } from "./components/SessionListPanel";
import { NoticeBanner, Panel } from "./components/chrome";
import { TerminalWorkspace } from "./components/TerminalWorkspace";

type SessionMap = Record<string, string>;
type ConnectionPhase = "idle" | "connecting" | "connected" | "reconnecting";
type SessionStatusFilter = "all" | "running" | "exited";
const SHORTCUT_KEYS: Array<{ key: InputKey; label: string; chip: string; description: string; tone?: "neutral" | "danger" | "primary" }> = [
  { key: "enter", label: "发送回车", chip: "↵", description: "执行当前命令", tone: "primary" },
  { key: "ctrl_c", label: "中断", chip: "^C", description: "停止当前任务", tone: "danger" },
  { key: "ctrl_d", label: "结束输入", chip: "^D", description: "发送 EOF", tone: "neutral" },
  { key: "tab", label: "补全", chip: "⇥", description: "触发 shell 补全", tone: "neutral" },
  { key: "escape", label: "返回", chip: "Esc", description: "退出当前模式", tone: "neutral" },
  { key: "arrow_up", label: "上一条", chip: "↑", description: "查看历史命令", tone: "neutral" },
  { key: "arrow_down", label: "下一条", chip: "↓", description: "回到较新的命令", tone: "neutral" },
  { key: "arrow_left", label: "左移", chip: "←", description: "移动光标到左侧", tone: "neutral" },
  { key: "arrow_right", label: "右移", chip: "→", description: "移动光标到右侧", tone: "neutral" },
];

const DEFAULT_WS_URL = "ws://127.0.0.1:8787/ws";
const DEFAULT_CLIENT_TOKEN = "";
const DEFAULT_DEVICE_ID = "pc-main";
const STORAGE_KEY = "termpilot-app-state";

interface StoredState {
  wsUrl: string;
  clientToken: string;
  deviceId: string;
  activeSid: string | null;
  pinnedSids?: string[];
  notificationsEnabled?: boolean;
  clientKeyPair?: E2EEKeyPair | null;
  agentPublicKey?: string;
}

interface NoticeState {
  kind: "info" | "success" | "error";
  text: string;
}

type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape" | "portrait") => Promise<void>;
  unlock?: () => void;
};

function getDefaultWsUrl(): string {
  const envUrl = import.meta.env.VITE_RELAY_WS_URL;
  if (envUrl) {
    return envUrl;
  }

  if (typeof window === "undefined") {
    return DEFAULT_WS_URL;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  if (window.location.port === "5173") {
    return `${protocol}//${window.location.hostname}:8787/ws`;
  }
  return `${protocol}//${window.location.host}/ws`;
}

function getRelayHttpBaseUrl(wsUrl: string): string {
  const url = new URL(wsUrl);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function tryParseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function detectTouchDevice(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
}

export default function App() {
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const manuallyDisconnectedRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const deviceIdRef = useRef(DEFAULT_DEVICE_ID);
  const clientTokenRef = useRef(DEFAULT_CLIENT_TOKEN);
  const clientKeyPairRef = useRef<E2EEKeyPair | null>(null);
  const agentPublicKeyRef = useRef("");
  const suppressMobileAutoSelectRef = useRef(false);
  const requestedDeviceIdRef = useRef(DEFAULT_DEVICE_ID);
  const previousDeviceOnlineRef = useRef(false);
  const previousSessionStatusRef = useRef<Record<string, SessionRecord["status"]>>({});
  const bootstrappedNotificationsRef = useRef(false);

  const [wsUrl, setWsUrl] = useState(getDefaultWsUrl);
  const [clientToken, setClientToken] = useState(DEFAULT_CLIENT_TOKEN);
  const [clientKeyPair, setClientKeyPair] = useState<E2EEKeyPair | null>(null);
  const [agentPublicKey, setAgentPublicKey] = useState("");
  const [agentFingerprint, setAgentFingerprint] = useState("");
  const [deviceId, setDeviceId] = useState(DEFAULT_DEVICE_ID);
  const [deviceIdLocked, setDeviceIdLocked] = useState(false);
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
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [command, setCommand] = useState("");
  const [keyboardBridge, setKeyboardBridge] = useState("");
  const [pasteBuffer, setPasteBuffer] = useState("");
  const [createName, setCreateName] = useState("");
  const [createCwd, setCreateCwd] = useState("");
  const [createShell, setCreateShell] = useState("");
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1024);
  const [isTouchDevice, setIsTouchDevice] = useState(detectTouchDevice);
  const [mobileTerminalFocusMode, setMobileTerminalFocusMode] = useState(false);

  const activeSession = useMemo(
    () => sessions.find((session) => session.sid === activeSid) ?? null,
    [activeSid, sessions],
  );
  const activeSnapshot = useMemo(
    () => (activeSid ? (buffers[activeSid] ?? "") : ""),
    [activeSid, buffers],
  );
  const runningSessionsCount = useMemo(
    () => sessions.filter((session) => session.status === "running").length,
    [sessions],
  );
  const exitedSessionsCount = useMemo(
    () => sessions.filter((session) => session.status === "exited").length,
    [sessions],
  );
  const hasSecureBinding = clientToken.trim().length > 0 && Boolean(clientKeyPair) && agentPublicKey.trim().length > 0;
  const isPaired = hasSecureBinding;
  const connected = connectionPhase === "connected";
  const canControlDevice = connected && deviceOnline;
  const parsedWsUrl = useMemo(() => tryParseUrl(wsUrl), [wsUrl]);
  const relayHttpBaseUrl = useMemo(
    () => (parsedWsUrl ? getRelayHttpBaseUrl(parsedWsUrl.toString()) : null),
    [parsedWsUrl],
  );
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
    clientTokenRef.current = clientToken;
  }, [clientToken]);

  useEffect(() => {
    clientKeyPairRef.current = clientKeyPair;
  }, [clientKeyPair]);

  useEffect(() => {
    agentPublicKeyRef.current = agentPublicKey;
  }, [agentPublicKey]);

  useEffect(() => {
    if (!agentPublicKey.trim()) {
      setAgentFingerprint("");
      return;
    }
    void getPublicKeyFingerprint(agentPublicKey)
      .then((fingerprint) => {
        setAgentFingerprint(fingerprint);
      })
      .catch(() => {
        setAgentFingerprint("");
      });
  }, [agentPublicKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
      setIsTouchDevice(detectTouchDevice());
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    const normalizedDeviceId = deviceId.trim() || DEFAULT_DEVICE_ID;
    if (!connected) {
      requestedDeviceIdRef.current = normalizedDeviceId;
      return;
    }
    if (requestedDeviceIdRef.current === normalizedDeviceId) {
      return;
    }

    requestedDeviceIdRef.current = normalizedDeviceId;
    setDeviceOnline(false);
    setSessions([]);
    setBuffers({});
    setActiveSid(null);
    suppressMobileAutoSelectRef.current = false;

    const timeoutId = window.setTimeout(() => {
      void requestSessions(normalizedDeviceId);
    }, 200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [connected, deviceId]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as Partial<StoredState>;
      if (parsed.wsUrl) setWsUrl(parsed.wsUrl);
      const storedToken = typeof parsed.clientToken === "string" ? parsed.clientToken : "";
      if (storedToken) setClientToken(storedToken);
      if (typeof parsed.deviceId === "string" && parsed.deviceId.trim()) {
        setDeviceId(parsed.deviceId.trim());
      }
      if (typeof parsed.activeSid === "string" || parsed.activeSid === null) setActiveSid(parsed.activeSid ?? null);
      if (Array.isArray(parsed.pinnedSids)) setPinnedSids(parsed.pinnedSids.filter((value): value is string => typeof value === "string"));
      if (typeof parsed.notificationsEnabled === "boolean") setNotificationsEnabled(parsed.notificationsEnabled);
      if (parsed.clientKeyPair && typeof parsed.clientKeyPair.publicKey === "string" && typeof parsed.clientKeyPair.privateKey === "string") {
        setClientKeyPair(parsed.clientKeyPair);
      }
      if (typeof parsed.agentPublicKey === "string") {
        setAgentPublicKey(parsed.agentPublicKey);
      }
      if (storedToken && !(parsed.clientKeyPair && typeof parsed.clientKeyPair.publicKey === "string" && typeof parsed.clientKeyPair.privateKey === "string" && typeof parsed.agentPublicKey === "string" && parsed.agentPublicKey.trim())) {
        setPairingMessage("检测到旧版绑定。为启用当前安全模型，请重新配对一次。");
      }
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
      clientKeyPair,
      agentPublicKey,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [activeSid, agentPublicKey, clientKeyPair, clientToken, deviceId, notificationsEnabled, pinnedSids, wsUrl]);

  useEffect(() => {
    setKeyboardBridge("");
    if (activeSid) {
      return;
    }
    setMobileTerminalFocusMode(false);
  }, [activeSid]);

  useEffect(() => {
    if (mobileTerminalFocusMode || typeof document === "undefined") {
      return;
    }
    if (document.fullscreenElement && document.exitFullscreen) {
      void document.exitFullscreen().catch(() => undefined);
    }
    const orientation = ("orientation" in screen ? screen.orientation : undefined) as LockableScreenOrientation | undefined;
    if (orientation?.unlock) {
      try {
        orientation.unlock();
      } catch {
        // ignore unsupported unlock
      }
    }
  }, [mobileTerminalFocusMode]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setMobileTerminalFocusMode(false);
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current);
      }
      socketRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (connected) {
      void requestSessions(deviceIdRef.current);
      if (activeSid) {
        void requestReplay(activeSid, deviceIdRef.current);
      }
    }
  }, [activeSid, connected]);

  useEffect(() => {
    if (!hasSecureBinding || parsedWsUrl === null) {
      return;
    }
    if (socketRef.current || connectionPhase !== "idle" || manuallyDisconnectedRef.current) {
      return;
    }
    connect(false);
  }, [connectionPhase, hasSecureBinding, parsedWsUrl]);

  useEffect(() => {
    const existing = new Set(sessions.map((session) => session.sid));
    setPinnedSids((current) => current.filter((sid) => existing.has(sid)));
  }, [sessions]);

  useEffect(() => {
    if (!connected || sessions.length === 0) {
      suppressMobileAutoSelectRef.current = false;
      return;
    }
    if (!isDesktop && suppressMobileAutoSelectRef.current) {
      return;
    }
    if (activeSid && sessions.some((session) => session.sid === activeSid)) {
      return;
    }

    const pickSession = [...sessions].sort((left, right) => {
      const leftPinned = pinnedSids.includes(left.sid);
      const rightPinned = pinnedSids.includes(right.sid);
      if (leftPinned !== rightPinned) {
        return leftPinned ? -1 : 1;
      }
      if (left.status !== right.status) {
        return left.status === "running" ? -1 : 1;
      }
      return right.lastActivityAt.localeCompare(left.lastActivityAt);
    })[0];

    if (!pickSession) {
      return;
    }

    setActiveSid(pickSession.sid);
    void requestReplay(pickSession.sid, deviceIdRef.current);
  }, [activeSid, connected, isDesktop, pinnedSids, sessions]);

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

  function showNotice(kind: NoticeState["kind"], text: string): void {
    setNotice({ kind, text });
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = window.setTimeout(() => {
      setNotice(null);
      noticeTimerRef.current = null;
    }, 4000);
  }

  function handleSecureBindingMissing(): void {
    setPairingMessage("当前绑定缺少端到端密钥，请清除绑定后重新配对。");
    showNotice("error", "当前绑定缺少端到端密钥，请重新配对。");
  }

  async function sendSecureMessage(message: ClientBusinessMessage): Promise<void> {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    const keyPair = clientKeyPairRef.current;
    const peerPublicKey = agentPublicKeyRef.current.trim();
    const accessToken = clientTokenRef.current.trim();
    if (!accessToken || !keyPair || !peerPublicKey) {
      handleSecureBindingMissing();
      return;
    }
    const payload = await encryptForPeer(
      JSON.stringify(message),
      keyPair.privateKey,
      peerPublicKey,
      {
        channel: "client",
        deviceId: message.deviceId,
        accessToken,
        reqId: "reqId" in message ? message.reqId : undefined,
      },
    );
    socket.send(JSON.stringify({
      type: "secure.client",
      reqId: "reqId" in message ? message.reqId : undefined,
      deviceId: message.deviceId,
      accessToken,
      payload,
    } satisfies ClientToRelayMessage));
  }

  function handleAgentBusinessMessage(message: AgentBusinessMessage): void {
    switch (message.type) {
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
            : null;
          if (next) {
            void requestReplay(next, deviceIdRef.current);
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
        showNotice("error", message.message);
        return;
    }
  }

  async function requestSessions(deviceIdOverride?: string): Promise<void> {
    await sendSecureMessage({
      type: "session.list",
      reqId: createReqId("list"),
      deviceId: deviceIdOverride ?? deviceIdRef.current,
    });
  }

  async function requestReplay(sid: string, deviceIdOverride?: string): Promise<void> {
    await sendSecureMessage({
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
    setClientKeyPair(null);
    setAgentPublicKey("");
    setAgentFingerprint("");
    setDeviceId(DEFAULT_DEVICE_ID);
    setDeviceIdLocked(false);
    setActiveSid(null);
    setSessions([]);
    setBuffers({});
    setPairingMessage("已清除本机保存的访问令牌，请重新配对。");
    showNotice("info", "已清除本机绑定。");
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
      showNotice("info", "已关闭浏览器提醒。");
      return;
    }

    if (typeof window === "undefined" || !("Notification" in window)) {
      showNotice("error", "当前浏览器不支持通知。");
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      setNotificationsEnabled(true);
      showNotice("success", "已开启浏览器提醒。页面在后台时，会在会话退出或设备离线时提醒。");
      return;
    }

    setNotificationsEnabled(false);
    showNotice("error", "通知权限未开启。");
  }

  function connect(resetManual = true, tokenOverride?: string): void {
    if (!parsedWsUrl) {
      setPairingMessage("WebSocket 地址无效，请先输入完整地址。");
      setConnectionPhase("idle");
      return;
    }
    const effectiveToken = tokenOverride ?? clientToken;
    if (effectiveToken.trim() && (!clientKeyPairRef.current || !agentPublicKeyRef.current.trim())) {
      handleSecureBindingMissing();
      setConnectionPhase("idle");
      return;
    }
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
    setPairingMessage("");

    const url = new URL(parsedWsUrl.toString());
    url.searchParams.set("role", "client");
    url.searchParams.set("token", effectiveToken);

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
            const nextDeviceId = message.payload.deviceId ?? (deviceIdRef.current.trim() || DEFAULT_DEVICE_ID);
            const previousDeviceId = deviceIdRef.current;
            const shouldHydrateDeviceId = Boolean(message.payload.deviceId) || !previousDeviceId.trim();
            setPairingMessage("");
            setDeviceIdLocked(Boolean(message.payload.deviceId));
            deviceIdRef.current = nextDeviceId;
            if (nextDeviceId !== previousDeviceId) {
              setSessions([]);
              setBuffers({});
              setActiveSid(null);
            }
            if (shouldHydrateDeviceId) {
              setDeviceId(nextDeviceId);
            }
            void requestSessions(nextDeviceId);
            if (activeSid) {
              void requestReplay(activeSid, nextDeviceId);
            }
          }
          return;
        case "relay.state":
          setDeviceOnline(message.payload.agents.some((agent) => agent.deviceId === deviceIdRef.current && agent.online));
          return;
        case "secure.agent":
          {
            const keyPair = clientKeyPairRef.current;
            const peerPublicKey = agentPublicKeyRef.current.trim();
            if (!keyPair || !peerPublicKey || message.deviceId !== deviceIdRef.current || message.accessToken !== effectiveToken) {
              return;
            }
            void decryptFromPeer(message.payload, keyPair.privateKey, peerPublicKey, {
              channel: "agent",
              deviceId: message.deviceId,
              accessToken: message.accessToken,
              reqId: message.reqId,
            })
              .then((plaintext) => {
                const inner = parseJsonMessage<AgentBusinessMessage>(plaintext);
                if (inner) {
                  handleAgentBusinessMessage(inner);
                }
              })
              .catch(() => {
                showNotice("error", "收到了一条无法解密或校验的设备消息，请重新配对。");
              });
          }
          return;
        case "error":
          if (message.code === "AUTH_FAILED" || message.code === "AUTH_REVOKED") {
            stopReconnectLoop();
            setConnectionPhase("idle");
            setDeviceOnline(false);
            if (message.code === "AUTH_REVOKED") {
              setClientToken("");
              setClientKeyPair(null);
              setAgentPublicKey("");
            }
            setPairingMessage(message.message);
            showNotice("error", message.message);
            socket.close();
            return;
          }
          showNotice("error", message.message);
      }
    });
  }

  async function handleRedeemPairingCode(): Promise<void> {
    if (!relayHttpBaseUrl) {
      setPairingMessage("WebSocket 地址无效，请先输入完整地址。");
      return;
    }
    const code = pairingCode.trim().toUpperCase();
    if (!code) {
      setPairingMessage("请先输入配对码。");
      return;
    }

    setPairingPending(true);
    setPairingMessage("");
    try {
      const nextClientKeyPair = await generateE2EEKeyPair();
      const response = await fetch(`${relayHttpBaseUrl}/api/pairings/redeem`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          pairingCode: code,
          clientPublicKey: nextClientKeyPair.publicKey,
        }),
      });

      const payload = await response.json().catch(() => null) as PairingRedeemResponse | { message?: string } | null;
      if (!response.ok || !payload || !("accessToken" in payload)) {
        const message = payload && "message" in payload && payload.message ? payload.message : "配对失败";
        throw new Error(message);
      }

      const agentFingerprint = await getPublicKeyFingerprint(payload.agentPublicKey);

      setSessions([]);
      setBuffers({});
      setActiveSid(null);
      setDeviceId(payload.deviceId);
      setClientToken(payload.accessToken);
      setClientKeyPair(nextClientKeyPair);
      setAgentPublicKey(payload.agentPublicKey);
      setPairingCode("");
      setPairingMessage("");
      showNotice("success", `已绑定设备 ${payload.deviceId}。请核对电脑端设备指纹 ${agentFingerprint}。`);
      connect(true, payload.accessToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : "配对失败";
      setPairingMessage(message);
      showNotice("error", message);
    } finally {
      setPairingPending(false);
    }
  }

  function handleCreateSession(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!canControlDevice) {
      showNotice(
        "error",
        deviceOnline ? "当前未连接 relay，无法创建会话。" : `设备 ${deviceId || DEFAULT_DEVICE_ID} 当前离线，无法创建会话。`,
      );
      return;
    }
    void sendSecureMessage({
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
    showNotice("success", "已发送创建会话请求。");
  }

  function handleSendCommand(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    sendCommandNow();
  }

  function sendRawTerminalText(text: string): void {
    if (!activeSid || !text || !canControlDevice) {
      return;
    }

    void sendSecureMessage({
      type: "session.input",
      reqId: createReqId("input"),
      deviceId,
      sid: activeSid,
      payload: {
        text,
      },
    });
  }

  function sendCommandNow(): void {
    if (!activeSid || !command.trim() || !canControlDevice) {
      return;
    }

    sendRawTerminalText(`${command}\n`);
    setCommand("");
  }

  function handleKeyboardBridgeChange(next: string): void {
    if (!activeSid || !canControlDevice) {
      setKeyboardBridge(next);
      return;
    }

    if (next === keyboardBridge) {
      return;
    }

    if (next.startsWith(keyboardBridge)) {
      const appended = next.slice(keyboardBridge.length);
      if (appended) {
        sendRawTerminalText(appended);
      }
      setKeyboardBridge(next);
      return;
    }

    if (keyboardBridge.startsWith(next)) {
      const removedCount = keyboardBridge.length - next.length;
      if (removedCount > 0) {
        sendRawTerminalText("\u007f".repeat(removedCount));
      }
      setKeyboardBridge(next);
      return;
    }

    if (keyboardBridge.length > 0) {
      sendRawTerminalText("\u007f".repeat(keyboardBridge.length));
    }
    if (next) {
      sendRawTerminalText(next);
    }
    setKeyboardBridge(next);
  }

  function handleKeyboardBridgeKey(key: "enter" | "backspace" | "tab"): void {
    if (!activeSid || !canControlDevice) {
      return;
    }

    if (key === "enter") {
      sendRawTerminalText("\n");
      setKeyboardBridge("");
      return;
    }

    if (key === "backspace") {
      sendRawTerminalText("\u007f");
      setKeyboardBridge((current) => current.slice(0, -1));
      return;
    }

    sendKey("tab");
  }

  function handleSendPaste(mode: "raw" | "line"): void {
    if (!activeSid || !pasteBuffer || !canControlDevice) {
      return;
    }

    void sendSecureMessage({
      type: "session.input",
      reqId: createReqId("paste"),
      deviceId,
      sid: activeSid,
      payload: {
        text: mode === "line" ? `${pasteBuffer}\n` : pasteBuffer,
      },
    });
    setPasteBuffer("");
    showNotice("success", mode === "line" ? "已发送多行内容并追加回车。" : "已原样发送多行内容。");
  }

  function sendKey(key: InputKey): void {
    if (!activeSid || !canControlDevice) {
      return;
    }

    void sendSecureMessage({
      type: "session.input",
      reqId: createReqId("key"),
      deviceId,
      sid: activeSid,
      payload: {
        key,
      },
    });
  }

  function handleKillSession(sid: string): void {
    void sendSecureMessage({
      type: "session.kill",
      reqId: createReqId("kill"),
      deviceId,
      sid,
    });
    showNotice("info", "已发送关闭会话请求。");
  }

  function revealWorkspace(): void {
    if (!workspaceRef.current || typeof window === "undefined") {
      return;
    }
    if (window.innerWidth >= 1024) {
      return;
    }
    const target = workspaceRef.current;
    window.requestAnimationFrame(() => {
      target.scrollIntoView({
        block: "start",
        inline: "nearest",
      });
    });
  }

  async function toggleMobileTerminalFocusMode(): Promise<void> {
    const next = !mobileTerminalFocusMode;
    setMobileTerminalFocusMode(next);

    if (typeof document === "undefined") {
      return;
    }

    if (next) {
      const target = document.documentElement;
      if (target.requestFullscreen) {
        try {
          await target.requestFullscreen();
        } catch {
          // ignore unsupported fullscreen requests
        }
      }
      const orientation = ("orientation" in screen ? screen.orientation : undefined) as LockableScreenOrientation | undefined;
      if (orientation?.lock) {
        try {
          await orientation.lock("landscape");
        } catch {
          showNotice("info", "已进入终端聚焦模式。若浏览器不支持自动横屏，请手动旋转手机。");
        }
      } else {
        showNotice("info", "已进入终端聚焦模式。若想获得更宽终端，请手动旋转手机。");
      }
      return;
    }

    if (document.fullscreenElement && document.exitFullscreen) {
      try {
        await document.exitFullscreen();
      } catch {
        // ignore exit errors
      }
    }
    const orientation = ("orientation" in screen ? screen.orientation : undefined) as LockableScreenOrientation | undefined;
    if (orientation?.unlock) {
      try {
        orientation.unlock();
      } catch {
        // ignore unsupported unlock
      }
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col gap-4 px-4 py-4 text-[var(--tp-text)] sm:px-5 sm:py-5 lg:px-6">
      <header className="tp-card px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--tp-accent-strong)]">TermPilot</p>
            <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.03em] text-white">
              {isPaired ? "会话面板" : "先绑定你的电脑"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--tp-text-muted)]">
              {isPaired
                ? "先选一个会话，再进入查看输出和补命令。"
                : "在电脑上执行 termpilot agent --relay 你的 relay 地址。命令会直接启动后台 agent 并打印一次性配对码。"}
            </p>
          </div>
          {isPaired ? (
            <div className="flex flex-wrap gap-2">
              <span className="tp-chip">{deviceId}</span>
              <span className={`tp-chip ${deviceOnline ? "tp-chip-active" : "tp-chip-danger"}`}>{deviceOnline ? "设备在线" : "设备离线"}</span>
              <span className={`tp-chip ${connected ? "tp-chip-active" : ""}`}>
                {connected ? "已连上 relay" : connectionPhase === "reconnecting" ? "正在重连 relay" : "relay 未连接"}
              </span>
            </div>
          ) : null}
        </div>
        {isPaired ? (
          <div className="mt-4 tp-stat-grid">
            <div className="tp-stat-card">
              <div className="tp-stat-label">当前设备</div>
              <div className="mt-2 text-sm font-medium text-white">{deviceId}</div>
            </div>
            <div className="tp-stat-card">
              <div className="tp-stat-label">运行中</div>
              <div className="tp-stat-value">{runningSessionsCount}</div>
            </div>
            <div className="tp-stat-card">
              <div className="tp-stat-label">已退出</div>
              <div className="tp-stat-value">{exitedSessionsCount}</div>
            </div>
            <div className="tp-stat-card">
              <div className="tp-stat-label">当前查看</div>
              <div className="mt-2 text-sm font-medium text-white">{activeSession?.name ?? "未选择"}</div>
            </div>
          </div>
        ) : null}
      </header>

      {notice ? (
        <NoticeBanner
          kind={notice.kind}
          text={notice.text}
          onDismiss={() => {
            setNotice(null);
            if (noticeTimerRef.current !== null) {
              window.clearTimeout(noticeTimerRef.current);
              noticeTimerRef.current = null;
            }
          }}
        />
      ) : null}

      {!isPaired ? (
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_420px]">
          <div className="tp-card flex flex-col justify-between px-5 py-5 sm:px-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--tp-accent-strong)]">Onboarding</p>
              <h2 className="mt-3 max-w-xl text-[34px] font-semibold tracking-[-0.04em] text-white">
                先把你的电脑接入，再在手机上继续同一条终端会话。
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--tp-text-muted)]">
                这不是远程桌面，也不是新开一条 shell。TermPilot 的默认路径是让电脑和手机挂在同一条受管理会话上。
              </p>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="tp-card-muted px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--tp-text-soft)]">01</p>
                <p className="mt-2 text-sm font-medium text-white">启动 relay</p>
                <p className="mt-1 text-xs leading-5 text-[var(--tp-text-muted)]">在服务器或一台可访问机器上执行 `termpilot relay`。</p>
              </div>
              <div className="tp-card-muted px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--tp-text-soft)]">02</p>
                <p className="mt-2 text-sm font-medium text-white">启动 agent</p>
                <p className="mt-1 text-xs leading-5 text-[var(--tp-text-muted)]">在电脑上执行 `termpilot agent --relay 你的 relay 地址`。</p>
              </div>
              <div className="tp-card-muted px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--tp-text-soft)]">03</p>
                <p className="mt-2 text-sm font-medium text-white">输入配对码</p>
                <p className="mt-1 text-xs leading-5 text-[var(--tp-text-muted)]">把终端打印出的一次性配对码填到右侧面板。</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <Panel title="输入配对码">
              <p className="text-sm text-[var(--tp-text-muted)]">
                电脑上执行 `termpilot agent --relay 你的 relay 地址`，然后把命令输出的配对码填到这里。
              </p>
              <div className="mt-4 flex gap-3">
                <input
                  className="tp-input flex-1 text-base uppercase md:text-sm"
                  value={pairingCode}
                  onChange={(event) => setPairingCode(event.target.value)}
                  placeholder="ABC-234"
                />
                <button
                  className="tp-button tp-button-primary px-5 py-3 text-sm"
                  type="button"
                  disabled={pairingPending || parsedWsUrl === null}
                  onClick={() => {
                    void handleRedeemPairingCode();
                  }}
                >
                  {pairingPending ? "配对中" : "配对"}
                </button>
              </div>
              {pairingMessage ? <p className="mt-3 text-sm text-[var(--tp-text-muted)]">{pairingMessage}</p> : null}
            </Panel>

            <details className="tp-card px-4 py-4 sm:px-5">
              <summary className="tp-disclosure-summary list-none">
                <span className="block text-sm font-medium text-white">高级设置</span>
              </summary>
              <div className="mt-4">
                <ConnectionPanel
                  title="连接与设备设置"
                  wsUrl={wsUrl}
                  wsUrlValid={parsedWsUrl !== null}
                  clientToken={clientToken}
                  deviceId={deviceId}
                  deviceIdEditable={!deviceIdLocked}
                  pairingCode={pairingCode}
                  pairingMessage={pairingMessage}
                  pairingPending={pairingPending}
                  agentFingerprint={agentFingerprint}
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
                  onRefresh={() => {
                    void requestSessions(deviceIdRef.current);
                  }}
                  onDisconnect={disconnect}
                  onClearBinding={clearBinding}
                  onToggleNotifications={() => {
                    void toggleNotifications();
                  }}
                  showPairingSection={false}
                />
              </div>
            </details>
          </div>
        </section>
      ) : (
        <>
          {isDesktop ? (
            <section className="grid gap-4 lg:grid-cols-[328px_minmax(0,1fr)] xl:grid-cols-[336px_minmax(0,1fr)]">
              <div className="tp-sidebar-sticky space-y-4">
                <CreateSessionPanel
                  canControl={canControlDevice}
                  createName={createName}
                  createCwd={createCwd}
                  createShell={createShell}
                  onCreateNameChange={setCreateName}
                  onCreateCwdChange={setCreateCwd}
                  onCreateShellChange={setCreateShell}
                  onSubmit={handleCreateSession}
                />

                <SessionListPanel
                  canControl={canControlDevice}
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
                    suppressMobileAutoSelectRef.current = false;
                    setActiveSid(sid);
                    void requestReplay(sid, deviceIdRef.current);
                  }}
                  onKillSession={handleKillSession}
                />
              </div>

              <div data-testid="desktop-terminal-workspace">
                <TerminalWorkspace
                  activeSession={activeSession}
                  activeSid={activeSid}
                  canControl={canControlDevice}
                  focusMode={mobileTerminalFocusMode}
                  command={command}
                  keyboardBridge={keyboardBridge}
                  pasteBuffer={pasteBuffer}
                  shortcutKeys={SHORTCUT_KEYS}
                  snapshot={activeSnapshot}
                  onToggleFocusMode={isTouchDevice ? () => {
                    void toggleMobileTerminalFocusMode();
                  } : undefined}
                  onCommandChange={setCommand}
                  onKeyboardBridgeChange={handleKeyboardBridgeChange}
                  onKeyboardBridgeKey={handleKeyboardBridgeKey}
                  onSendCommandNow={sendCommandNow}
                  onSubmitCommand={handleSendCommand}
                  onPasteBufferChange={setPasteBuffer}
                  onSendPaste={handleSendPaste}
                  onSendKey={sendKey}
                />
              </div>
            </section>
          ) : (
            <section className="space-y-4">
              {activeSession ? (
                <div
                  ref={workspaceRef}
                  data-testid="terminal-workspace"
                  className={mobileTerminalFocusMode ? "fixed inset-0 z-50 overflow-y-auto bg-[rgba(11,15,18,0.98)] px-3 py-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]" : undefined}
                >
                  <TerminalWorkspace
                    activeSession={activeSession}
                    activeSid={activeSid}
                    canControl={canControlDevice}
                    focusMode={mobileTerminalFocusMode}
                    command={command}
                    keyboardBridge={keyboardBridge}
                    pasteBuffer={pasteBuffer}
                    shortcutKeys={SHORTCUT_KEYS}
                    snapshot={activeSnapshot}
                    onBack={() => {
                      suppressMobileAutoSelectRef.current = true;
                      setKeyboardBridge("");
                      setMobileTerminalFocusMode(false);
                      setActiveSid(null);
                    }}
                    onToggleFocusMode={() => {
                      void toggleMobileTerminalFocusMode();
                    }}
                    onCommandChange={setCommand}
                    onKeyboardBridgeChange={handleKeyboardBridgeChange}
                    onKeyboardBridgeKey={handleKeyboardBridgeKey}
                    onSendCommandNow={sendCommandNow}
                    onSubmitCommand={handleSendCommand}
                    onPasteBufferChange={setPasteBuffer}
                    onSendPaste={handleSendPaste}
                    onSendKey={sendKey}
                  />
                </div>
              ) : (
                <>
                  <SessionListPanel
                    canControl={canControlDevice}
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
                      suppressMobileAutoSelectRef.current = false;
                      setActiveSid(sid);
                      void requestReplay(sid, deviceIdRef.current);
                      revealWorkspace();
                    }}
                    onKillSession={handleKillSession}
                  />

                  <details className="tp-card px-4 py-4 sm:px-5">
                    <summary className="tp-disclosure-summary list-none">
                      <span className="block text-sm font-medium text-white">新建会话</span>
                    </summary>
                    <div className="mt-4">
                      <CreateSessionPanel
                        canControl={canControlDevice}
                        createName={createName}
                        createCwd={createCwd}
                        createShell={createShell}
                        onCreateNameChange={setCreateName}
                        onCreateCwdChange={setCreateCwd}
                        onCreateShellChange={setCreateShell}
                        onSubmit={handleCreateSession}
                      />
                    </div>
                  </details>
                </>
              )}
            </section>
          )}

          <details className="tp-card px-4 py-4 sm:px-5">
            <summary className="tp-disclosure-summary list-none">
              <span>
                <span className="block text-sm font-medium text-white">连接与设备设置</span>
                <span className="mt-1 block text-xs font-normal text-[var(--tp-text-soft)]">不常用的连接信息和设备管理项放在这里。</span>
              </span>
            </summary>
            <p className="mt-3 text-xs text-[var(--tp-text-soft)]">
              这里放不常用的信息和管理项。日常使用时，你主要只需要看会话列表和终端输出。
            </p>
            <div className="mt-4">
              <ConnectionPanel
                title="连接与设备设置"
                wsUrl={wsUrl}
                wsUrlValid={parsedWsUrl !== null}
                clientToken={clientToken}
                deviceId={deviceId}
                deviceIdEditable={!deviceIdLocked}
                pairingCode={pairingCode}
                pairingMessage={pairingMessage}
                pairingPending={pairingPending}
                agentFingerprint={agentFingerprint}
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
                onRefresh={() => {
                  void requestSessions(deviceIdRef.current);
                }}
                onDisconnect={disconnect}
                onClearBinding={clearBinding}
                onToggleNotifications={() => {
                  void toggleNotifications();
                }}
                showPairingSection={false}
              />
            </div>
          </details>
        </>
      )}
    </main>
  );
}
