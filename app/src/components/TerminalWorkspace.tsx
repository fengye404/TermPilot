import type { FormEvent } from "react";
import type { InputKey, SessionRecord } from "@termpilot/protocol";

import { AnsiTerminalSnapshot } from "./AnsiTerminalSnapshot";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, Panel } from "./chrome";

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
  command: string;
  keyboardBridge: string;
  pasteBuffer: string;
  snapshot: string;
  shortcutKeys: ShortcutKeyMeta[];
  onBack?: () => void;
  onToggleFocusMode?: () => void;
  onCommandChange: (value: string) => void;
  onKeyboardBridgeChange: (value: string) => void;
  onKeyboardBridgeKey: (key: "enter" | "backspace" | "tab") => void;
  onSendCommandNow: () => void;
  onSubmitCommand: (event: FormEvent<HTMLFormElement>) => void;
  onPasteBufferChange: (value: string) => void;
  onSendPaste: (mode: "raw" | "line") => void;
  onSendKey: (key: InputKey) => void;
}

export function TerminalWorkspace(props: TerminalWorkspaceProps) {
  const isMobileView = Boolean(props.onBack);
  const showFocusAction = Boolean(props.onToggleFocusMode);
  const executionKeys = props.shortcutKeys.filter((shortcut) => ["enter", "ctrl_c", "ctrl_d"].includes(shortcut.key));
  const navigationKeys = props.shortcutKeys.filter((shortcut) => !["enter", "ctrl_c", "ctrl_d"].includes(shortcut.key));
  const helperKeys = navigationKeys.filter((shortcut) => !shortcut.key.startsWith("arrow_"));

  const renderShortcutButton = (shortcut: ShortcutKeyMeta) => {
    const toneClass = shortcut.tone === "primary"
      ? "border-[rgba(31,122,83,0.42)] bg-[rgba(31,122,83,0.12)] text-[#d8f3e6]"
      : shortcut.tone === "danger"
        ? "border-[rgba(204,104,86,0.34)] bg-[rgba(204,104,86,0.12)] text-[#ffd8d2]"
        : "border-[var(--tp-border)] bg-[rgba(8,13,17,0.86)] text-[var(--tp-text)]";

    return (
      <button
        key={shortcut.key}
        className={`flex min-h-12 items-center gap-3 rounded-[14px] border px-3 py-3 text-left transition disabled:opacity-40 ${toneClass}`}
        disabled={!props.activeSid || !props.canControl}
        onClick={() => props.onSendKey(shortcut.key)}
      >
        <span className="inline-flex min-w-10 items-center justify-center rounded-[12px] border border-white/10 bg-[rgba(8,13,17,0.86)] px-2 py-2 font-mono text-[13px] text-white">
          {shortcut.chip}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{shortcut.label}</span>
          <span className="mt-0.5 block text-xs text-[var(--tp-text-muted)]">{shortcut.description}</span>
        </span>
      </button>
    );
  };

  if (!props.activeSession) {
    return (
      <Panel title="当前未选择会话">
        <div className="tp-empty-state flex min-h-[56vh] flex-col justify-center px-6 py-12">
          <div className="mx-auto max-w-3xl text-center">
            <p className="mt-3 text-lg font-semibold text-white">先选择一个会话</p>
            <p className="mt-2 text-sm text-[var(--tp-text-muted)]">
              你可以先从左侧选择已有会话，或者新建一个。选中之后，这里才会显示输出和控制操作。
            </p>
          </div>
          <div className="tp-empty-grid mt-6">
            <div className="tp-card-muted px-4 py-4">
              <p className="mt-2 text-sm font-medium text-white">选中一个会话</p>
              <p className="mt-1 text-xs text-[var(--tp-text-muted)]">优先查看正在运行的任务，方便继续跟进当前进度。</p>
            </div>
            <div className="tp-card-muted px-4 py-4">
              <p className="mt-2 text-sm font-medium text-white">补一条命令</p>
              <p className="mt-1 text-xs text-[var(--tp-text-muted)]">快速输入适合短命令，右侧按钮适合回车、中断和补全。</p>
            </div>
            <div className="tp-card-muted px-4 py-4">
              <p className="mt-2 text-sm font-medium text-white">继续同一上下文</p>
              <p className="mt-1 text-xs text-[var(--tp-text-muted)]">无论你在手机还是电脑查看，看到的都是同一条任务进度。</p>
            </div>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title={`${props.activeSession.name} · ${props.activeSession.status === "running" ? "运行中" : "已退出"}`}>
      <div className="flex h-full min-h-[68vh] flex-col gap-4">
        <div className="tp-panel-header">
          <div>
            <p className="mt-2 max-w-2xl text-sm text-[var(--tp-text-muted)]">
              当前会话位于
              <span className="mx-1 font-mono text-[13px] text-white">{props.activeSession.cwd}</span>
              。你可以继续查看输出、补命令，或发送常用控制操作。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`tp-chip ${props.activeSession.status === "running" ? "tp-chip-active" : "tp-chip-danger"}`}>
              {props.activeSession.status === "running" ? "运行中" : "已退出"}
            </span>
          </div>
        </div>

        {props.onBack ? (
          <button className={`${BUTTON_SECONDARY} inline-flex min-h-11 w-fit items-center`} type="button" onClick={props.onBack}>
            返回会话列表
          </button>
        ) : null}

        {isMobileView ? (
          <div className="space-y-4">
            <div className="tp-terminal-shell relative p-3">
              <div className="mb-3 flex items-center justify-between gap-3 px-1">
                <div>
                  <p className="text-sm font-medium text-white">终端输出</p>
                  <p className="text-xs text-[var(--tp-text-soft)]">和电脑看到的是同一条会话内容。</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`tp-chip min-h-0 px-3 py-1 text-[11px] ${props.activeSession.status === "running" ? "tp-chip-active" : ""}`}>
                    {props.activeSession.status === "running" ? "实时同步" : "已结束"}
                  </span>
                </div>
              </div>
              <div className={`${props.focusMode ? "h-[72svh] min-h-[540px]" : "h-[56svh] min-h-[460px]"} overflow-auto rounded-[14px] border border-[var(--tp-border)] bg-[#071014] p-3`}>
                <AnsiTerminalSnapshot snapshot={props.snapshot} />
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
                  <p className="text-sm font-medium text-white">终端键盘</p>
                  <p className="mt-1 text-xs text-[var(--tp-text-soft)]">手机软键盘输入会直接写进当前光标位置，回车立即发送。</p>
                </div>
                <button
                  className={`${BUTTON_SECONDARY} min-h-9 px-3 py-2 text-xs`}
                  type="button"
                  disabled={!props.activeSid || !props.canControl}
                  onClick={() => props.onKeyboardBridgeKey("enter")}
                >
                  回车
                </button>
              </div>
              <input
                className="tp-input min-h-11 disabled:opacity-50"
                value={props.keyboardBridge}
                onChange={(event) => props.onKeyboardBridgeChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    props.onKeyboardBridgeKey("enter");
                    return;
                  }
                  if (event.key === "Backspace" && props.keyboardBridge.length === 0) {
                    props.onKeyboardBridgeKey("backspace");
                    return;
                  }
                  if (event.key === "Tab") {
                    event.preventDefault();
                    props.onKeyboardBridgeKey("tab");
                  }
                }}
                placeholder="点这里唤起键盘，直接往当前光标输入"
                enterKeyHint="send"
                autoCapitalize="off"
                autoCorrect="off"
                disabled={!props.activeSid || !props.canControl}
              />
            </div>

            <form className="tp-card px-4 py-4" onSubmit={props.onSubmitCommand}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">快速输入</p>
                  <p className="mt-1 text-xs text-[var(--tp-text-soft)]">补一条命令最方便，发送时会自动回车。</p>
                </div>
                <button className={`${BUTTON_PRIMARY} min-h-9 px-4 py-2 text-sm`} type="submit" disabled={!props.activeSid || !props.canControl}>
                  发送
                </button>
              </div>
              <input
                className="tp-input mt-4 min-h-14 disabled:opacity-50"
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

            <div className="tp-card px-4 py-4">
              <div className="mb-3">
                <p className="text-sm font-medium text-white">快捷操作</p>
                <p className="mt-1 text-xs text-[var(--tp-text-soft)]">全部收成紧凑按钮，减少对终端区域的挤压。</p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {executionKeys.map((shortcut) => (
                  <button
                    key={shortcut.key}
                    className={`min-h-11 rounded-[14px] border px-2 py-2 text-center text-xs font-medium disabled:opacity-40 ${
                      shortcut.tone === "primary"
                        ? "border-[rgba(31,122,83,0.42)] bg-[rgba(31,122,83,0.12)] text-[#d8f3e6]"
                        : shortcut.tone === "danger"
                          ? "border-[rgba(204,104,86,0.34)] bg-[rgba(204,104,86,0.12)] text-[#ffd8d2]"
                          : "border-[var(--tp-border)] bg-[rgba(8,13,17,0.86)] text-[var(--tp-text)]"
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
                    className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-[var(--tp-border)] bg-[rgba(8,13,17,0.86)] text-lg text-[var(--tp-text)] disabled:opacity-40"
                    type="button"
                    disabled={!props.activeSid || !props.canControl}
                    onClick={() => props.onSendKey("arrow_left")}
                  >
                    ←
                  </button>
                </div>
                <div className="grid gap-2">
                  <button
                    className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-[var(--tp-border)] bg-[rgba(8,13,17,0.86)] text-lg text-[var(--tp-text)] disabled:opacity-40"
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
                    className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-[var(--tp-border)] bg-[rgba(8,13,17,0.86)] text-lg text-[var(--tp-text)] disabled:opacity-40"
                    type="button"
                    disabled={!props.activeSid || !props.canControl}
                    onClick={() => props.onSendKey("arrow_down")}
                  >
                    ↓
                  </button>
                </div>
                <div className="flex justify-start">
                  <button
                    className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-[var(--tp-border)] bg-[rgba(8,13,17,0.86)] text-lg text-[var(--tp-text)] disabled:opacity-40"
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
                    className="min-h-10 rounded-[14px] border border-[var(--tp-border)] bg-[rgba(8,13,17,0.86)] px-2 py-2 text-xs text-[var(--tp-text)] disabled:opacity-40"
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

            <details className="tp-card px-4 py-4">
              <summary className="tp-disclosure-summary list-none">
                <span>
                  <span className="block text-sm font-medium text-white">多行粘贴</span>
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
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
              <div className="tp-terminal-shell p-3">
                <div className="mb-3 flex items-center justify-between gap-3 px-1">
                  <div>
                    <p className="text-sm font-medium text-white">终端输出</p>
                    <p className="text-xs text-[var(--tp-text-soft)]">这里显示当前会话的最新输出。</p>
                  </div>
                  <span className={`tp-chip min-h-0 px-3 py-1 text-[11px] ${props.activeSession.status === "running" ? "tp-chip-active" : ""}`}>
                    {props.activeSession.status === "running" ? "实时同步" : "已结束"}
                  </span>
                </div>
                <div className="h-[52svh] min-h-[440px] max-h-[720px] overflow-auto rounded-[14px] border border-[var(--tp-border)] bg-[#071014] p-3">
                  <AnsiTerminalSnapshot snapshot={props.snapshot} />
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
                    <p className="text-sm font-medium text-white">终端键盘</p>
                    <p className="mt-1 text-xs text-[var(--tp-text-soft)]">用于交互式提示、单字符输入和当前光标位置补字。</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className={`${BUTTON_SECONDARY} min-h-9 px-3 py-2 text-xs`}
                      type="button"
                      disabled={!props.activeSid || !props.canControl}
                      onClick={() => props.onKeyboardBridgeKey("tab")}
                    >
                      补全
                    </button>
                    <button
                      className={`${BUTTON_SECONDARY} min-h-9 px-3 py-2 text-xs`}
                      type="button"
                      disabled={!props.activeSid || !props.canControl}
                      onClick={() => props.onKeyboardBridgeKey("enter")}
                    >
                      回车
                    </button>
                  </div>
                </div>
                <input
                  className="tp-input min-h-11 disabled:opacity-50"
                  value={props.keyboardBridge}
                  onChange={(event) => props.onKeyboardBridgeChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      props.onKeyboardBridgeKey("enter");
                      return;
                    }
                    if (event.key === "Backspace" && props.keyboardBridge.length === 0) {
                      props.onKeyboardBridgeKey("backspace");
                      return;
                    }
                    if (event.key === "Tab") {
                      event.preventDefault();
                      props.onKeyboardBridgeKey("tab");
                    }
                  }}
                  placeholder="点这里直接往当前光标位置输入"
                  autoCapitalize="off"
                  autoCorrect="off"
                  disabled={!props.activeSid || !props.canControl}
                />
              </div>

              <div className="tp-card px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">快速输入</p>
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
                    <span className="block text-sm font-medium text-white">多行粘贴</span>
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
                  <p className="text-sm font-medium text-white">执行操作</p>
                  <p className="mt-1 text-xs text-[var(--tp-text-soft)]">回车、中断和结束输入都在这里。</p>
                </div>
                <div className="grid gap-3">
                  {executionKeys.map(renderShortcutButton)}
                </div>
              </div>

              <div className="tp-card px-4 py-4">
                <div className="mb-3">
                  <p className="text-sm font-medium text-white">移动与补全</p>
                  <p className="mt-1 text-xs text-[var(--tp-text-soft)]">历史命令、方向键和补全都在这里。</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  {navigationKeys.map(renderShortcutButton)}
                </div>
              </div>

              <div className="tp-card px-4 py-4">
                <p className="text-sm font-medium text-white">当前会话</p>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-[var(--tp-text-soft)]">名称</span>
                    <span className="text-right text-white">{props.activeSession.name}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-[var(--tp-text-soft)]">目录</span>
                    <span className="max-w-[180px] text-right text-[var(--tp-text-muted)]">{props.activeSession.cwd}</span>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        )}

        <p className="text-xs text-[var(--tp-text-soft)]">
          当前模式是浏览器直开 PWA。适合查看流式输出、补命令和关闭会话，不适合重度长文本输入。
        </p>
      </div>
    </Panel>
  );
}
