import type { InputKey } from "@termpilot/protocol";
import {
  forwardRef,
  memo,
  useDeferredValue,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { FitAddon } from "@xterm/addon-fit";
import type { ITerminalOptions, Terminal } from "xterm";

export interface XtermTerminalHandle {
  focus: () => void;
}

interface XtermTerminalProps {
  sessionKey: string;
  snapshot: string;
  className?: string;
  fontPreset?: "default" | "compact" | "focus";
  onData?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
  onSpecialKey?: (key: InputKey) => void;
  onFocusChange?: (focused: boolean) => void;
}

const CLEAR_SCREEN_SEQUENCE = "\u001b[3J\u001b[2J\u001b[H";
const SHOULD_EXPOSE_TEST_MIRRORS = import.meta.env.DEV || (typeof navigator !== "undefined" && navigator.webdriver);

type XtermRuntimeModules = {
  Terminal: typeof import("xterm").Terminal;
  FitAddon: typeof import("@xterm/addon-fit").FitAddon;
};

let xtermRuntimePromise: Promise<XtermRuntimeModules> | null = null;

function loadXtermRuntime(): Promise<XtermRuntimeModules> {
  if (!xtermRuntimePromise) {
    xtermRuntimePromise = Promise.all([
      import("xterm"),
      import("@xterm/addon-fit"),
    ]).then(([xterm, fit]) => ({
      Terminal: xterm.Terminal,
      FitAddon: fit.FitAddon,
    }));
  }
  return xtermRuntimePromise;
}

export function prefetchXtermRuntime(): Promise<void> {
  return loadXtermRuntime().then(() => undefined);
}

function readTerminalTheme(): ITerminalOptions["theme"] {
  if (typeof window === "undefined") {
    return {
      background: "#071014",
      foreground: "#e6edf2",
      cursor: "#e6edf2",
      cursorAccent: "#071014",
      selectionBackground: "rgba(31, 122, 83, 0.24)",
    };
  }

  const styles = window.getComputedStyle(document.documentElement);
  const foreground = styles.getPropertyValue("--tp-text").trim() || "#e6edf2";
  const background = styles.getPropertyValue("--tp-terminal-bg").trim() || "#071014";
  return {
    background,
    foreground,
    cursor: foreground,
    cursorAccent: background,
    selectionBackground: "rgba(31, 122, 83, 0.24)",
  };
}

function mapSpecialKey(event: KeyboardEvent): InputKey | null {
  if (event.ctrlKey && !event.metaKey && !event.altKey) {
    const key = event.key.toLowerCase();
    if (key === "c") {
      return "ctrl_c";
    }
    if (key === "d") {
      return "ctrl_d";
    }
  }

  switch (event.key) {
    case "Enter":
      return "enter";
    case "Tab":
      return "tab";
    case "Escape":
      return "escape";
    case "ArrowUp":
      return "arrow_up";
    case "ArrowDown":
      return "arrow_down";
    case "ArrowLeft":
      return "arrow_left";
    case "ArrowRight":
      return "arrow_right";
    default:
      return null;
  }
}

function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function isTextInputKey(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) {
    return false;
  }

  if (mapSpecialKey(event)) {
    return false;
  }

  if (event.key === "Dead" || event.key === "Process") {
    return false;
  }

  return Array.from(event.key).length === 1;
}

function resolveTypography(fontPreset: XtermTerminalProps["fontPreset"]): Pick<ITerminalOptions, "fontSize" | "lineHeight"> {
  switch (fontPreset) {
    case "compact":
      return {
        fontSize: 11,
        lineHeight: 1.18,
      };
    case "focus":
      return {
        fontSize: 11.5,
        lineHeight: 1.16,
      };
    default:
      return {
        fontSize: 13,
        lineHeight: 1.35,
      };
  }
}

