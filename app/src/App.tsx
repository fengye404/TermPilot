import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
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
import { prefetchXtermRuntime } from "./components/XtermTerminal";
import { TerminalWorkspace } from "./components/TerminalWorkspace";

declare const __TERMPILOT_APP_VERSION__: string;
declare const __TERMPILOT_APP_BUILD_ID__: string;

declare global {
  interface Window {
    __termpilotCleanupPromise?: Promise<unknown>;
  }
}

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
const APP_BUILD_STORAGE_KEY = "termpilot-app-build";
const APP_BUILD_RELOAD_MARKER_KEY = "termpilot-app-build-reload";
const APP_VERSION = __TERMPILOT_APP_VERSION__;
const APP_BUILD_ID = __TERMPILOT_APP_BUILD_ID__;

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

interface RelayHealthResponse {
  ok: boolean;
  appVersion?: string;
  appBuild?: string;
}

interface AppShellSnapshot {
  buildId: string;
  moduleScriptUrl: string;
}

interface SecureBindingResetOptions {
  message: string;
  notice?: NoticeState;
  resetDeviceId?: boolean;
}

type ActiveSelectionMode = "auto" | "manual" | "restored";

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

function getCurrentAppShellSnapshot(): AppShellSnapshot {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return { buildId: "", moduleScriptUrl: "" };
  }

  const buildId = document.querySelector('meta[name="termpilot-app-build"]')?.getAttribute("content")?.trim() || "";
  const moduleScript = document.querySelector('script[type="module"][src]') as HTMLScriptElement | null;
  const moduleScriptUrl = moduleScript?.src ? new URL(moduleScript.src, window.location.href).toString() : "";
  return { buildId, moduleScriptUrl };
}

function parseAppShellSnapshot(html: string, baseUrl: string): AppShellSnapshot {
  if (typeof DOMParser === "undefined") {
    return { buildId: "", moduleScriptUrl: "" };
  }

  const documentNode = new DOMParser().parseFromString(html, "text/html");
  const buildId = documentNode.querySelector('meta[name="termpilot-app-build"]')?.getAttribute("content")?.trim() || "";
  const moduleScript = documentNode.querySelector('script[type="module"][src]') as HTMLScriptElement | null;
  const scriptSrc = moduleScript?.getAttribute("src")?.trim() || "";
  const moduleScriptUrl = scriptSrc ? new URL(scriptSrc, `${baseUrl}/`).toString() : "";
  return { buildId, moduleScriptUrl };
}

function detectTouchDevice(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
}

function getAppThemeColor(): string {
  if (typeof window === "undefined") {
    return "#f4f7f5";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "#0b0f12" : "#f4f7f5";
}

async function clearStaleAppCaches(): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  const staleCachePrefixes = [
    "workbox-",
    "vite-pwa-",
    "termpilot-",
  ];

  await Promise.resolve(window.__termpilotCleanupPromise).catch(() => undefined);

  if ("serviceWorker" in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.allSettled(registrations.map((registration) => registration.unregister()));
    } catch {
      // ignore cleanup failures
    }
  }

  if ("caches" in window) {
    try {
      const keys = await caches.keys();
      await Promise.allSettled(
        keys
          .filter((key) => staleCachePrefixes.some((prefix) => key.startsWith(prefix)))
          .map((key) => caches.delete(key)),
      );
    } catch {
      // ignore cleanup failures
    }
  }
}

async function generateValidatedClientKeyPair(): Promise<E2EEKeyPair> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const next = await generateE2EEKeyPair();
    const publicKey = next.publicKey.trim();
    const privateKey = next.privateKey.trim();
    if (publicKey && privateKey) {
      return { publicKey, privateKey };
    }
  }
  throw new Error("浏览器未能初始化本地配对密钥，请刷新页面后重试。");
}

function normalizePairingError(message: string): string {
  if (message.includes("clientPublicKey")) {
    return "浏览器未能初始化本地配对密钥，请刷新页面后重试。";
  }
  return message;
}

function isValidKeyPair(value: E2EEKeyPair | null | undefined): value is E2EEKeyPair {
  return Boolean(value?.publicKey.trim() && value?.privateKey.trim());
}

function rankSessionsForAutoSelection(sessions: SessionRecord[], pinnedSidSet: Set<string>): SessionRecord[] {
  return [...sessions].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === "running" ? -1 : 1;
    }

    const leftPinned = pinnedSidSet.has(left.sid);
    const rightPinned = pinnedSidSet.has(right.sid);
    if (leftPinned !== rightPinned) {
      return leftPinned ? -1 : 1;
    }

    const leftRecentActivity = left.lastOutputAt ?? left.lastActivityAt ?? left.startedAt;
    const rightRecentActivity = right.lastOutputAt ?? right.lastActivityAt ?? right.startedAt;
    const activityOrder = rightRecentActivity.localeCompare(leftRecentActivity);
    if (activityOrder !== 0) {
      return activityOrder;
    }

    return right.startedAt.localeCompare(left.startedAt);
  });
}

function pickPreferredSession(sessions: SessionRecord[], pinnedSidSet: Set<string>): SessionRecord | null {
  return rankSessionsForAutoSelection(sessions, pinnedSidSet)[0] ?? null;
}

