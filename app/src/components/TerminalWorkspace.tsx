import type { FormEvent, RefObject, SyntheticEvent } from "react";
import { useRef, useState } from "react";
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
  snapshotPending?: boolean;
  snapshotLag?: number;
  command: string;
  pasteBuffer: string;
  snapshot: string;
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
  const isMobileView = Boolean(props.onBack);
  const showFocusAction = Boolean(props.onToggleFocusMode);
  const [mobileKeyboardFocused, setMobileKeyboardFocused] = useState(false);
  const isManagedCommand = props.activeSession?.launchMode === "command";
  const exitHintTitle = isManagedCommand ? "退出方式" : "离开与结束";
  const exitHintBody = isManagedCommand
    ? "退出当前程序后，这条会话会一起结束。多数前台命令可直接用 Ctrl+C 退出。"
    : "临时离开用 Ctrl+B 然后按 D；彻底结束这条会话用 exit、Ctrl+D，或在外面关闭它。";
  const executionKeys = props.shortcutKeys.filter((shortcut) => ["enter", "ctrl_c", "ctrl_d"].includes(shortcut.key));
  const navigationKeys = props.shortcutKeys.filter((shortcut) => !["enter", "ctrl_c", "ctrl_d"].includes(shortcut.key));
  const helperKeys = navigationKeys.filter((shortcut) => !shortcut.key.startsWith("arrow_"));
  const mobileKeyboardToolKeys = props.shortcutKeys.filter((shortcut) => ["tab", "escape", "ctrl_c", "ctrl_d"].includes(shortcut.key));
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
  const keyboardStatusLabel = mobileKeyboardFocused ? "键盘已连接" : "点终端输入";

  const scrollSectionIntoView = (ref: RefObject<HTMLElement | null>) => {
    ref.current?.scrollIntoView({
      block: "start",
      inline: "nearest",
      behavior: "smooth",
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
        className={`flex min-h-12 items-center gap-3 rounded-[14px] border px-3 py-3 text-left transition disabled:opacity-40 ${toneClass}`}
        disabled={!props.activeSid || !props.canControl}
        onClick={() => props.onSendKey(shortcut.key)}
      >
        <span className="tp-keycap inline-flex min-w-10 items-center justify-center px-2 py-2 font-mono text-[13px]">
          {shortcut.chip}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{shortcut.label}</span>
          <span className="mt-0.5 block text-xs text-[var(--tp-text-muted)]">{shortcut.description}</span>
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

  const primeMobileKeyboardFocus = (event: SyntheticEvent<HTMLElement>) => {
    event.preventDefault();
    focusMobileKeyboard();
  };

  const renderCompactShortcutButton = (shortcut: ShortcutKeyMeta, emphasized = false) => (
    <button
      key={shortcut.key}
      className={`${
        emphasized && shortcut.tone === "primary"
          ? "tp-control-button-primary"
          : emphasized && shortcut.tone === "danger"
            ? "tp-control-button-danger"
            : "tp-control-button"
      } min-h-10 rounded-[14px] px-3 py-2 text-xs font-medium disabled:opacity-40`}
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
            <p className="mt-2 text-sm text-[var(--tp-text-muted)]">
              你可以先从左侧选择已有会话，或者新建一个。选中之后，这里才会显示输出和控制操作。
            </p>
          </div>
          <div className="tp-empty-grid mt-6">
            <div className="tp-card-muted px-4 py-4">
              <p className="mt-2 text-sm font-medium text-[var(--tp-text)]">选中一个会话</p>
              <p className="mt-1 text-xs text-[var(--tp-text-muted)]">优先查看正在运行的任务，方便继续跟进当前进度。</p>
            </div>
            <div className="tp-card-muted px-4 py-4">
              <p className="mt-2 text-sm font-medium text-[var(--tp-text)]">补一条命令</p>
              <p className="mt-1 text-xs text-[var(--tp-text-muted)]">快速输入适合短命令，右侧按钮适合回车、中断和补全。</p>
            </div>
            <div className="tp-card-muted px-4 py-4">
              <p className="mt-2 text-sm font-medium text-[var(--tp-text)]">继续同一上下文</p>
              <p className="mt-1 text-xs text-[var(--tp-text-muted)]">无论你在手机还是电脑查看，看到的都是同一条任务进度。</p>
            </div>
          </div>
        </div>
      </Panel>
    );
  }

  const mobileFocusContent = (
    <div className="tp-mobile-focus-terminal">
      <div
        className="tp-mobile-terminal-surface tp-mobile-focus-stage"
        data-testid="mobile-terminal-surface"
        onPointerDown={(event) => {
          event.preventDefault();
          focusMobileKeyboard();
        }}
        onClick={focusMobileKeyboard}
      >
        <div className="tp-terminal-frame h-full min-h-0 flex-1">
          <XtermTerminal
            key={props.activeSession.sid}
            ref={terminalRef}
            sessionKey={props.activeSession.sid}
            snapshot={props.snapshot}
            className="h-full"
            onData={props.onTerminalData}
            onResize={props.onTerminalResize}
            onSpecialKey={props.onSendKey}
            onFocusChange={setMobileKeyboardFocused}
          />
        </div>
        <div className="tp-mobile-focus-overlay">
          <button
            className={`${BUTTON_SECONDARY} min-h-9 px-3 py-2 text-[11px]`}
            type="button"
            onPointerDown={primeMobileKeyboardFocus}
            onClick={(event) => {
              event.stopPropagation();
              focusMobileKeyboard();
            }}
          >
            {mobileKeyboardFocused ? "已连接" : "键盘"}
          </button>
          {showFocusAction ? (
            <button
              className={`${BUTTON_PRIMARY} min-h-9 px-3 py-2 text-[11px]`}
              type="button"
              onClick={props.onToggleFocusMode}
            >
              退出
            </button>
          ) : null}
        </div>
      </div>
      <div className="tp-mobile-focus-control-dock" aria-label="专注模式控制工具">
        <button
          className={`${BUTTON_SECONDARY} min-h-10 px-3 py-2 text-xs`}
          type="button"
          onPointerDown={primeMobileKeyboardFocus}
          onClick={focusMobileKeyboard}
          disabled={!props.activeSid || !props.canControl}
        >
          键盘
        </button>
        {mobileFocusControlKeys.map((shortcut) => renderCompactShortcutButton(shortcut, true))}
      </div>
    </div>
  );

  const mobileDefaultContent = (
    <div className="space-y-3">
      <div className="tp-terminal-shell relative p-3">
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--tp-text)]">终端输出</p>
            <p className="truncate text-xs text-[var(--tp-text-soft)]">{props.activeSession.cwd}</p>
          </div>
          <span className={`tp-chip min-h-0 px-3 py-1 text-[11px] ${props.activeSession.status === "running" ? "tp-chip-active" : ""}`}>
            {syncChipLabel}
          </span>
        </div>
        <div
          className="tp-mobile-terminal-surface"
          data-testid="mobile-terminal-surface"
          onPointerDown={(event) => {
            event.preventDefault();
            focusMobileKeyboard();
          }}
          onClick={focusMobileKeyboard}
        >
          <div className="tp-terminal-frame h-[64svh] min-h-[520px]">
            <XtermTerminal
              key={props.activeSession.sid}
              ref={terminalRef}
              sessionKey={props.activeSession.sid}
              snapshot={props.snapshot}
              className="h-full"
              onData={props.onTerminalData}
              onResize={props.onTerminalResize}
              onSpecialKey={props.onSendKey}
              onFocusChange={setMobileKeyboardFocused}
            />
          </div>
        </div>
        <div className="tp-mobile-terminal-meta mt-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--tp-text)]">{keyboardStatusLabel}</p>
            <p className="mt-1 text-xs text-[var(--tp-text-soft)]">点终端正文后直接输入。手机键盘负责常规字符，特殊控制放到工具栏。</p>
          </div>
          <button
            className={`${BUTTON_SECONDARY} min-h-10 shrink-0 px-3 py-2 text-xs`}
            type="button"
            onPointerDown={primeMobileKeyboardFocus}
            onClick={focusMobileKeyboard}
            disabled={!props.activeSid || !props.canControl}
          >
            唤起键盘
          </button>
        </div>
        <div className="tp-mobile-terminal-toolbar mt-3">
          {props.onBack ? (
            <button
              className={`${BUTTON_SECONDARY} min-h-10 px-3 py-2 text-xs`}
              type="button"
              aria-label="返回会话列表"
              onClick={props.onBack}
            >
              返回
            </button>
          ) : null}
          <button
            className={`${BUTTON_SECONDARY} min-h-10 px-3 py-2 text-xs`}
            type="button"
            onPointerDown={primeMobileKeyboardFocus}
            onClick={focusMobileKeyboard}
          >
            键盘
          </button>
          <button
            className={`${BUTTON_SECONDARY} min-h-10 px-3 py-2 text-xs`}
            type="button"
            onClick={() => scrollSectionIntoView(toolsSectionRef)}
          >
            工具
          </button>
          {showFocusAction ? (
            <button className={`${BUTTON_PRIMARY} min-h-10 px-3 py-2 text-xs`} type="button" onClick={props.onToggleFocusMode}>
              专注模式
            </button>
          ) : null}
        </div>
      </div>

      <details ref={commandSectionRef} className="tp-card px-4 py-4" open>
        <summary className="tp-disclosure-summary list-none">
          <span>
            <span className="block text-sm font-medium text-[var(--tp-text)]">输入与键盘</span>
            <span className="mt-1 block text-xs font-normal text-[var(--tp-text-soft)]">命令补发和当前光标输入都放这里</span>
          </span>
        </summary>

        <form className="mt-4 space-y-4" onSubmit={props.onSubmitCommand}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-[var(--tp-text)]">快速输入</p>
              <p className="mt-1 text-xs text-[var(--tp-text-soft)]">补一条命令最方便，发送时会自动回车。</p>
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

        <div className="mt-4 border-t border-[var(--tp-border-soft)] pt-4">
          <div className="tp-card-muted px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-[var(--tp-text)]">手机键盘直连</p>
                <p className="mt-1 text-xs leading-5 text-[var(--tp-text-soft)]">
                  点上面的终端正文就能直接调起系统键盘。空格、符号、回车都走手机原生键盘；Tab、Esc、Ctrl 这类不顺手的键放到下面的控制工具里。
                </p>
              </div>
              <button
                className={`${BUTTON_SECONDARY} min-h-10 shrink-0 px-3 py-2 text-xs`}
                type="button"
                onPointerDown={primeMobileKeyboardFocus}
                disabled={!props.activeSid || !props.canControl}
                onClick={focusMobileKeyboard}
              >
                唤起键盘
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button
                className={`${BUTTON_SECONDARY} min-h-10 px-3 py-2 text-xs`}
                type="button"
                disabled={!props.activeSid || !props.canControl}
                onClick={() => props.onSendKey("enter")}
              >
                回车
              </button>
              {mobileKeyboardToolKeys.map((shortcut) => renderCompactShortcutButton(shortcut))}
            </div>
          </div>
        </div>
      </details>

      <details ref={toolsSectionRef} className="tp-card px-4 py-4">
        <summary className="tp-disclosure-summary list-none">
          <span>
            <span className="block text-sm font-medium text-[var(--tp-text)]">控制与工具</span>
            <span className="mt-1 block text-xs font-normal text-[var(--tp-text-soft)]">快捷键、多行粘贴和退出提示</span>
          </span>
        </summary>

        <div className="mt-4">
          <div className="mb-3">
            <p className="text-sm font-medium text-[var(--tp-text)]">快捷操作</p>
            <p className="mt-1 text-xs text-[var(--tp-text-soft)]">保持紧凑，把终端空间留给输出本身。</p>
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
              <span className="mt-1 block text-xs font-normal text-[var(--tp-text-soft)]">脚本、长 prompt、多行命令放这里</span>
            </span>
          </summary>
          <textarea
            className="tp-input mt-4 min-h-36 disabled:opacity-50"
            value={props.pasteBuffer}
            onChange={(event) => props.onPasteBufferChange(event.target.value)}
            placeholder="在这里粘贴多行内容。原样发送不会自动补回车；发送并回车会在末尾补一个回车。"
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

        <div className="mt-4 tp-card-muted px-4 py-4">
          <p className="text-sm font-medium text-[var(--tp-text)]">{exitHintTitle}</p>
          <p className="mt-2 text-xs leading-6 text-[var(--tp-text-soft)]">{exitHintBody}</p>
        </div>
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
              <p className="mt-2 max-w-2xl text-sm text-[var(--tp-text-muted)]">
                当前会话位于
                <span className="mx-1 font-mono text-[13px] text-[var(--tp-text)]">{props.activeSession.cwd}</span>
                。你可以继续查看输出、补命令，或发送常用控制操作。
              </p>
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
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
              <div className="tp-terminal-shell p-3">
                <div className="mb-3 flex items-center justify-between gap-3 px-1">
                  <div>
                    <p className="text-sm font-medium text-[var(--tp-text)]">终端输出</p>
                    <p className="text-xs text-[var(--tp-text-soft)]">这里显示当前会话的最新输出。</p>
                  </div>
                  <span className={`tp-chip min-h-0 px-3 py-1 text-[11px] ${props.activeSession.status === "running" ? "tp-chip-active" : ""}`}>
                    {syncChipLabel}
                  </span>
                </div>
                <div className="tp-terminal-frame h-[52svh] min-h-[440px] max-h-[720px]">
                  <XtermTerminal
                    key={props.activeSession.sid}
                    ref={terminalRef}
                    sessionKey={props.activeSession.sid}
                    snapshot={props.snapshot}
                    className="h-full"
                    onData={props.onTerminalData}
                    onResize={props.onTerminalResize}
                    onSpecialKey={props.onSendKey}
                    onFocusChange={setMobileKeyboardFocused}
                  />
                </div>
                {showFocusAction ? (
                  <button className="tp-mobile-focus-fab" type="button" onClick={props.onToggleFocusMode}>
                    {props.focusMode ? "退出专注" : "专注模式"}
                  </button>
                ) : null}
              </div>

              <div className="tp-card px-4 py-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-[var(--tp-text)]">直接终端输入</p>
                    <p className="mt-1 text-xs text-[var(--tp-text-soft)]">点终端本体后直接打字。补全、回车和中断仍然保留在这里做辅助。</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className={`${BUTTON_SECONDARY} min-h-9 px-3 py-2 text-xs`}
                      type="button"
                      disabled={!props.activeSid || !props.canControl}
                      onClick={() => focusMobileKeyboard()}
                    >
                      聚焦终端
                    </button>
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
                <div className="tp-card-muted px-4 py-4">
                  <p className="text-sm text-[var(--tp-text)]">
                    终端已经改为 `xterm.js` 控件。键盘、光标和选择都直接落在终端本体上，不再经过单独的 app 输入框。
                  </p>
                </div>
              </div>

              <div className="tp-card px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-[var(--tp-text)]">快速输入</p>
                    <p className="mt-1 text-xs text-[var(--tp-text-soft)]">适合补一条命令、确认一步操作，发送时会自动追加回车。</p>
                  </div>
                  <span className="tp-chip min-h-0 px-3 py-1 text-[11px]">当前会话</span>
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
                    <span className="mt-1 block text-xs font-normal text-[var(--tp-text-soft)]">脚本、长 prompt、多行命令放这里</span>
                  </span>
                </summary>
                <textarea
                  className="tp-input mt-4 min-h-36 disabled:opacity-50"
                  value={props.pasteBuffer}
                  onChange={(event) => props.onPasteBufferChange(event.target.value)}
                  placeholder="在这里粘贴多行内容。原样发送不会自动补回车；发送并回车会在末尾补一个回车。"
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

            <aside className="tp-sidebar-sticky space-y-4">
              <div className="tp-card px-4 py-4">
                <div className="mb-3">
                  <p className="text-sm font-medium text-[var(--tp-text)]">执行操作</p>
                  <p className="mt-1 text-xs text-[var(--tp-text-soft)]">回车、中断和结束输入都在这里。</p>
                </div>
                <div className="grid gap-3">
                  {executionKeys.map(renderShortcutButton)}
                </div>
              </div>

              <div className="tp-card px-4 py-4">
                <div className="mb-3">
                  <p className="text-sm font-medium text-[var(--tp-text)]">移动与补全</p>
                  <p className="mt-1 text-xs text-[var(--tp-text-soft)]">历史命令、方向键和补全都在这里。</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  {navigationKeys.map(renderShortcutButton)}
                </div>
              </div>

              <div className="tp-card px-4 py-4">
                <p className="text-sm font-medium text-[var(--tp-text)]">当前会话</p>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-[var(--tp-text-soft)]">名称</span>
                    <span className="text-right text-[var(--tp-text)]">{props.activeSession.name}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-[var(--tp-text-soft)]">目录</span>
                    <span className="max-w-[180px] text-right text-[var(--tp-text-muted)]">{props.activeSession.cwd}</span>
                  </div>
                </div>
              </div>

              <div className="tp-card px-4 py-4">
                <p className="text-sm font-medium text-[var(--tp-text)]">{exitHintTitle}</p>
                <p className="mt-2 text-xs leading-6 text-[var(--tp-text-soft)]">{exitHintBody}</p>
              </div>
            </aside>
          </div>
        )}

        {props.focusMode && isMobileView ? null : (
          <p className="text-xs text-[var(--tp-text-soft)]">
            当前模式是浏览器直开 PWA。适合查看流式输出、补命令和关闭会话，不适合重度长文本输入。
          </p>
        )}
      </div>
    </Panel>
  );
}