export const XtermTerminal = memo(forwardRef<XtermTerminalHandle, XtermTerminalProps>(function XtermTerminal(props, ref) {
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const fitTerminalRef = useRef<(() => void) | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputMirrorRef = useRef<HTMLPreElement | null>(null);
  const onDataRef = useRef(props.onData);
  const onResizeRef = useRef(props.onResize);
  const onSpecialKeyRef = useRef(props.onSpecialKey);
  const onFocusChangeRef = useRef(props.onFocusChange);
  const shouldStickToBottomRef = useRef(true);
  const scrollLineRef = useRef(0);
  const optimisticInputRef = useRef<{ text: string; expiresAt: number }>({ text: "", expiresAt: 0 });
  const optimisticSpecialKeyRef = useRef<{ key: InputKey | null; expiresAt: number }>({ key: null, expiresAt: 0 });
  const inputMirrorValueRef = useRef("");
  const expectedSnapshotRef = useRef("");
  const deferredSnapshot = useDeferredValue(props.snapshot);
  const pendingFocusRef = useRef(false);
  const [terminalReady, setTerminalReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootNonce, setBootNonce] = useState(0);

  useEffect(() => {
    onDataRef.current = props.onData;
    onResizeRef.current = props.onResize;
    onSpecialKeyRef.current = props.onSpecialKey;
    onFocusChangeRef.current = props.onFocusChange;
  }, [props.onData, props.onFocusChange, props.onResize, props.onSpecialKey]);

  useImperativeHandle(ref, () => ({
    focus() {
      if (terminalRef.current) {
        terminalRef.current.focus();
        pendingFocusRef.current = false;
        return;
      }
      pendingFocusRef.current = true;
    },
  }), []);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    let disposed = false;
    let cleanup = () => {};
    setTerminalReady(false);
    setBootError(null);

    const bootTerminal = async () => {
      try {
        const { Terminal, FitAddon } = await loadXtermRuntime();
        if (disposed || !containerRef.current) {
          return;
        }
        const fitAddon = new FitAddon();
        fitAddonRef.current = fitAddon;
        const { fontSize, lineHeight } = resolveTypography(props.fontPreset);
        const terminal = new Terminal({
          allowTransparency: false,
          convertEol: false,
          cursorBlink: true,
          cursorStyle: "bar",
          drawBoldTextInBrightColors: false,
          fontFamily: '"SF Mono", "JetBrains Mono", Menlo, monospace',
          fontSize,
          lineHeight,
          scrollback: 5000,
          theme: readTerminalTheme(),
        });
        terminalRef.current = terminal;
        terminal.loadAddon(fitAddon);
        terminal.open(containerRef.current);

        const safeFit = () => {
          if (disposed || !terminalRef.current || !fitAddonRef.current || !terminal.element?.isConnected) {
            return;
          }
          try {
            fitAddonRef.current.fit();
            onResizeRef.current?.(terminal.cols, terminal.rows);
          } catch {
            // xterm can transiently lose renderer dimensions while the node is detaching.
          }
        };
        fitTerminalRef.current = safeFit;
        safeFit();

        const helperTextarea = terminal.textarea;
        if (helperTextarea) {
          helperTextarea.setAttribute("aria-label", "终端输入");
          helperTextarea.setAttribute("data-testid", "terminal-input");
          helperTextarea.setAttribute("autocapitalize", "none");
          helperTextarea.setAttribute("autocomplete", "off");
          helperTextarea.setAttribute("autocorrect", "off");
          helperTextarea.setAttribute("spellcheck", "false");
          helperTextarea.setAttribute("inputmode", "text");
        }

        const rememberSpecialKey = (key: InputKey) => {
          optimisticSpecialKeyRef.current = {
            key,
            expiresAt: nowMs() + 48,
          };
        };

        const hasPendingSpecialKey = (key: InputKey): boolean => {
          const pending = optimisticSpecialKeyRef.current;
          if (pending.expiresAt <= nowMs()) {
            pending.key = null;
            pending.expiresAt = 0;
            return false;
          }
          return pending.key === key;
        };

        const consumePendingSpecialKey = (key: InputKey): boolean => {
          if (!hasPendingSpecialKey(key)) {
            return false;
          }
          optimisticSpecialKeyRef.current = {
            key: null,
            expiresAt: 0,
          };
          return true;
        };

        const customKeyHandler = (event: KeyboardEvent) => {
          const mapped = mapSpecialKey(event);
          if (!mapped) {
            return true;
          }
          rememberSpecialKey(mapped);
          onSpecialKeyRef.current?.(mapped);
          return false;
        };
        terminal.attachCustomKeyEventHandler(customKeyHandler);

        const appendInputMirror = (text: string) => {
          if (!text) {
            return;
          }
          const nextValue = `${inputMirrorValueRef.current}${text}`.slice(-256);
          inputMirrorValueRef.current = nextValue;
          if (inputMirrorRef.current) {
            inputMirrorRef.current.textContent = nextValue;
          }
        };

        const forwardTerminalData = (text: string) => {
          appendInputMirror(text);
          onDataRef.current?.(text);
        };

        const rememberOptimisticInput = (text: string) => {
          if (!text) {
            return;
          }
          const pending = optimisticInputRef.current;
          if (pending.expiresAt <= nowMs()) {
            pending.text = "";
          }
          pending.text += text;
          pending.expiresAt = nowMs() + 160;
        };

        const consumeOptimisticInput = (text: string): boolean => {
          if (!text) {
            return false;
          }
          const pending = optimisticInputRef.current;
          if (pending.expiresAt <= nowMs()) {
            pending.text = "";
            pending.expiresAt = 0;
            return false;
          }
          if (!pending.text.startsWith(text)) {
            return false;
          }
          pending.text = pending.text.slice(text.length);
          if (!pending.text) {
            pending.expiresAt = 0;
          }
          return true;
        };

        const hasOptimisticInput = (text: string): boolean => {
          if (!text) {
            return false;
          }
          const pending = optimisticInputRef.current;
          if (pending.expiresAt <= nowMs()) {
            pending.text = "";
            pending.expiresAt = 0;
            return false;
          }
          return pending.text.startsWith(text);
        };

        const keyDisposable = terminal.onKey(({ key, domEvent }) => {
          if (!isTextInputKey(domEvent)) {
            return;
          }
          rememberOptimisticInput(key);
          forwardTerminalData(key);
        });
        const dataDisposable = terminal.onData((data) => {
          if (consumeOptimisticInput(data)) {
            return;
          }
          forwardTerminalData(data);
        });
        const resizeDisposable = terminal.onResize(({ cols, rows }) => {
          onResizeRef.current?.(cols, rows);
        });
        const scrollDisposable = terminal.onScroll((viewportY) => {
          const current = terminal.buffer.active;
          scrollLineRef.current = viewportY;
          shouldStickToBottomRef.current = current.baseY - viewportY < 3;
        });
        const handleFocus = () => {
          onFocusChangeRef.current?.(true);
        };
        const handleBlur = () => {
          onFocusChangeRef.current?.(false);
        };
        const handleTextareaKeyDown = (event: KeyboardEvent) => {
          const mapped = mapSpecialKey(event);
          if (!mapped || event.defaultPrevented || hasPendingSpecialKey(mapped)) {
            return;
          }
          rememberSpecialKey(mapped);
          onSpecialKeyRef.current?.(mapped);
          event.preventDefault();
        };
        const handleBeforeInput = (event: Event) => {
          if (!(event instanceof InputEvent)) {
            return;
          }
          if (event.inputType === "insertLineBreak") {
            if (consumePendingSpecialKey("enter")) {
              return;
            }
            rememberSpecialKey("enter");
            onSpecialKeyRef.current?.("enter");
            return;
          }
          if (!event.data || hasOptimisticInput(event.data)) {
            return;
          }
          rememberOptimisticInput(event.data);
          forwardTerminalData(event.data);
        };
        if (helperTextarea instanceof HTMLElement) {
          helperTextarea.addEventListener("focus", handleFocus);
          helperTextarea.addEventListener("blur", handleBlur);
          helperTextarea.addEventListener("keydown", handleTextareaKeyDown);
          helperTextarea.addEventListener("beforeinput", handleBeforeInput);
        }

        const applyTheme = () => {
          terminal.options.theme = readTerminalTheme();
        };

        const media = typeof window !== "undefined"
          ? window.matchMedia("(prefers-color-scheme: dark)")
          : null;
        media?.addEventListener("change", applyTheme);

        const visualViewport = typeof window !== "undefined" ? window.visualViewport : null;
        visualViewport?.addEventListener("resize", safeFit);

        const fontSet = typeof document !== "undefined" ? document.fonts : null;
        void fontSet?.ready.then(() => {
          window.requestAnimationFrame(() => {
            safeFit();
          });
        }).catch(() => undefined);

        const resizeObserver = typeof ResizeObserver !== "undefined"
          ? new ResizeObserver(() => {
            safeFit();
          })
          : null;
        resizeObserver?.observe(containerRef.current);

        expectedSnapshotRef.current = "";
        setTerminalReady(true);
        setBootError(null);

        if (pendingFocusRef.current) {
          window.requestAnimationFrame(() => {
            terminal.focus();
            pendingFocusRef.current = false;
          });
        }

        cleanup = () => {
          resizeObserver?.disconnect();
          media?.removeEventListener("change", applyTheme);
          visualViewport?.removeEventListener("resize", safeFit);
          if (helperTextarea instanceof HTMLElement) {
            helperTextarea.removeEventListener("focus", handleFocus);
            helperTextarea.removeEventListener("blur", handleBlur);
            helperTextarea.removeEventListener("keydown", handleTextareaKeyDown);
            helperTextarea.removeEventListener("beforeinput", handleBeforeInput);
          }
          scrollDisposable.dispose();
          resizeDisposable.dispose();
          dataDisposable.dispose();
          keyDisposable.dispose();
          terminal.dispose();
          terminalRef.current = null;
          fitAddonRef.current = null;
          fitTerminalRef.current = null;
        };
      } catch (error) {
        if (disposed) {
          return;
        }
        const message = error instanceof Error ? error.message : "终端组件初始化失败";
        setBootError(message);
        setTerminalReady(false);
      }
    };

    void bootTerminal();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [bootNonce]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal || !terminalReady) {
      return;
    }
    const { fontSize, lineHeight } = resolveTypography(props.fontPreset);
    if (terminal.options.fontSize === fontSize && terminal.options.lineHeight === lineHeight) {
      return;
    }
    terminal.options.fontSize = fontSize;
    terminal.options.lineHeight = lineHeight;
    window.requestAnimationFrame(() => {
      fitTerminalRef.current?.();
    });
  }, [props.fontPreset, terminalReady]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    expectedSnapshotRef.current = "";
    scrollLineRef.current = 0;
    shouldStickToBottomRef.current = true;
    inputMirrorValueRef.current = "";
    if (inputMirrorRef.current) {
      inputMirrorRef.current.textContent = "";
    }
    if (!deferredSnapshot) {
      terminal.write(CLEAR_SCREEN_SEQUENCE);
      return;
    }
    expectedSnapshotRef.current = deferredSnapshot;
    terminal.write(`${CLEAR_SCREEN_SEQUENCE}${deferredSnapshot}`, () => {
      terminal.scrollToBottom();
    });
  }, [props.sessionKey]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal || !terminalReady) {
      return;
    }

    const currentSnapshot = expectedSnapshotRef.current;
    if (deferredSnapshot === currentSnapshot) {
      return;
    }

    const restoreScrollLine = shouldStickToBottomRef.current ? null : scrollLineRef.current;
    const shouldAppend = deferredSnapshot.startsWith(currentSnapshot);
    expectedSnapshotRef.current = deferredSnapshot;

    if (!deferredSnapshot) {
      terminal.write(CLEAR_SCREEN_SEQUENCE, () => {
        terminal.scrollToTop();
      });
      return;
    }

    const nextPayload = shouldAppend
      ? deferredSnapshot.slice(currentSnapshot.length)
      : `${CLEAR_SCREEN_SEQUENCE}${deferredSnapshot}`;

    terminal.write(nextPayload, () => {
      if (restoreScrollLine === null) {
        terminal.scrollToBottom();
        return;
      }
      const maxLine = terminal.buffer.active.baseY;
      terminal.scrollToLine(Math.min(restoreScrollLine, maxLine));
    });
  }, [deferredSnapshot, terminalReady]);

  return (
    <>
      <div ref={containerRef} className={`tp-xterm-root ${props.className ?? ""}`.trim()} />
      {SHOULD_EXPOSE_TEST_MIRRORS ? (
        <>
          <pre aria-hidden="true" data-testid="terminal-input-mirror" ref={inputMirrorRef} className="tp-terminal-text-mirror" />
          <pre aria-hidden="true" data-testid="terminal-output-mirror" className="tp-terminal-text-mirror">{props.snapshot}</pre>
        </>
      ) : null}
      {!terminalReady ? (
        <div className="tp-terminal-booting">
          {bootError ? (
            <div className="tp-terminal-booting-stack">
              <p className="tp-terminal-booting-title">终端加载失败</p>
              <p className="tp-terminal-booting-copy">{bootError}</p>
              <button
                type="button"
                className="tp-terminal-booting-retry"
                onClick={() => {
                  setBootError(null);
                  setBootNonce((current) => current + 1);
                }}
              >
                重试
              </button>
            </div>
          ) : (
            <>
              <span className="tp-terminal-booting-dot" />
              正在接入终端
            </>
          )}
        </div>
      ) : null}
    </>
  );
}));