export default function App() {
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const manuallyDisconnectedRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const cleanupWatchTimerRef = useRef<number | null>(null);
  const cleanupRequestedSidsRef = useRef<string[] | null>(null);
  const sessionsRef = useRef<SessionRecord[]>([]);
  const bufferSeqsRef = useRef<Record<string, number>>({});
  const replayRequestRef = useRef<Record<string, { afterSeq: number; targetSeq: number; at: number }>>({});
  const foregroundRecoveryRef = useRef<{ at: number; sid: string | null }>({ at: 0, sid: null });
  const notificationDedupRef = useRef<Record<string, number>>({});
  const cleanupReminderTimerRef = useRef<Record<string, number>>({});
  const deviceIdRef = useRef(DEFAULT_DEVICE_ID);
  const clientTokenRef = useRef(DEFAULT_CLIENT_TOKEN);
  const clientKeyPairRef = useRef<E2EEKeyPair | null>(null);
  const pairingKeyDraftRef = useRef<E2EEKeyPair | null>(null);
  const pairingKeyInitPromiseRef = useRef<Promise<E2EEKeyPair> | null>(null);
  const agentPublicKeyRef = useRef("");
  const activeSelectionModeRef = useRef<ActiveSelectionMode>("auto");
  const suppressMobileAutoSelectRef = useRef(false);
  const requestedDeviceIdRef = useRef(DEFAULT_DEVICE_ID);
  const previousDeviceOnlineRef = useRef(false);
  const previousSessionStatusRef = useRef<Record<string, SessionRecord["status"]>>({});
  const previousOrphanedSessionsRef = useRef<Record<string, boolean>>({});
  const sessionExitReasonRef = useRef<Record<string, string>>({});
  const bootstrappedNotificationsRef = useRef(false);
  const terminalViewportSizeRef = useRef<Record<string, { cols: number; rows: number }>>({});
  const terminalSentSizeRef = useRef<Record<string, { cols: number; rows: number }>>({});

  const [wsUrl, setWsUrl] = useState(getDefaultWsUrl);
  const [clientToken, setClientToken] = useState(DEFAULT_CLIENT_TOKEN);
  const [clientKeyPair, setClientKeyPair] = useState<E2EEKeyPair | null>(null);
  const [agentPublicKey, setAgentPublicKey] = useState("");
  const [agentFingerprint, setAgentFingerprint] = useState("");
  const [deviceId, setDeviceId] = useState(DEFAULT_DEVICE_ID);
  const [deviceIdLocked, setDeviceIdLocked] = useState(false);
  const [connectionPhase, setConnectionPhase] = useState<ConnectionPhase>("idle");
  const [deviceOnline, setDeviceOnline] = useState(false);
  const [storageHydrated, setStorageHydrated] = useState(false);
  const [pairingKeyReady, setPairingKeyReady] = useState(false);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [buffers, setBuffers] = useState<SessionMap>({});
  const [bufferCursors, setBufferCursors] = useState<Record<string, { row: number; col: number } | null>>({});
  const [bufferSeqs, setBufferSeqs] = useState<Record<string, number>>({});
  const [activeSid, setActiveSid] = useState<string | null>(null);
  const [pinnedSids, setPinnedSids] = useState<string[]>([]);
  const [sessionQuery, setSessionQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<SessionStatusFilter>("all");
  const [pairingCode, setPairingCode] = useState("");
  const [pairingMessage, setPairingMessage] = useState("");
  const [pairingPending, setPairingPending] = useState(false);
  const [cleanupPending, setCleanupPending] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [command, setCommand] = useState("");
  const [pasteBuffer, setPasteBuffer] = useState("");
  const [createName, setCreateName] = useState("");
  const [createCwd, setCreateCwd] = useState("");
  const [createShell, setCreateShell] = useState("");
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1024);
  const [isTouchDevice, setIsTouchDevice] = useState(detectTouchDevice);
  const [isPortraitViewport, setIsPortraitViewport] = useState(() => typeof window !== "undefined" && window.innerHeight > window.innerWidth);
  const [mobileTerminalFocusMode, setMobileTerminalFocusMode] = useState(false);

  const activeSession = useMemo(
    () => sessions.find((session) => session.sid === activeSid) ?? null,
    [activeSid, sessions],
  );
  const activeSnapshotRaw = useMemo(
    () => (activeSid ? (buffers[activeSid] ?? "") : ""),
    [activeSid, buffers],
  );
  const activeCursor = useMemo(
    () => (activeSid ? (bufferCursors[activeSid] ?? null) : null),
    [activeSid, bufferCursors],
  );
  const activeSnapshot = useDeferredValue(activeSnapshotRaw);
  const deferredSessionQuery = useDeferredValue(sessionQuery);
  const runningSessionsCount = useMemo(
    () => sessions.filter((session) => session.status === "running").length,
    [sessions],
  );
  const exitedSessionsCount = useMemo(
    () => sessions.filter((session) => session.status === "exited").length,
    [sessions],
  );
  const suspectedOrphanedSessions = useMemo(
    () => sessions.filter((session) => session.status === "running" && session.suspectedOrphaned),
    [sessions],
  );
  const activeSnapshotLag = useMemo(() => {
    if (!activeSession || !activeSid) {
      return 0;
    }
    const currentSeq = bufferSeqs[activeSid] ?? -1;
    return Math.max(0, activeSession.lastSeq - currentSeq);
  }, [activeSession, activeSid, bufferSeqs]);
  const activeSnapshotPending = activeSnapshotLag > 0 && activeSession?.status === "running";
  const hasSecureBinding = clientToken.trim().length > 0 && Boolean(clientKeyPair) && agentPublicKey.trim().length > 0;
  const isPaired = hasSecureBinding;
  const connected = connectionPhase === "connected";
  const canControlDevice = connected && deviceOnline;
  const mobileSessionView = !isDesktop && Boolean(activeSession);
  const compactMobileChrome = mobileSessionView && !mobileTerminalFocusMode;
  const compactOnboardingMobile = !isDesktop && !isPaired;
  const onboardingDesktop = isDesktop && !isPaired;
  const parsedWsUrl = useMemo(() => tryParseUrl(wsUrl), [wsUrl]);
  const pinnedSidSet = useMemo(() => new Set(pinnedSids), [pinnedSids]);
  const relayHttpBaseUrl = useMemo(
    () => (parsedWsUrl ? getRelayHttpBaseUrl(parsedWsUrl.toString()) : null),
    [parsedWsUrl],
  );
  const filteredSessions = useMemo(() => {
    const query = deferredSessionQuery.trim().toLowerCase();
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
        const leftPinned = pinnedSidSet.has(left.sid);
        const rightPinned = pinnedSidSet.has(right.sid);
        if (leftPinned !== rightPinned) {
          return leftPinned ? -1 : 1;
        }
        return right.startedAt.localeCompare(left.startedAt);
      });
  }, [deferredSessionQuery, pinnedSidSet, sessions, statusFilter]);

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
    if (clientKeyPair) {
      pairingKeyDraftRef.current = clientKeyPair;
    }
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
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      setIsDesktop(viewportWidth >= 1024);
      setIsTouchDevice(detectTouchDevice());
      setIsPortraitViewport(viewportHeight > viewportWidth);
    };

    const handleOrientationChange = () => {
      window.requestAnimationFrame(handleResize);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleOrientationChange);
    window.visualViewport?.addEventListener("resize", handleResize);
    const orientation = ("orientation" in screen ? screen.orientation : undefined) as LockableScreenOrientation | undefined;
    orientation?.addEventListener?.("change", handleOrientationChange);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleOrientationChange);
      window.visualViewport?.removeEventListener("resize", handleResize);
      orientation?.removeEventListener?.("change", handleOrientationChange);
    };
  }, []);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    bufferSeqsRef.current = bufferSeqs;
  }, [bufferSeqs]);

  useEffect(() => {
    if (!hasSecureBinding || sessions.length === 0) {
      return;
    }
    void prefetchXtermRuntime();
  }, [hasSecureBinding, sessions.length]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const meta = document.querySelector('meta[name="theme-color"]');
    const applyThemeColor = () => {
      if (meta) {
        meta.setAttribute("content", getAppThemeColor());
      }
    };

    applyThemeColor();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => applyThemeColor();
    media.addEventListener("change", listener);
    return () => {
      media.removeEventListener("change", listener);
    };
  }, []);

  useEffect(() => {
    if (hasSecureBinding) {
      setPairingKeyReady(true);
      return;
    }
    let cancelled = false;
    setPairingKeyReady(false);
    void ensurePairingKeyPair()
      .then(() => {
        if (cancelled) {
          return;
        }
        setPairingKeyReady(true);
        setPairingMessage((current) => (
          current.includes("本地配对密钥")
            ? ""
            : current
        ));
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setPairingKeyReady(false);
        // ignore warmup failures and surface them only on explicit pairing
      });
    return () => {
      cancelled = true;
    };
  }, [hasSecureBinding]);

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
    setBufferCursors({});
    setBufferSeqs({});
    replayRequestRef.current = {};
    setActiveSid(null);
    activeSelectionModeRef.current = "auto";
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
      const storedKeyPair = parsed.clientKeyPair && typeof parsed.clientKeyPair.publicKey === "string" && typeof parsed.clientKeyPair.privateKey === "string"
        ? parsed.clientKeyPair
        : null;
      const storedAgentPublicKey = typeof parsed.agentPublicKey === "string" ? parsed.agentPublicKey.trim() : "";
      const hasValidStoredBinding = Boolean(storedToken && storedKeyPair && storedAgentPublicKey);

      if (hasValidStoredBinding) {
        setClientToken(storedToken);
        setClientKeyPair(storedKeyPair);
        setAgentPublicKey(storedAgentPublicKey);
      } else if (storedToken) {
        setPairingMessage("检测到旧版绑定，已自动清理失效凭据。请重新配对。");
      }
      if (typeof parsed.deviceId === "string" && parsed.deviceId.trim()) {
        setDeviceId(parsed.deviceId.trim());
      }
      if (hasValidStoredBinding && (typeof parsed.activeSid === "string" || parsed.activeSid === null)) {
        activeSelectionModeRef.current = parsed.activeSid ? "restored" : "auto";
        setActiveSid(parsed.activeSid ?? null);
      }
      if (Array.isArray(parsed.pinnedSids)) setPinnedSids(parsed.pinnedSids.filter((value): value is string => typeof value === "string"));
      if (typeof parsed.notificationsEnabled === "boolean") setNotificationsEnabled(parsed.notificationsEnabled);
      if (!hasValidStoredBinding && storedToken) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
          wsUrl: parsed.wsUrl || wsUrl,
          clientToken: "",
          deviceId: typeof parsed.deviceId === "string" && parsed.deviceId.trim() ? parsed.deviceId.trim() : DEFAULT_DEVICE_ID,
          activeSid: null,
          pinnedSids: Array.isArray(parsed.pinnedSids) ? parsed.pinnedSids.filter((value): value is string => typeof value === "string") : [],
          notificationsEnabled: typeof parsed.notificationsEnabled === "boolean" ? parsed.notificationsEnabled : false,
          clientKeyPair: null,
          agentPublicKey: "",
        } satisfies StoredState));
      }
    } catch {
      // ignore malformed local state
    } finally {
      setStorageHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !storageHydrated) {
      return;
    }
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
  }, [activeSid, agentPublicKey, clientKeyPair, clientToken, deviceId, notificationsEnabled, pinnedSids, storageHydrated, wsUrl]);

  useEffect(() => {
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
    if (typeof document === "undefined" || isDesktop) {
      return;
    }

    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousOverscroll = body.style.overscrollBehavior;

    if (mobileTerminalFocusMode) {
      body.style.overflow = "hidden";
      body.style.overscrollBehavior = "none";
    }

    return () => {
      body.style.overflow = previousOverflow;
      body.style.overscrollBehavior = previousOverscroll;
    };
  }, [isDesktop, mobileTerminalFocusMode]);

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
      if (cleanupWatchTimerRef.current !== null) {
        window.clearTimeout(cleanupWatchTimerRef.current);
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
        const session = sessionsRef.current.find((item) => item.sid === activeSid);
        if (session) {
          void requestReplayIfNeeded(session, deviceIdRef.current);
        } else {
          void requestReplay(activeSid, deviceIdRef.current);
        }
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
    const currentActiveSession = activeSid
      ? sessions.find((session) => session.sid === activeSid) ?? null
      : null;
    const preferredSession = pickPreferredSession(sessions, pinnedSidSet);

    if (currentActiveSession && activeSelectionModeRef.current !== "auto") {
      return;
    }

    if (!preferredSession) {
      return;
    }

    if (currentActiveSession?.sid === preferredSession.sid) {
      return;
    }

    activeSelectionModeRef.current = "auto";
    setActiveSid(preferredSession.sid);
    void requestReplayIfNeeded(preferredSession, deviceIdRef.current);
  }, [activeSid, connected, isDesktop, pinnedSidSet, sessions]);

  useEffect(() => {
    const previousDeviceOnline = previousDeviceOnlineRef.current;
    const previousSessionStatus = previousSessionStatusRef.current;
    const previousOrphanedSessions = previousOrphanedSessionsRef.current;
    const nextSessionStatus = Object.fromEntries(sessions.map((session) => [session.sid, session.status]));
    const nextOrphanedSessions = Object.fromEntries(sessions.map((session) => [session.sid, Boolean(session.suspectedOrphaned)]));

    if (bootstrappedNotificationsRef.current) {
      if (previousDeviceOnline && !deviceOnline) {
        maybeNotify("TermPilot", `设备 ${deviceId} 已离线`, { dedupeKey: `device-offline:${deviceId}` });
      }

      for (const session of sessions) {
        if (!previousOrphanedSessions[session.sid] && session.suspectedOrphaned) {
          const remaining = formatRelativeDurationUntil(session.autoCleanupAt);
          maybeNotify(
            "疑似残留会话",
            `${session.name} 当前无人附着，若持续空闲将于 ${remaining} 后自动清理。`,
            { sid: session.sid, dedupeKey: `orphaned:${session.sid}:${session.autoCleanupAt ?? ""}` },
          );
        }
        if (previousSessionStatus[session.sid] === "running" && session.status === "exited") {
          const exitReason = sessionExitReasonRef.current[session.sid]?.trim() || "";
          const isAutoCleaned = exitReason.includes("自动清理");
          maybeNotify(
            isAutoCleaned ? "会话已自动清理" : "会话已退出",
            isAutoCleaned ? `${session.name} 因长时间无人附着且无输出被自动回收。` : `${session.name} 已结束。`,
            { sid: session.sid, dedupeKey: `session-exit:${session.sid}:${session.status}:${exitReason}` },
          );
        }
      }
    }

    previousDeviceOnlineRef.current = deviceOnline;
    previousSessionStatusRef.current = nextSessionStatus;
    previousOrphanedSessionsRef.current = nextOrphanedSessions;
    bootstrappedNotificationsRef.current = true;
  }, [deviceId, deviceOnline, sessions]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const nextTimers: Record<string, number> = {};
    const reminderLeadMs = 5 * 60_000;
    const now = Date.now();

    for (const session of sessions) {
      if (session.status !== "running" || !session.suspectedOrphaned || !session.autoCleanupAt) {
        continue;
      }
      const autoCleanupAt = Date.parse(session.autoCleanupAt);
      if (!Number.isFinite(autoCleanupAt)) {
        continue;
      }

      const reminderAt = autoCleanupAt - reminderLeadMs;
      const dedupeKey = `cleanup-soon:${session.sid}:${session.autoCleanupAt}`;
      if (reminderAt <= now) {
        maybeNotify(
          "会话即将自动清理",
          `${session.name} 将在 ${formatRelativeDurationUntil(session.autoCleanupAt)} 后自动清理。`,
          { sid: session.sid, dedupeKey, dedupeWindowMs: reminderLeadMs },
        );
        continue;
      }

      const existingTimer = cleanupReminderTimerRef.current[dedupeKey];
      if (existingTimer) {
        nextTimers[dedupeKey] = existingTimer;
        continue;
      }

      nextTimers[dedupeKey] = window.setTimeout(() => {
        maybeNotify(
          "会话即将自动清理",
          `${session.name} 将在 ${formatRelativeDurationUntil(session.autoCleanupAt)} 后自动清理。`,
          { sid: session.sid, dedupeKey, dedupeWindowMs: reminderLeadMs },
        );
        delete cleanupReminderTimerRef.current[dedupeKey];
      }, reminderAt - now);
    }

    for (const [key, timerId] of Object.entries(cleanupReminderTimerRef.current)) {
      if (!(key in nextTimers)) {
        window.clearTimeout(timerId);
      }
    }
    cleanupReminderTimerRef.current = nextTimers;

  }, [sessions, notificationsEnabled]);

  useEffect(() => {
    return () => {
      for (const timerId of Object.values(cleanupReminderTimerRef.current)) {
        window.clearTimeout(timerId);
      }
      cleanupReminderTimerRef.current = {};
    };
  }, []);

  async function reconcileAppBuild(options?: { interactive?: boolean }): Promise<boolean> {
    if (typeof window === "undefined" || typeof document === "undefined" || !relayHttpBaseUrl) {
      return false;
    }

    try {
      const [healthResponse, shellResponse] = await Promise.all([
        fetch(`${relayHttpBaseUrl}/health`, { cache: "no-store" }),
        fetch(`${relayHttpBaseUrl}/`, { cache: "no-store" }),
      ]);
      if (!healthResponse.ok || !shellResponse.ok) {
        return false;
      }
      const [payload, shellHtml] = await Promise.all([
        healthResponse.json() as Promise<RelayHealthResponse>,
        shellResponse.text(),
      ]);
      const serverBuild = payload.appBuild?.trim();
      const serverVersion = payload.appVersion?.trim() || serverBuild || APP_VERSION;
      const currentShell = getCurrentAppShellSnapshot();
      const nextShell = parseAppShellSnapshot(shellHtml, relayHttpBaseUrl);
      const scriptChanged = Boolean(
        currentShell.moduleScriptUrl
        && nextShell.moduleScriptUrl
        && currentShell.moduleScriptUrl !== nextShell.moduleScriptUrl,
      );
      const buildChanged = Boolean(
        nextShell.buildId
        && currentShell.buildId
        && nextShell.buildId !== currentShell.buildId,
      );

      window.localStorage.setItem(APP_BUILD_STORAGE_KEY, APP_BUILD_ID);
      if ((!serverBuild || serverBuild === APP_BUILD_ID) && !scriptChanged && !buildChanged) {
        window.sessionStorage.removeItem(APP_BUILD_RELOAD_MARKER_KEY);
        return false;
      }

      const latestFingerprint = nextShell.buildId || serverBuild || nextShell.moduleScriptUrl || serverVersion;
      const reloadMarker = `${currentShell.buildId || APP_BUILD_ID}:${currentShell.moduleScriptUrl}->${latestFingerprint}:${nextShell.moduleScriptUrl}`;
      if (window.sessionStorage.getItem(APP_BUILD_RELOAD_MARKER_KEY) === reloadMarker) {
        if (options?.interactive) {
          setPairingMessage((current) => current || `检测到 relay 已升级到 ${serverVersion}，请手动刷新页面完成更新。`);
          showNotice("info", `发现新版本 ${serverVersion}，请刷新页面完成更新。`);
        }
        return false;
      }

      window.sessionStorage.setItem(APP_BUILD_RELOAD_MARKER_KEY, reloadMarker);
      await clearStaleAppCaches();
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set("v", latestFingerprint);
      window.location.replace(nextUrl.toString());
      return true;
    } catch {
      return false;
    }
  }

  useEffect(() => {
    const requested = cleanupRequestedSidsRef.current;
    if (!requested || requested.length === 0) {
      return;
    }

    const stillRunning = requested.filter((sid) => sessions.some((session) => session.sid === sid && session.status === "running"));
    if (stillRunning.length > 0) {
      return;
    }

    cleanupRequestedSidsRef.current = null;
    if (cleanupWatchTimerRef.current !== null) {
      window.clearTimeout(cleanupWatchTimerRef.current);
      cleanupWatchTimerRef.current = null;
    }
    setCleanupPending(false);
    showNotice("success", `已完成 ${requested.length} 条疑似残留会话的清理。`);
  }, [sessions]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }
    if (!relayHttpBaseUrl) {
      return;
    }

    let cancelled = false;

    const reconcileBuild = async () => {
      if (cancelled) {
        return;
      }
      await reconcileAppBuild();
    };

    void reconcileBuild();

    const onForeground = () => {
      if (document.visibilityState === "visible") {
        void reconcileBuild();
      }
    };
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void reconcileBuild();
      }
    }, 30_000);

    window.addEventListener("focus", onForeground);
    document.addEventListener("visibilitychange", onForeground);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onForeground);
      document.removeEventListener("visibilitychange", onForeground);
    };
  }, [relayHttpBaseUrl]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const recoverForegroundState = () => {
      if (document.visibilityState !== "visible" || !connected) {
        return;
      }

      const now = Date.now();
      if (
        foregroundRecoveryRef.current.sid === activeSid
        && now - foregroundRecoveryRef.current.at < 3_000
      ) {
        return;
      }
      foregroundRecoveryRef.current = { at: now, sid: activeSid };

      void requestSessions(deviceIdRef.current);
      if (!activeSid) {
        return;
      }

      const activeSessionRecord = sessionsRef.current.find((session) => session.sid === activeSid);
      if (activeSessionRecord) {
        void requestReplayIfNeeded(activeSessionRecord, deviceIdRef.current);
        return;
      }
      void requestReplay(activeSid, deviceIdRef.current);
    };

    window.addEventListener("focus", recoverForegroundState);
    document.addEventListener("visibilitychange", recoverForegroundState);
    return () => {
      window.removeEventListener("focus", recoverForegroundState);
      document.removeEventListener("visibilitychange", recoverForegroundState);
    };
  }, [activeSid, connected]);

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

  function maybeNotify(title: string, body: string, options?: { sid?: string; dedupeKey?: string; dedupeWindowMs?: number }): void {
    if (
      !notificationsEnabled
      || typeof window === "undefined"
      || typeof document === "undefined"
      || !("Notification" in window)
      || Notification.permission !== "granted"
      || !document.hidden
    ) {
      return;
    }

    const dedupeKey = options?.dedupeKey ?? `${title}:${body}`;
    const dedupeWindowMs = options?.dedupeWindowMs ?? 90_000;
    const now = Date.now();
    if (notificationDedupRef.current[dedupeKey] && now - notificationDedupRef.current[dedupeKey] < dedupeWindowMs) {
      return;
    }
    notificationDedupRef.current[dedupeKey] = now;

    try {
      const notification = new Notification(title, {
        body,
        tag: dedupeKey,
      });
      if (options?.sid) {
        notification.onclick = () => {
          try {
            window.focus();
          } catch {
            // ignore focus failures
          }
          suppressMobileAutoSelectRef.current = false;
          activeSelectionModeRef.current = "manual";
          setActiveSid(options.sid ?? null);
          if (options.sid) {
            void requestReplay(options.sid, deviceIdRef.current);
          }
          notification.close();
        };
      }
    } catch {
      // ignore unsupported notification edge cases
    }
  }

  function formatRelativeDurationUntil(targetIso: string | null | undefined): string {
    if (!targetIso) {
      return "稍后";
    }
    const timestamp = Date.parse(targetIso);
    if (!Number.isFinite(timestamp)) {
      return "稍后";
    }
    const diffMs = Math.max(0, timestamp - Date.now());
    if (diffMs < 60_000) {
      return "1 分钟内";
    }
    const diffMinutes = Math.ceil(diffMs / 60_000);
    if (diffMinutes < 60) {
      return `${diffMinutes} 分钟`;
    }
    const diffHours = Math.ceil(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours} 小时`;
    }
    const diffDays = Math.ceil(diffHours / 24);
    return `${diffDays} 天`;
  }

  function resetSecureBinding(options: SecureBindingResetOptions): void {
    disconnect();
    setClientToken("");
    setClientKeyPair(null);
    pairingKeyDraftRef.current = null;
    pairingKeyInitPromiseRef.current = null;
    setPairingKeyReady(false);
    setAgentPublicKey("");
    setAgentFingerprint("");
    setDeviceIdLocked(false);
    if (options.resetDeviceId) {
      setDeviceId(DEFAULT_DEVICE_ID);
    }
    setActiveSid(null);
    activeSelectionModeRef.current = "auto";
    setSessions([]);
    setBuffers({});
    setBufferCursors({});
    setBufferSeqs({});
    replayRequestRef.current = {};
    setPairingMessage(options.message);
    previousDeviceOnlineRef.current = false;
    previousSessionStatusRef.current = {};
    previousOrphanedSessionsRef.current = {};
    sessionExitReasonRef.current = {};
    bootstrappedNotificationsRef.current = false;
    if (options.notice) {
      showNotice(options.notice.kind, options.notice.text);
    }
  }

  function handleSecureBindingMissing(): void {
    resetSecureBinding({
      message: "当前绑定已失效，已自动清理本地凭据。请重新配对。",
      notice: { kind: "error", text: "当前绑定缺少端到端密钥，已自动清理，请重新配对。" },
    });
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
        startTransition(() => {
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
          setBufferCursors((current) => {
            const nextCursors: Record<string, { row: number; col: number } | null> = {};
            for (const session of message.payload.sessions) {
              if (Object.prototype.hasOwnProperty.call(current, session.sid)) {
                nextCursors[session.sid] = current[session.sid] ?? null;
              }
            }
            return nextCursors;
          });
          setBufferSeqs((current) => {
            const nextSeqs: Record<string, number> = {};
            for (const session of message.payload.sessions) {
              if (typeof current[session.sid] === "number") {
                nextSeqs[session.sid] = current[session.sid];
              }
              const localSeq = typeof current[session.sid] === "number" ? current[session.sid] : -1;
              if (localSeq >= session.lastSeq) {
                delete replayRequestRef.current[session.sid];
              }
            }
            return nextSeqs;
          });
          setActiveSid((current) => {
            const next = current && message.payload.sessions.some((session) => session.sid === current)
              ? current
              : null;
            if (!next) {
              activeSelectionModeRef.current = "auto";
            }
            if (next) {
              const activeSessionRecord = message.payload.sessions.find((session) => session.sid === next);
              if (activeSessionRecord) {
                void requestReplayIfNeeded(activeSessionRecord, deviceIdRef.current);
              }
            }
            return next;
          });
        });
        return;
      case "session.created":
      case "session.state": {
        const session = message.payload.session;
        if (session.deviceId !== deviceIdRef.current) {
          return;
        }
        startTransition(() => {
          setSessions((current) => {
            const next = current.filter((item) => item.sid !== session.sid);
            next.push(session);
            next.sort((left, right) => right.startedAt.localeCompare(left.startedAt));
            return next;
          });
          if ((bufferSeqsRef.current[session.sid] ?? -1) >= session.lastSeq) {
            delete replayRequestRef.current[session.sid];
          } else if (activeSid === session.sid) {
            void requestReplayIfNeeded(session, deviceIdRef.current);
          }
        });
        return;
      }
      case "session.output":
        if (message.deviceId !== deviceIdRef.current) {
          return;
        }
        {
          const currentSeq = bufferSeqsRef.current[message.sid] ?? -1;
          if (message.seq < currentSeq) {
            return;
          }

          if (message.seq === currentSeq && message.payload.mode !== "replace") {
            return;
          }

          if (message.payload.mode === "append" && message.seq !== currentSeq + 1) {
            void requestReplayForTarget(message.sid, message.seq, deviceIdRef.current);
            return;
          }
        }
        startTransition(() => {
          setBuffers((current) => ({
            ...current,
            [message.sid]: message.payload.mode === "append"
              ? `${current[message.sid] ?? ""}${message.payload.data}`
              : message.payload.data,
          }));
          setBufferCursors((current) => ({
            ...current,
            [message.sid]: message.payload.cursor ?? current[message.sid] ?? null,
          }));
          setBufferSeqs((current) => {
            const next = { ...current, [message.sid]: message.seq };
            const pending = replayRequestRef.current[message.sid];
            if (pending && message.seq >= pending.targetSeq) {
              delete replayRequestRef.current[message.sid];
            }
            return next;
          });
        });
        return;
      case "session.exit":
        if (message.deviceId !== deviceIdRef.current) {
          return;
        }
        sessionExitReasonRef.current[message.sid] = message.payload.reason;
        if (activeSid === message.sid) {
          showNotice("info", message.payload.reason);
        }
        startTransition(() => {
          setSessions((current) =>
            current.map((session) =>
              session.sid === message.sid ? { ...session, status: "exited" } : session,
            ),
          );
        });
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
    const afterSeq = bufferSeqsRef.current[sid] ?? -1;
    await sendSecureMessage({
      type: "session.replay",
      reqId: createReqId("replay"),
      deviceId: deviceIdOverride ?? deviceIdRef.current,
      sid,
      payload: {
        afterSeq,
      },
    });
  }

  async function requestReplayForTarget(sid: string, targetSeq: number, deviceIdOverride?: string): Promise<void> {
    const afterSeq = bufferSeqsRef.current[sid] ?? -1;
    if (afterSeq >= targetSeq) {
      delete replayRequestRef.current[sid];
      return;
    }

    const pending = replayRequestRef.current[sid];
    const now = Date.now();
    if (
      pending
      && pending.afterSeq === afterSeq
      && pending.targetSeq >= targetSeq
      && now - pending.at < 1_500
    ) {
      return;
    }

    replayRequestRef.current[sid] = {
      afterSeq,
      targetSeq,
      at: now,
    };
    await requestReplay(sid, deviceIdOverride);
  }

  async function requestReplayIfNeeded(session: SessionRecord, deviceIdOverride?: string): Promise<void> {
    await requestReplayForTarget(session.sid, session.lastSeq, deviceIdOverride);
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
    resetSecureBinding({
      message: "已清除本机保存的访问令牌，请重新配对。",
      notice: { kind: "info", text: "已清除本机绑定。" },
      resetDeviceId: true,
    });
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
      showNotice("success", "已开启浏览器提醒。页面在后台时，会在设备离线、会话退出或疑似残留时提醒。");
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
    let suppressReconnectOnClose = false;

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
      if (suppressReconnectOnClose) {
        setConnectionPhase("idle");
        setDeviceOnline(false);
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
              setBufferCursors({});
              setBufferSeqs({});
              replayRequestRef.current = {};
              setActiveSid(null);
              activeSelectionModeRef.current = "auto";
            }
            if (shouldHydrateDeviceId) {
              setDeviceId(nextDeviceId);
            }
            void requestSessions(nextDeviceId);
            if (activeSid) {
              const activeSessionRecord = sessionsRef.current.find((session) => session.sid === activeSid);
              if (activeSessionRecord) {
                void requestReplayIfNeeded(activeSessionRecord, nextDeviceId);
              } else {
                void requestReplay(activeSid, nextDeviceId);
              }
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
            suppressReconnectOnClose = true;
            setConnectionPhase("idle");
            setDeviceOnline(false);
            if (message.code === "AUTH_REVOKED") {
              maybeNotify("访问已撤销", message.message, { dedupeKey: `auth-revoked:${deviceIdRef.current}` });
              resetSecureBinding({
                message: message.message,
                notice: { kind: "error", text: message.message },
              });
              socket.close();
              return;
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
    if (await reconcileAppBuild({ interactive: true })) {
      return;
    }

    setPairingPending(true);
    setPairingMessage("");
    try {
      let nextClientKeyPair = await ensurePairingKeyPair();
      let payload: PairingRedeemResponse;
      try {
        payload = await redeemPairingCode(code, nextClientKeyPair);
      } catch (error) {
        const message = normalizePairingError(error instanceof Error ? error.message : "配对失败");
        if (!message.includes("本地配对密钥")) {
          throw error;
        }
        nextClientKeyPair = await ensurePairingKeyPair(true);
        payload = await redeemPairingCode(code, nextClientKeyPair);
      }

      const agentFingerprint = await getPublicKeyFingerprint(payload.agentPublicKey);

      setSessions([]);
      setBuffers({});
      setBufferCursors({});
      setBufferSeqs({});
      replayRequestRef.current = {};
      setActiveSid(null);
      activeSelectionModeRef.current = "auto";
      setDeviceId(payload.deviceId);
      deviceIdRef.current = payload.deviceId;
      requestedDeviceIdRef.current = payload.deviceId;
      setClientToken(payload.accessToken);
      clientTokenRef.current = payload.accessToken;
      setClientKeyPair(nextClientKeyPair);
      clientKeyPairRef.current = nextClientKeyPair;
      pairingKeyDraftRef.current = nextClientKeyPair;
      setPairingKeyReady(true);
      setAgentPublicKey(payload.agentPublicKey);
      agentPublicKeyRef.current = payload.agentPublicKey;
      setPairingCode("");
      setPairingMessage("");
      showNotice("success", `已绑定设备 ${payload.deviceId}。请核对电脑端设备指纹 ${agentFingerprint}。`);
      connect(true, payload.accessToken);
    } catch (error) {
      const message = normalizePairingError(error instanceof Error ? error.message : "配对失败");
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

  async function ensurePairingKeyPair(forceRefresh = false): Promise<E2EEKeyPair> {
    if (!forceRefresh) {
      if (isValidKeyPair(clientKeyPairRef.current)) {
        return clientKeyPairRef.current;
      }
      if (isValidKeyPair(pairingKeyDraftRef.current)) {
        return pairingKeyDraftRef.current;
      }
      if (pairingKeyInitPromiseRef.current) {
        return pairingKeyInitPromiseRef.current;
      }
    } else {
      pairingKeyInitPromiseRef.current = null;
    }
    const initPromise = generateValidatedClientKeyPair().then((next) => {
      pairingKeyDraftRef.current = next;
      return next;
    });
    pairingKeyInitPromiseRef.current = initPromise;
    try {
      return await initPromise;
    } finally {
      if (pairingKeyInitPromiseRef.current === initPromise) {
        pairingKeyInitPromiseRef.current = null;
      }
    }
  }

  async function redeemPairingCode(code: string, clientKeyPairValue: E2EEKeyPair): Promise<PairingRedeemResponse> {
    const clientPublicKey = clientKeyPairValue.publicKey.trim();
    if (!clientPublicKey) {
      throw new Error("浏览器未能初始化本地配对密钥，请刷新页面后重试。");
    }
    const response = await fetch(`${relayHttpBaseUrl}/api/pairings/redeem`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        pairingCode: code,
        clientPublicKey,
      }),
    });

    const payload = await response.json().catch(() => null) as PairingRedeemResponse | { message?: string } | null;
    if (!response.ok || !payload || !("accessToken" in payload)) {
      const message = payload && "message" in payload && payload.message ? payload.message : "配对失败";
      throw new Error(message);
    }
    return payload;
  }

  function handlePairingCodeChange(value: string): void {
    setPairingCode(value);
    if (pairingMessage) {
      setPairingMessage("");
    }
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

  function handleTerminalData(data: string): void {
    sendRawTerminalText(data);
  }

  function handleTerminalResize(cols: number, rows: number): void {
    if (!activeSid || cols <= 0 || rows <= 0) {
      return;
    }

    terminalViewportSizeRef.current[activeSid] = { cols, rows };

    if (!canControlDevice) {
      return;
    }

    const sent = terminalSentSizeRef.current[activeSid];
    if (sent && sent.cols === cols && sent.rows === rows) {
      return;
    }
    terminalSentSizeRef.current[activeSid] = { cols, rows };

    void sendSecureMessage({
      type: "session.resize",
      reqId: createReqId("resize"),
      deviceId,
      sid: activeSid,
      payload: {
        cols,
        rows,
      },
    });
  }

  function handleMobileTerminalResize(): void {
    // Mobile view acts as a lightweight viewer for the shared tmux session.
    // We keep local fitting responsive, but we do not let the phone viewport
    // continuously rewrite the session size that desktop/local tmux uses.
  }

  useEffect(() => {
    if (!activeSid || !canControlDevice) {
      return;
    }

    const viewport = terminalViewportSizeRef.current[activeSid];
    if (!viewport) {
      return;
    }

    const sent = terminalSentSizeRef.current[activeSid];
    if (sent && sent.cols === viewport.cols && sent.rows === viewport.rows) {
      return;
    }

    terminalSentSizeRef.current[activeSid] = viewport;
    void sendSecureMessage({
      type: "session.resize",
      reqId: createReqId("resize"),
      deviceId,
      sid: activeSid,
      payload: viewport,
    });
  }, [activeSid, canControlDevice, deviceId]);

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

  async function handleCleanupSuspectedSessions(): Promise<void> {
    const sessionsToCleanup = suspectedOrphanedSessions;
    if (sessionsToCleanup.length === 0) {
      showNotice("info", "当前没有可清理的疑似残留会话。");
      return;
    }

    if (!canControlDevice || cleanupPending) {
      return;
    }

    setCleanupPending(true);
    try {
      cleanupRequestedSidsRef.current = sessionsToCleanup.map((session) => session.sid);
      if (cleanupWatchTimerRef.current !== null) {
        window.clearTimeout(cleanupWatchTimerRef.current);
      }
      cleanupWatchTimerRef.current = window.setTimeout(() => {
        const requested = cleanupRequestedSidsRef.current;
        if (!requested || requested.length === 0) {
          cleanupWatchTimerRef.current = null;
          return;
        }
        const remaining = requested.filter((sid) => sessionsRef.current.some((session) => session.sid === sid && session.status === "running"));
        const completed = requested.length - remaining.length;
        cleanupRequestedSidsRef.current = null;
        cleanupWatchTimerRef.current = null;
        setCleanupPending(false);
        if (remaining.length === 0) {
          showNotice("success", `已完成 ${requested.length} 条疑似残留会话的清理。`);
          return;
        }
        showNotice(
          "info",
          completed > 0
            ? `已完成 ${completed} 条清理，仍有 ${remaining.length} 条等待设备确认。`
            : `已发送 ${requested.length} 条清理请求，正在等待设备确认。`,
        );
      }, 6000);
      await Promise.all(sessionsToCleanup.map((session) => sendSecureMessage({
        type: "session.kill",
        reqId: createReqId("cleanup"),
        deviceId,
        sid: session.sid,
      })));
      showNotice("info", `正在清理 ${sessionsToCleanup.length} 条疑似残留会话，设备确认后会自动更新列表。`);
    } catch {
      cleanupRequestedSidsRef.current = null;
      if (cleanupWatchTimerRef.current !== null) {
        window.clearTimeout(cleanupWatchTimerRef.current);
        cleanupWatchTimerRef.current = null;
      }
      setCleanupPending(false);
      showNotice("error", "清理请求发送失败，请稍后重试。");
    }
  }

  function selectSession(sid: string, options?: { reveal?: boolean }): void {
    suppressMobileAutoSelectRef.current = false;
    activeSelectionModeRef.current = "manual";
    setActiveSid(sid);
    const session = sessionsRef.current.find((item) => item.sid === sid);
    if (session) {
      void requestReplayIfNeeded(session, deviceIdRef.current);
    } else {
      void requestReplay(sid, deviceIdRef.current);
    }
    if (options?.reveal) {
      revealWorkspace();
    }
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

  const mobileFocusShellClassName = mobileTerminalFocusMode ? "tp-mobile-focus-shell tp-mobile-focus-shell-active" : undefined;
  const shouldRotateMobileFocusTerminal = !isDesktop && mobileTerminalFocusMode && isPortraitViewport;
  const onboardingRelayTarget = parsedWsUrl?.toString() ?? "你的 relay 地址";
  const onboardingStartCommand = `termpilot agent --relay ${onboardingRelayTarget}`;
  const onboardingShellClass = !isPaired
    ? `mx-auto w-full ${onboardingDesktop ? "max-w-[1120px]" : "max-w-[760px]"}`
    : "";
  const onboardingTitle = "TermPilot";
  const onboardingCopy = compactOnboardingMobile
    ? "把电脑上的终端安全带到手机上。先配对一次，后面就能直接回到会话。"
    : "把电脑上的终端会话安全带到手机上。完成这一次配对后，后面通常会直接回到设备和会话。";
  const onboardingVisual = (
    <div className={`tp-onboarding-visual ${compactOnboardingMobile ? "tp-onboarding-visual-compact" : ""}`.trim()} aria-hidden="true">
      <div className="tp-onboarding-visual-meta">
        <span className="tp-onboarding-visual-kicker">Relay Link</span>
        <span className="tp-onboarding-visual-status">E2EE Pairing</span>
      </div>
      <svg
        className="tp-onboarding-visual-svg"
        viewBox="0 0 640 248"
        role="presentation"
        focusable="false"
      >
        <rect x="20" y="20" width="600" height="208" rx="22" className="tp-onboarding-visual-frame" />
        <rect x="52" y="52" width="536" height="148" rx="18" className="tp-onboarding-visual-terminal" />
        <circle cx="82" cy="80" r="5" className="tp-onboarding-visual-window-dot" />
        <circle cx="100" cy="80" r="5" className="tp-onboarding-visual-window-dot tp-onboarding-visual-window-dot-soft" />
        <circle cx="118" cy="80" r="5" className="tp-onboarding-visual-window-dot tp-onboarding-visual-window-dot-soft" />
        <text x="144" y="83" className="tp-onboarding-visual-brand">TERMPILOT</text>
        <path d="M106 122L136 146L106 170" className="tp-onboarding-visual-glyph" />
        <path d="M152 170H190" className="tp-onboarding-visual-cursor" />
        <path d="M238 108H500" className="tp-onboarding-visual-line tp-onboarding-visual-line-strong" />
        <path d="M238 136H552" className="tp-onboarding-visual-line" />
        <path d="M238 164H468" className="tp-onboarding-visual-line tp-onboarding-visual-line-soft" />
        <path d="M208 146H228" className="tp-onboarding-visual-pulse tp-onboarding-visual-pulse-a" />
        <circle cx="232" cy="146" r="7" className="tp-onboarding-visual-node tp-onboarding-visual-node-a" />
        <path d="M240 146H268" className="tp-onboarding-visual-pulse tp-onboarding-visual-pulse-b" />
        <circle cx="276" cy="146" r="7" className="tp-onboarding-visual-node tp-onboarding-visual-node-b" />
        <path d="M284 146H312" className="tp-onboarding-visual-pulse tp-onboarding-visual-pulse-c" />
        <circle cx="320" cy="146" r="7" className="tp-onboarding-visual-node tp-onboarding-visual-node-c" />
        <path d="M356 90H420" className="tp-onboarding-visual-spark" />
        <path d="M474 174H540" className="tp-onboarding-visual-spark tp-onboarding-visual-spark-delayed" />
        <rect x="404" y="84" width="40" height="40" rx="12" className="tp-onboarding-visual-icon-tile" />
        <path d="M416 103C416 98.582 419.582 95 424 95C428.418 95 432 98.582 432 103" className="tp-onboarding-visual-icon-stroke" />
        <path d="M414 106H420L425 101L431 106H434" className="tp-onboarding-visual-icon-stroke" />

        <rect x="454" y="84" width="40" height="40" rx="12" className="tp-onboarding-visual-icon-tile" />
        <path d="M474 95L482 99V106C482 111 478.5 115 474 117C469.5 115 466 111 466 106V99L474 95Z" className="tp-onboarding-visual-icon-stroke" />
        <path d="M470 106L473 109L478 102" className="tp-onboarding-visual-icon-stroke tp-onboarding-visual-icon-stroke-accent" />

        <rect x="504" y="84" width="40" height="40" rx="12" className="tp-onboarding-visual-icon-tile" />
        <path d="M518 96H530C534 96 537 99 537 103V105C537 109 534 112 530 112H523L518 117V96Z" className="tp-onboarding-visual-icon-stroke" />
        <circle cx="524" cy="104" r="2.2" className="tp-onboarding-visual-icon-fill" />
        <circle cx="530" cy="104" r="2.2" className="tp-onboarding-visual-icon-fill" />

        <rect x="410" y="144" width="126" height="26" rx="13" className="tp-onboarding-visual-side-chip" />
        <circle cx="426" cy="157" r="4" className="tp-onboarding-visual-side-chip-dot" />
        <rect x="438" y="153" width="26" height="8" rx="4" className="tp-onboarding-visual-side-bar" />
        <rect x="470" y="153" width="32" height="8" rx="4" className="tp-onboarding-visual-side-bar tp-onboarding-visual-side-bar-soft" />
        <rect x="508" y="153" width="16" height="8" rx="4" className="tp-onboarding-visual-side-bar tp-onboarding-visual-side-bar-faint" />

        <circle cx="418" cy="104" r="3.5" className="tp-onboarding-visual-side-orbit tp-onboarding-visual-side-orbit-a" />
        <circle cx="548" cy="108" r="3.5" className="tp-onboarding-visual-side-orbit tp-onboarding-visual-side-orbit-b" />
        <circle cx="544" cy="162" r="3.5" className="tp-onboarding-visual-side-orbit tp-onboarding-visual-side-orbit-c" />
      </svg>
    </div>
  );

  return (
    <main className={`mx-auto flex min-h-screen w-full max-w-[1580px] flex-col px-4 py-4 text-[var(--tp-text)] sm:px-5 sm:py-5 lg:px-6 ${compactMobileChrome ? "gap-2.5 px-3 py-3" : "gap-4"}`}>
      <header
        className={`tp-card tp-app-header ${(compactMobileChrome || compactOnboardingMobile) ? "px-3 py-2.5" : "px-4 py-4 sm:px-5"} ${onboardingShellClass}`.trim()}
      >
        <div className={`flex items-start justify-between ${(compactMobileChrome || compactOnboardingMobile) ? "gap-2.5" : "flex-wrap gap-4"}`}>
          <div>
            <p className="tp-app-header-kicker">
              {isPaired ? "TermPilot" : "Secure Terminal Companion"}
            </p>
            <h1 className={`font-semibold tracking-[-0.04em] text-[var(--tp-text)] ${(compactMobileChrome || compactOnboardingMobile) ? "mt-1 text-[18px]" : "mt-2 text-[24px]"}`}>
              {compactMobileChrome
                ? (activeSession?.name ?? "当前会话")
                : isPaired
                  ? (activeSession?.name ?? "Workspace")
                  : onboardingTitle}
            </h1>
            <p className={`max-w-2xl text-[var(--tp-text-muted)] ${(compactMobileChrome || compactOnboardingMobile) ? "mt-1 text-[11px] leading-5" : "mt-2 text-sm"}`}>
              {compactMobileChrome
                ? "终端优先，附加信息默认缩小。"
                : isPaired
                  ? "终端优先，控制和会话管理分布在两侧。"
                  : onboardingCopy}
            </p>
          </div>
          {isPaired ? (
            <div className={`flex ${compactMobileChrome ? "max-w-[52vw] flex-wrap justify-end gap-1" : "tp-app-header-chips flex-wrap gap-2"}`}>
              {compactMobileChrome ? null : <span className="tp-chip">{deviceId}</span>}
              {compactMobileChrome ? null : <span className="tp-chip">App {APP_VERSION}</span>}
              <span className={`tp-chip ${deviceOnline ? "tp-chip-active" : "tp-chip-danger"}`}>{deviceOnline ? "设备在线" : "设备离线"}</span>
              <span className={`tp-chip ${connected ? "tp-chip-active" : ""}`}>
                {connected ? "已连上 relay" : connectionPhase === "reconnecting" ? "正在重连 relay" : "relay 未连接"}
              </span>
            </div>
          ) : null}
        </div>
        {isPaired && !compactMobileChrome ? (
          <div className="tp-app-header-strip">
            <span>运行中 {runningSessionsCount}</span>
            <span>已退出 {exitedSessionsCount}</span>
            <span>当前查看 {activeSession?.name ?? "未选择"}</span>
          </div>
        ) : null}
      </header>

      {notice && !mobileTerminalFocusMode ? (
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
        <section className={`${onboardingShellClass} flex flex-col gap-4`.trim()}>
          <div className="flex flex-col gap-4">
            <Panel title="输入配对码" className="tp-onboarding-primary">
              <div className={onboardingDesktop ? "tp-onboarding-layout" : "space-y-4"}>
                <div className="space-y-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--tp-accent-strong)]">Pairing</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--tp-text-muted)]">在电脑上运行命令取码，然后在这里输入。</p>
                  </div>

                  {compactOnboardingMobile ? onboardingVisual : null}

                  <div className="tp-onboarding-command">
                    <p className="tp-onboarding-command-label">电脑上执行</p>
                    <code className="tp-onboarding-command-code">{onboardingStartCommand}</code>
                  </div>

                  <div className="flex gap-3 max-sm:flex-col">
                    <input
                      className="tp-input flex-1 text-base uppercase md:text-sm"
                      value={pairingCode}
                      onChange={(event) => handlePairingCodeChange(event.target.value)}
                      placeholder="ABC-234"
                    />
                    <button
                      className="tp-button tp-button-primary min-w-[108px] px-5 py-3 text-sm"
                      type="button"
                      disabled={pairingPending || !pairingKeyReady || parsedWsUrl === null}
                      onClick={() => {
                        void handleRedeemPairingCode();
                      }}
                    >
                      {pairingPending ? "配对中" : pairingKeyReady ? "配对" : "初始化中"}
                    </button>
                  </div>

                  {pairingMessage || !pairingKeyReady ? (
                    <p className="text-sm text-[var(--tp-text-muted)]">
                      {pairingMessage || "正在初始化本地配对密钥…"}
                    </p>
                  ) : (
                    <p className="text-xs leading-5 text-[var(--tp-text-soft)]">
                      配对成功后会保存当前绑定。下次打开通常会直接回到设备和会话列表。
                    </p>
                  )}
                </div>

                {onboardingDesktop ? (
                  <div className="tp-onboarding-side">
                    {onboardingVisual}
                  </div>
                ) : null}
              </div>
            </Panel>

            <details className="tp-card px-4 py-4 sm:px-5">
              <summary className="tp-disclosure-summary list-none">
                <span className="block text-sm font-medium text-[var(--tp-text)]">高级设置</span>
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
                  pairingInitializing={!pairingKeyReady}
                  agentFingerprint={agentFingerprint}
                  connectionPhase={connectionPhase}
                  notificationsEnabled={notificationsEnabled}
                  onWsUrlChange={setWsUrl}
                  onClientTokenChange={setClientToken}
                  onDeviceIdChange={setDeviceId}
                  onPairingCodeChange={handlePairingCodeChange}
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
            <section className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[336px_minmax(0,1fr)]">
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
                  suspectedOrphanedCount={suspectedOrphanedSessions.length}
                  cleanupPending={cleanupPending}
                  onSessionQueryChange={setSessionQuery}
                  onStatusFilterChange={setStatusFilter}
                  onTogglePinnedSession={togglePinnedSession}
                  onSelectSession={selectSession}
                  onKillSession={handleKillSession}
                  onCleanupSuspectedSessions={handleCleanupSuspectedSessions}
                />
              </div>

              <div data-testid="desktop-terminal-workspace">
                <TerminalWorkspace
                  activeSession={activeSession}
                  activeSid={activeSid}
                  canControl={canControlDevice}
                  focusMode={mobileTerminalFocusMode}
                  focusRotateTerminal={shouldRotateMobileFocusTerminal}
                  snapshotPending={activeSnapshotPending}
                  snapshotLag={activeSnapshotLag}
                  command={command}
                  pasteBuffer={pasteBuffer}
                  shortcutKeys={SHORTCUT_KEYS}
                  snapshot={activeSnapshot}
                  cursor={activeCursor}
                  onToggleFocusMode={isTouchDevice ? () => {
                    void toggleMobileTerminalFocusMode();
                  } : undefined}
                  onCommandChange={setCommand}
                  onSendCommandNow={sendCommandNow}
                  onSubmitCommand={handleSendCommand}
                  onPasteBufferChange={setPasteBuffer}
                  onSendPaste={handleSendPaste}
                  onTerminalData={handleTerminalData}
                  onTerminalResize={handleTerminalResize}
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
                  className={mobileFocusShellClassName}
                >
                  <TerminalWorkspace
                    activeSession={activeSession}
                    activeSid={activeSid}
                    canControl={canControlDevice}
                    focusMode={mobileTerminalFocusMode}
                    focusRotateTerminal={shouldRotateMobileFocusTerminal}
                    snapshotPending={activeSnapshotPending}
                    snapshotLag={activeSnapshotLag}
                    command={command}
                    pasteBuffer={pasteBuffer}
                    shortcutKeys={SHORTCUT_KEYS}
                    snapshot={activeSnapshot}
                    cursor={activeCursor}
                    onBack={() => {
                      suppressMobileAutoSelectRef.current = true;
                      setMobileTerminalFocusMode(false);
                      activeSelectionModeRef.current = "auto";
                      setActiveSid(null);
                    }}
                    onToggleFocusMode={() => {
                      void toggleMobileTerminalFocusMode();
                    }}
                    onCommandChange={setCommand}
                    onSendCommandNow={sendCommandNow}
                    onSubmitCommand={handleSendCommand}
                    onPasteBufferChange={setPasteBuffer}
                    onSendPaste={handleSendPaste}
                    onTerminalData={handleTerminalData}
                    onTerminalResize={handleMobileTerminalResize}
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
                    suspectedOrphanedCount={suspectedOrphanedSessions.length}
                    cleanupPending={cleanupPending}
                  onSessionQueryChange={setSessionQuery}
                  onStatusFilterChange={setStatusFilter}
                  onTogglePinnedSession={togglePinnedSession}
                  onSelectSession={(sid) => {
                    selectSession(sid, { reveal: true });
                  }}
                  onKillSession={handleKillSession}
                  onCleanupSuspectedSessions={handleCleanupSuspectedSessions}
                />

                  <details className="tp-card px-4 py-4 sm:px-5">
                    <summary className="tp-disclosure-summary list-none">
                      <span className="block text-sm font-medium text-[var(--tp-text)]">新建会话</span>
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

          {!mobileSessionView ? (
            <details className="tp-card px-4 py-4 sm:px-5">
              <summary className="tp-disclosure-summary list-none">
                <span>
                  <span className="block text-sm font-medium text-[var(--tp-text)]">连接与设备设置</span>
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
                  pairingInitializing={!pairingKeyReady}
                  agentFingerprint={agentFingerprint}
                  connectionPhase={connectionPhase}
                  notificationsEnabled={notificationsEnabled}
                  onWsUrlChange={setWsUrl}
                  onClientTokenChange={setClientToken}
                  onDeviceIdChange={setDeviceId}
                  onPairingCodeChange={handlePairingCodeChange}
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
          ) : null}
        </>
      )}
    </main>
  );
}
