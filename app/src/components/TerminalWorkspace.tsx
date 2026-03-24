import type { FormEvent, PointerEvent as ReactPointerEvent, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import type { InputKey, SessionRecord } from "@termpilot/protocol";

import { BUTTON_PRIMARY, BUTTON_SECONDARY, Panel } from "./chrome";
import { XtermTerminal, type XtermTerminalHandle } from "./XtermTerminal";

interface ShortcutKeyMeta {
  key: InputKey;
  label: string;
  chip: string;
  description: string;
  tone?: "neutral" | "danger" | "primary";
}

interface TerminalWorkspaceProps {
  activeSession: SessionRecord | null;
  activeSid: string | null;
  canControl: boolean;
  focusMode?: boolean;
  focusRotateTerminal?: boolean;
  snapshotPending?: boolean;
  snapshotLag?: number;
  command: string;
  pasteBuffer: string;
  snapshot: string;
  cursor: { row: number; col: number } | null;
  shortcutKeys: ShortcutKeyMeta[];
  onBack?: () => void;
  onToggleFocusMode?: () => void;
  onCommandChange: (value: string) => void;
  onSendCommandNow: () => void;
  onSubmitCommand: (event: FormEvent<HTMLFormElement>) => void;
  onPasteBufferChange: (value: string) => void;
  onSendPaste: (mode: "raw" | "line") => void;
  onTerminalData: (data: string) => void;
  onTerminalResize: (cols: number, rows: number) => void;
  onSendKey: (key: InputKey) => void;
}

export function TerminalWorkspace(props: TerminalWorkspaceProps) {
  const toolsSectionRef = useRef<HTMLDetailsElement | null>(null);
  const commandSectionRef = useRef<HTMLDetailsElement | null>(null);
  const terminalRef = useRef<XtermTerminalHandle | null>(null);
  const touchGestureRef = useRef<{
    pointerId: number | null;
    startX: number;
    startY: number;
    moved: boolean;
    longPress: boolean;
    timer: number | null;
  }>({
    pointerId: null,
    startX: 0,
    startY: 0,
    moved: false,
    longPress: false,
    timer: null,
  });
  const isMobileView = Boolean(props.onBack);
  const showFocusAction = Boolean(props.onToggleFocusMode);
  const [focusToolsOpen, setFocusToolsOpen] = useState(false);
  const executionKeys = props.shortcutKeys.filter((shortcut) => ["enter", "ctrl_c", "ctrl_d"].includes(shortcut.key));
  const navigationKeys = props.shortcutKeys.filter((shortcut) => !["enter", "ctrl_c", "ctrl_d"].includes(shortcut.key));
  const helperKeys = navigationKeys.filter((shortcut) => !shortcut.key.startsWith("arrow_"));
  const mobileFocusControlKeys = props.shortcutKeys.filter((shortcut) => [
    "enter",
    "tab",
    "escape",
    "ctrl_c",
    "ctrl_d",
    "arrow_up",
    "arrow_down",
    "arrow_left",
    "arrow_right",
  ].includes(shortcut.key));
  const syncChipLabel = props.activeSession?.status === "running"
    ? props.snapshotPending
      ? `补帧中${typeof props.snapshotLag === "number" && props.snapshotLag > 0 ? ` · ${props.snapshotLag}` : ""}`
      : "实时同步"
    : "已结束";
  const focusToolsSheetId = props.activeSid ? `tp-focus-tools-${props.activeSid}` : "tp-focus-tools";
  const mobileCompactTerminalKey = props.activeSession ? `${props.activeSession.sid}:mobile-compact` : "mobile-compact";
  const mobileFocusTerminalKey = props.activeSession
    ? `${props.activeSession.sid}:mobile-focus:${props.focusRotateTerminal ? "rotated" : "inline"}`
    : "mobile-focus";

  const scrollSectionIntoView = (ref: RefObject<HTMLElement | null>) => {
    ref.current?.scrollIntoView({
      block: "start",
      inline: "nearest",
      behavior: "smooth",
    });
  };

  const openDetailsAndScroll = (ref: RefObject<HTMLDetailsElement | null>) => {
    if (ref.current && !ref.current.open) {
      ref.current.open = true;
    }
    window.requestAnimationFrame(() => {
      scrollSectionIntoView(ref);
    });
  };

  const renderShortcutButton = (shortcut: ShortcutKeyMeta) => {
    const toneClass = shortcut.tone === "primary"
      ? "tp-control-button-primary"
      : shortcut.tone === "danger"
        ? "tp-control-button-danger"
        : "tp-control-button";

    return (
      <button
        key={shortcut.key}
        className={`tp-rail-button flex min-h-11 items-center gap-3 rounded-[16px] border px-3 py-3 text-left transition disabled:opacity-40 ${toneClass}`}
        disabled={!props.activeSid || !props.canControl}
        onClick={() => props.onSendKey(shortcut.key)}
      >
        <span className="tp-keycap inline-flex min-w-10 items-center justify-center px-2 py-2 font-mono text-[13px]">
          {shortcut.chip}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{shortcut.label}</span>
          <span className="mt-0.5 block truncate text-[11px] text-[var(--tp-text-muted)]">{shortcut.description}</span>
        </span>
      </button>
    );
  };

  const focusMobileKeyboard = () => {
    if (!props.activeSid || !props.canControl) {
      return;
    }
    terminalRef.current?.focus();
  };

  const clearTouchGestureTimer = () => {
    const timer = touchGestureRef.current.timer;
    if (timer !== null) {
      window.clearTimeout(timer);
      touchGestureRef.current.timer = null;
    }
  };

  const handleMobileTerminalPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType !== "touch") {
      return;
    }

    clearTouchGestureTimer();
    touchGestureRef.current.pointerId = event.pointerId;
    touchGestureRef.current.startX = event.clientX;
    touchGestureRef.current.startY = event.clientY;
    touchGestureRef.current.moved = false;
    touchGestureRef.current.longPress = false;
    touchGestureRef.current.timer = window.setTimeout(() => {
      touchGestureRef.current.longPress = true;
      touchGestureRef.current.timer = null;
    }, 180);
  };

  const handleMobileTerminalPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType !== "touch" || touchGestureRef.current.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = Math.abs(event.clientX - touchGestureRef.current.startX);
    const deltaY = Math.abs(event.clientY - touchGestureRef.current.startY);
    if (deltaX > 8 || deltaY > 8) {
      touchGestureRef.current.moved = true;
      clearTouchGestureTimer();
    }
  };

  const handleMobileTerminalPointerEnd = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType !== "touch" || touchGestureRef.current.pointerId !== event.pointerId) {
      return;
    }

    const shouldFocusKeyboard = !touchGestureRef.current.moved && !touchGestureRef.current.longPress;
    clearTouchGestureTimer();
    touchGestureRef.current.pointerId = null;
    touchGestureRef.current.moved = false;
    touchGestureRef.current.longPress = false;

    if (shouldFocusKeyboard) {
      focusMobileKeyboard();
    }
  };

  useEffect(() => {
    if (props.focusMode) {
      setFocusToolsOpen(false);
    }
  }, [props.activeSid, props.focusMode]);

  useEffect(() => () => {
    clearTouchGestureTimer();
  }, []);

  const renderCompactShortcutButton = (shortcut: ShortcutKeyMeta, emphasized = false, extraClassName = "") => (
    <button
      key={shortcut.key}
      className={`${
        emphasized && shortcut.tone === "primary"
          ? "tp-control-button-primary"
          : emphasized && shortcut.tone === "danger"
            ? "tp-control-button-danger"
            : "tp-control-button"
      } min-h-10 rounded-[14px] px-3 py-2 text-xs font-medium disabled:opacity-40 ${extraClassName}`.trim()}
      type="button"
      disabled={!props.activeSid || !props.canControl}
      onClick={() => props.onSendKey(shortcut.key)}
    >
      <span className="block font-mono text-[12px] opacity-80">{shortcut.chip}</span>
      <span className="mt-0.5 block">{shortcut.label}</span>
    </button>
  );

  if (!props.activeSession) {
    return (
      <Panel title="当前未选择会话">
        <div className="tp-empty-state flex min-h-[56vh] flex-col justify-center px-6 py-12">
          <div className="mx-auto max-w-3xl text-center">
            <p className="mt-3 text-lg font-semibold text-[var(--tp-text)]">先选择一个会话</p>
          </div>
        </div>
      </Panel>
    );
  }

  const mobileFocusContent = (
    <div className="tp-mobile-focus-terminal">
      <div
        className={`tp-mobile-terminal-surface tp-mobile-focus-stage ${props.focusRotateTerminal ? "tp-mobile-focus-stage-rotated-shell" : ""}`.trim()}
        data-testid="mobile-terminal-surface"
        onPointerDown={handleMobileTerminalPointerDown}
        onPointerMove={handleMobileTerminalPointerMove}
        onPointerUp={handleMobileTerminalPointerEnd}
        onPointerCancel={handleMobileTerminalPointerEnd}
      >
        {props.focusRotateTerminal ? (
          <div className="tp-mobile-focus-rotated-viewport">
            <div className="tp-terminal-frame tp-mobile-focus-frame min-h-0">
              <XtermTerminal
                key={mobileFocusTerminalKey}
                ref={terminalRef}
                sessionKey={mobileFocusTerminalKey}
                snapshot={props.snapshot}
                cursor={props.cursor}
                className="h-full"
                fontPreset="focus"
                onData={props.onTerminalData}
                onResize={props.onTerminalResize}
                onSpecialKey={props.onSendKey}
              />
            </div>
            <div className="tp-mobile-focus-overlay">
              <button
                className={`${BUTTON_SECONDARY} tp-mobile-focus-chip`}
                type="button"
                aria-expanded={focusToolsOpen}
                aria-controls={focusToolsSheetId}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  setFocusToolsOpen((open) => !open);
                }}
              >
                {focusToolsOpen ? "收起工具" : "工具"}
              </button>
              {showFocusAction ? (
                <button
                  className={`${BUTTON_PRIMARY} tp-mobile-focus-chip`}
                  type="button"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={props.onToggleFocusMode}
                >
                  退出
                </button>
              ) : null}
            </div>
            {focusToolsOpen ? (
              <div
                id={focusToolsSheetId}
                className="tp-mobile-focus-tools-sheet"
                aria-label="专注模式控制工具"
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                }}
              >
                <div className="tp-mobile-focus-tools-header">
                  <div>
                    <p className="text-sm font-medium text-[var(--tp-text)]">控制工具</p>
                  </div>
                  <button
                    className={`${BUTTON_SECONDARY} min-h-9 px-3 py-2 text-[11px]`}
                    type="button"
                    onClick={() => {
                      setFocusToolsOpen(false);
                    }}
                  >
                    收起
                  </button>
                </div>
                <div className="tp-mobile-focus-tools-grid">
                  {mobileFocusControlKeys.map((shortcut) => renderCompactShortcutButton(shortcut, true, "tp-mobile-focus-shortcut"))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <div className="h-full">
              <div className="tp-terminal-frame tp-mobile-focus-frame h-full min-h-0 flex-1">
                <XtermTerminal
                  key={mobileFocusTerminalKey}
                  ref={terminalRef}
                  sessionKey={mobileFocusTerminalKey}
                  snapshot={props.snapshot}
                  cursor={props.cursor}
                  className="h-full"
                  fontPreset="focus"
                  onData={props.onTerminalData}
                  onResize={props.onTerminalResize}
                  onSpecialKey={props.onSendKey}
                />
              </div>
            </div>
            <div className="tp-mobile-focus-overlay">
              <button
                className={`${BUTTON_SECONDARY} tp-mobile-focus-chip`}
                type="button"
                aria-expanded={focusToolsOpen}
                aria-controls={focusToolsSheetId}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  setFocusToolsOpen((open) => !open);
                }}
              >
                {focusToolsOpen ? "收起工具" : "工具"}
              </button>
              {showFocusAction ? (
                <button
                  className={`${BUTTON_PRIMARY} tp-mobile-focus-chip`}
                  type="button"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={props.onToggleFocusMode}
                >
                  退出
                </button>
              ) : null}
            </div>
            {focusToolsOpen ? (
              <div
                id={focusToolsSheetId}
                className="tp-mobile-focus-tools-sheet"
                aria-label="专注模式控制工具"
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                }}
              >
                <div className="tp-mobile-focus-tools-header">
                  <div>
                    <p className="text-sm font-medium text-[var(--tp-text)]">控制工具</p>
                  </div>
                  <button
                    className={`${BUTTON_SECONDARY} min-h-9 px-3 py-2 text-[11px]`}
                    type="button"
                    onClick={() => {
                      setFocusToolsOpen(false);
                    }}
                  >
                    收起
                  </button>
                </div>
                <div className="tp-mobile-focus-tools-grid">
                  {mobileFocusControlKeys.map((shortcut) => renderCompactShortcutButton(shortcut, true, "tp-mobile-focus-shortcut"))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );

  const mobileDefaultContent = (
    <div className="space-y-2.5">
      <div className="tp-terminal-shell tp-mobile-session-terminal-shell relative p-2.5">
        <div className="tp-mobile-session-terminal-header mb-2.5 flex items-center justify-between gap-2 px-0.5">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-[var(--tp-text)]">终端输出</p>
            <p className="truncate text-[11px] text-[var(--tp-text-soft)]">{props.activeSession.cwd}</p>
          </div>
          <span className={`tp-chip min-h-0 px-3 py-1 text-[11px] ${props.activeSession.status === "running" ? "tp-chip-active" : ""}`}>
            {syncChipLabel}
          </span>
        </div>
        <div
          className="tp-mobile-terminal-surface"
          data-testid="mobile-terminal-surface"
          onPointerDown={handleMobileTerminalPointerDown}
          onPointerMove={handleMobileTerminalPointerMove}
          onPointerUp={handleMobileTerminalPointerEnd}
          onPointerCancel={handleMobileTerminalPointerEnd}
        >
          <div className="tp-terminal-frame tp-mobile-session-terminal-frame h-[64svh] min-h-[520px]">
            <XtermTerminal
              key={mobileCompactTerminalKey}
              ref={terminalRef}
              sessionKey={mobileCompactTerminalKey}
              snapshot={props.snapshot}
              cursor={props.cursor}
              className="h-full"
              fontPreset="compact"
              onData={props.onTerminalData}
              onResize={props.onTerminalResize}
              onSpecialKey={props.onSendKey}
            />
          </div>
        </div>
        <div className="tp-mobile-terminal-toolbar mt-3">
          <button
            className={`${BUTTON_SECONDARY} min-h-9 px-3 py-2 text-[11px]`}
            type="button"
            onClick={() => openDetailsAndScroll(toolsSectionRef)}
          >
            工具
          </button>
          {showFocusAction ? (
            <button className={`${BUTTON_PRIMARY} min-h-9 px-3 py-2 text-[11px]`} type="button" onClick={props.onToggleFocusMode}>
              专注模式
            </button>
          ) : null}
        </div>
      </div>

      <details ref={commandSectionRef} className="tp-card px-3.5 py-3.5" open>
        <summary className="tp-disclosure-summary list-none">
          <span>
            <span className="block text-[13px] font-medium text-[var(--tp-text)]">输入与键盘</span>
          </span>
        </summary>

        <form className="mt-4 space-y-4" onSubmit={props.onSubmitCommand}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[13px] font-medium text-[var(--tp-text)]">快速输入</p>
            </div>
            <button className={`${BUTTON_PRIMARY} min-h-9 px-4 py-2 text-sm`} type="submit" disabled={!props.activeSid || !props.canControl}>
              发送
            </button>
          </div>
          <input
            className="tp-input min-h-14 disabled:opacity-50"
            value={props.command}
            onChange={(event) => props.onCommandChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                props.onSendCommandNow();
              }
            }}
            placeholder="例如：claude code / git status / npm test"
            enterKeyHint="send"
            disabled={!props.activeSid || !props.canControl}
          />
        </form>
      </details>

      <details ref={toolsSectionRef} className="tp-card px-3.5 py-3.5">
        <summary className="tp-disclosure-summary list-none">
          <span>
            <span className="block text-[13px] font-medium text-[var(--tp-text)]">控制与工具</span>
          </span>
        </summary>

        <div className="mt-4">
          <div className="mb-3">
            <p className="text-[13px] font-medium text-[var(--tp-text)]">快捷操作</p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {executionKeys.map((shortcut) => (
              <button
                key={shortcut.key}
                className={`min-h-11 rounded-[14px] border px-2 py-2 text-center text-xs font-medium disabled:opacity-40 ${
                  shortcut.tone === "primary"
                    ? "tp-control-button-primary"
                    : shortcut.tone === "danger"
                      ? "tp-control-button-danger"
                      : "tp-control-button"
                }`}
                disabled={!props.activeSid || !props.canControl}
                onClick={() => props.onSendKey(shortcut.key)}
              >
                <span className="block font-mono text-[12px] opacity-80">{shortcut.chip}</span>
                <span className="mt-0.5 block">{shortcut.label}</span>
              </button>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className="flex justify-end">
              <button
                className="tp-control-button flex h-11 w-11 items-center justify-center text-lg disabled:opacity-40"
                type="button"
                disabled={!props.activeSid || !props.canControl}
                onClick={() => props.onSendKey("arrow_left")}
              >
                ←
              </button>
            </div>
            <div className="grid gap-2">
              <button
                className="tp-control-button flex h-11 w-11 items-center justify-center text-lg disabled:opacity-40"
                type="button"
                disabled={!props.activeSid || !props.canControl}
                onClick={() => props.onSendKey("arrow_up")}
              >
                ↑
              </button>
              <button
                className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-[rgba(198,145,47,0.34)] bg-[rgba(198,145,47,0.12)] text-[11px] font-medium text-[#f2d79f] disabled:opacity-40"
                type="button"
                disabled={!props.activeSid || !props.canControl}
                onClick={() => props.onSendKey("escape")}
              >
                Esc
              </button>
              <button
                className="tp-control-button flex h-11 w-11 items-center justify-center text-lg disabled:opacity-40"
                type="button"
                disabled={!props.activeSid || !props.canControl}
                onClick={() => props.onSendKey("arrow_down")}
              >
                ↓
              </button>
            </div>
            <div className="flex justify-start">
              <button
                className="tp-control-button flex h-11 w-11 items-center justify-center text-lg disabled:opacity-40"
                type="button"
                disabled={!props.activeSid || !props.canControl}
                onClick={() => props.onSendKey("arrow_right")}
              >
                →
              </button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            {helperKeys.map((shortcut) => (
              <button
                key={shortcut.key}
                className="tp-control-button min-h-10 px-2 py-2 text-xs disabled:opacity-40"
                type="button"
                disabled={!props.activeSid || !props.canControl}
                onClick={() => props.onSendKey(shortcut.key)}
              >
                <span className="block font-mono text-[12px] opacity-80">{shortcut.chip}</span>
                <span className="mt-0.5 block">{shortcut.label}</span>
              </button>
            ))}
          </div>
        </div>

        <details className="mt-4 tp-card-muted px-4 py-4">
          <summary className="tp-disclosure-summary list-none">
            <span>
              <span className="block text-sm font-medium text-[var(--tp-text)]">多行粘贴</span>
            </span>
          </summary>
          <textarea
            className="tp-input mt-4 min-h-36 disabled:opacity-50"
            value={props.pasteBuffer}
            onChange={(event) => props.onPasteBufferChange(event.target.value)}
            placeholder="粘贴多行内容"
            disabled={!props.activeSid || !props.canControl}
          />
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <button
              className={`${BUTTON_SECONDARY} min-h-12 flex-1 px-4 py-3 text-sm`}
              type="button"
              disabled={!props.activeSid || !props.canControl || !props.pasteBuffer}
              onClick={() => props.onSendPaste("raw")}
            >
              原样发送
            </button>
            <button
              className={`${BUTTON_PRIMARY} min-h-12 flex-1 px-4 py-3 text-sm`}
              type="button"
              disabled={!props.activeSid || !props.canControl || !props.pasteBuffer}
              onClick={() => props.onSendPaste("line")}
            >
              发送并回车
            </button>
          </div>
        </details>
      </details>
    </div>
  );

  return (
    <Panel
      title={`${props.activeSession.name} · ${props.activeSession.status === "running" ? "运行中" : "已退出"}`}
      hideHeader={isMobileView && props.focusMode}
      className={isMobileView && props.focusMode ? "tp-mobile-focus-panel h-full border-0 bg-transparent px-0 py-0 sm:px-0" : undefined}
      bodyClassName={isMobileView && props.focusMode ? "h-full" : undefined}
    >
      <div className={`flex h-full min-h-[68vh] flex-col gap-4 ${isMobileView && props.focusMode ? "min-h-full gap-3" : ""}`}>
        {isMobileView && props.focusMode ? null : (
          <div className="tp-panel-header">
            <div>
              {isMobileView && props.onBack ? (
                <button
                  className={`${BUTTON_SECONDARY} mb-3 min-h-9 px-3 py-2 text-[11px]`}
                  type="button"
                  aria-label="返回会话列表"
                  onClick={props.onBack}
                >
                  返回
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={`tp-chip ${props.activeSession.status === "running" ? "tp-chip-active" : "tp-chip-danger"}`}>
                {props.activeSession.status === "running" ? "运行中" : "已退出"}
              </span>
            </div>
          </div>
        )}

        {isMobileView ? (
          props.focusMode ? mobileFocusContent : mobileDefaultContent
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-4">
              <div className="tp-terminal-shell tp-desktop-terminal-shell p-3">
                <div className="mb-3 flex items-center justify-between gap-3 px-1">
                  <div>
                    <p className="text-sm font-medium text-[var(--tp-text)]">终端输出</p>
                  </div>
                  <span className={`tp-chip min-h-0 px-3 py-1 text-[11px] ${props.activeSession.status === "running" ? "tp-chip-active" : ""}`}>
                    {syncChipLabel}
                  </span>
                </div>
                <div className="tp-terminal-frame tp-desktop-terminal-frame h-[52svh] min-h-[440px] max-h-[720px]">
                  <XtermTerminal
                    key={props.activeSession.sid}
                    ref={terminalRef}
                    sessionKey={props.activeSession.sid}
                    snapshot={props.snapshot}
                    cursor={props.cursor}
                    className="h-full"
                    fontPreset="default"
                    onData={props.onTerminalData}
                    onResize={props.onTerminalResize}
                    onSpecialKey={props.onSendKey}
                  />
                </div>
                {showFocusAction ? (
                  <button className="tp-mobile-focus-fab" type="button" onClick={props.onToggleFocusMode}>
                    {props.focusMode ? "退出专注" : "专注模式"}
                  </button>
                ) : null}
              </div>

              <div className="tp-card px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-[var(--tp-text)]">快速输入</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className={`${BUTTON_SECONDARY} min-h-9 px-3 py-2 text-xs`}
                      type="button"
                      disabled={!props.activeSid || !props.canControl}
                      onClick={() => props.onSendKey("enter")}
                    >
                      回车
                    </button>
                  </div>
                </div>
                <form className="mt-4 flex flex-col gap-3 md:flex-row" onSubmit={props.onSubmitCommand}>
                  <input
                    className="tp-input min-h-14 flex-1 disabled:opacity-50"
                    value={props.command}
                    onChange={(event) => props.onCommandChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                        event.preventDefault();
                        props.onSendCommandNow();
                      }
                    }}
                    placeholder="例如：claude code / git status / npm test"
                    enterKeyHint="send"
                    disabled={!props.activeSid || !props.canControl}
                  />
                  <button className={`${BUTTON_PRIMARY} min-h-14 px-5 py-3 text-sm`} type="submit" disabled={!props.activeSid || !props.canControl}>
                    发送命令
                  </button>
                </form>
              </div>

              <details className="tp-card px-4 py-4">
                <summary className="tp-disclosure-summary list-none">
                  <span>
                    <span className="block text-sm font-medium text-[var(--tp-text)]">多行粘贴</span>
                  </span>
                </summary>
                <textarea
                  className="tp-input mt-4 min-h-36 disabled:opacity-50"
                  value={props.pasteBuffer}
                  onChange={(event) => props.onPasteBufferChange(event.target.value)}
                  placeholder="粘贴多行内容"
                  disabled={!props.activeSid || !props.canControl}
                />
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <button
                    className={`${BUTTON_SECONDARY} min-h-12 flex-1 px-4 py-3 text-sm`}
                    type="button"
                    disabled={!props.activeSid || !props.canControl || !props.pasteBuffer}
                    onClick={() => props.onSendPaste("raw")}
                  >
                    原样发送
                  </button>
                  <button
                    className={`${BUTTON_PRIMARY} min-h-12 flex-1 px-4 py-3 text-sm`}
                    type="button"
                    disabled={!props.activeSid || !props.canControl || !props.pasteBuffer}
                    onClick={() => props.onSendPaste("line")}
                  >
                    发送并回车
                  </button>
                </div>
              </details>
            </div>

            <aside className="tp-sidebar-sticky space-y-3">
              <div className="tp-card px-4 py-4">
                <div className="mb-3">
                  <p className="text-sm font-medium text-[var(--tp-text)]">执行</p>
                </div>
                <div className="grid gap-3">
                  {executionKeys.map(renderShortcutButton)}
                </div>
              </div>

              <div className="tp-card px-4 py-4">
                <div className="mb-3">
                  <p className="text-sm font-medium text-[var(--tp-text)]">导航</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  {navigationKeys.map(renderShortcutButton)}
                </div>
              </div>

              <div className="tp-card px-4 py-4">
                <p className="text-sm font-medium text-[var(--tp-text)]">当前会话</p>
                <div className="mt-3 space-y-3 text-sm">
                  <div className="space-y-1">
                    <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--tp-text-soft)]">名称</span>
                    <p className="truncate text-[var(--tp-text)]">{props.activeSession.name}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--tp-text-soft)]">目录</span>
                    <p className="tp-path-block text-[var(--tp-text-muted)]">{props.activeSession.cwd}</p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>
    </Panel>
  );
}
