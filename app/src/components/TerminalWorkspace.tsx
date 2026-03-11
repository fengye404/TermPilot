import type { FormEvent, Ref } from "react";
import type { InputKey, SessionRecord } from "@termpilot/protocol";

import { Panel } from "./chrome";

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
  command: string;
  pasteBuffer: string;
  shortcutKeys: ShortcutKeyMeta[];
  terminalHostRef: Ref<HTMLDivElement>;
  onBack?: () => void;
  onCommandChange: (value: string) => void;
  onSubmitCommand: (event: FormEvent<HTMLFormElement>) => void;
  onPasteBufferChange: (value: string) => void;
  onSendPaste: (mode: "raw" | "line") => void;
  onSendKey: (key: InputKey) => void;
}

export function TerminalWorkspace(props: TerminalWorkspaceProps) {
  const isMobileView = Boolean(props.onBack);
  const executionKeys = props.shortcutKeys.filter((shortcut) => ["enter", "ctrl_c", "ctrl_d"].includes(shortcut.key));
  const navigationKeys = props.shortcutKeys.filter((shortcut) => !["enter", "ctrl_c", "ctrl_d"].includes(shortcut.key));
  const helperKeys = navigationKeys.filter((shortcut) => !shortcut.key.startsWith("arrow_"));

  const renderShortcutButton = (shortcut: ShortcutKeyMeta) => {
    const toneClass = shortcut.tone === "primary"
      ? "border-sky-400/40 bg-sky-500/10 text-sky-100"
      : shortcut.tone === "danger"
        ? "border-rose-400/40 bg-rose-500/10 text-rose-100"
        : "border-slate-700/80 bg-slate-950/60 text-slate-100";

    return (
      <button
        key={shortcut.key}
        className={`flex min-h-14 items-center gap-3 rounded-2xl border px-3 py-3 text-left transition disabled:opacity-40 ${toneClass}`}
        disabled={!props.activeSid || !props.canControl}
        onClick={() => props.onSendKey(shortcut.key)}
      >
        <span className="inline-flex min-w-11 items-center justify-center rounded-xl border border-white/10 bg-slate-950/80 px-2 py-2 font-mono text-[13px] text-white">
          {shortcut.chip}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{shortcut.label}</span>
          <span className="mt-0.5 block text-xs text-slate-400">{shortcut.description}</span>
        </span>
      </button>
    );
  };

  return (
    <Panel title={props.activeSession ? `${props.activeSession.name} · ${props.activeSession.status === "running" ? "运行中" : "已退出"}` : "当前未选择会话"}>
      {!props.activeSession ? (
        <div className="flex min-h-[56vh] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-700 bg-slate-950/35 px-6 py-12 text-center">
          <p className="text-sm font-semibold text-white">先选择一个会话</p>
          <p className="mt-2 max-w-md text-sm text-slate-400">
            你可以在左侧查看已有会话，或者先创建一个新的 tmux 会话。选中之后这里才会显示终端输出和输入控件。
          </p>
        </div>
      ) : (
        <div className="flex h-full min-h-[68vh] flex-col gap-4">
          {props.onBack ? (
            <button
              className="inline-flex min-h-11 w-fit items-center rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200"
              type="button"
              onClick={props.onBack}
            >
              返回会话列表
            </button>
          ) : null}
          {isMobileView ? (
            <div className="space-y-4">
              <div className="rounded-[28px] border border-slate-800 bg-slate-950/90 p-3 shadow-[0_24px_80px_rgba(2,6,23,0.45)]">
                <div className="mb-3 flex items-center justify-between gap-3 px-1">
                  <div>
                    <p className="text-sm font-medium text-white">终端输出</p>
                    <p className="text-xs text-slate-500">和电脑看的是同一个 tmux 会话。</p>
                  </div>
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-200">
                    {props.activeSession.status === "running" ? "实时同步" : "已结束"}
                  </span>
                </div>
                <div className="h-[56svh] min-h-[460px] overflow-hidden rounded-[22px] border border-slate-800 bg-[#020617] p-3">
                  <div ref={props.terminalHostRef} className="h-full min-h-full w-full overflow-hidden" />
                </div>
              </div>

              <form className="rounded-[28px] border border-slate-800 bg-slate-900/80 p-4 shadow-xl shadow-slate-950/25" onSubmit={props.onSubmitCommand}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">快速输入</p>
                    <p className="mt-1 text-xs text-slate-500">补一条命令最方便，发送时会自动回车。</p>
                  </div>
                  <button
                    className="min-h-10 rounded-full bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-60"
                    type="submit"
                    disabled={!props.activeSid || !props.canControl}
                  >
                    发送
                  </button>
                </div>
                <input
                  className="mt-4 min-h-14 w-full rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-[16px] outline-none ring-0 placeholder:text-slate-500 disabled:opacity-50"
                  value={props.command}
                  onChange={(event) => props.onCommandChange(event.target.value)}
                  placeholder="例如：claude code / git status / npm test"
                  disabled={!props.activeSid || !props.canControl}
                />
              </form>

              <div className="rounded-[28px] border border-slate-800 bg-slate-900/72 p-4">
                <div className="mb-3">
                  <p className="text-sm font-medium text-white">快捷操作</p>
                  <p className="mt-1 text-xs text-slate-500">常用控制优先平铺，方向键做成更像终端遥控器的布局。</p>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {executionKeys.map((shortcut) => (
                    <button
                      key={shortcut.key}
                      className={`min-h-14 rounded-2xl border px-3 py-3 text-center text-sm font-medium disabled:opacity-40 ${
                        shortcut.tone === "primary"
                          ? "border-sky-400/40 bg-sky-500/10 text-sky-100"
                          : shortcut.tone === "danger"
                            ? "border-rose-400/40 bg-rose-500/10 text-rose-100"
                            : "border-slate-700/80 bg-slate-950/60 text-slate-100"
                      }`}
                      disabled={!props.activeSid || !props.canControl}
                      onClick={() => props.onSendKey(shortcut.key)}
                    >
                      <span className="block font-mono text-[13px] opacity-80">{shortcut.chip}</span>
                      <span className="mt-1 block">{shortcut.label}</span>
                    </button>
                  ))}
                </div>

                <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <div className="flex justify-end">
                    <button
                      className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-700 bg-slate-950/60 text-xl text-slate-100 disabled:opacity-40"
                      type="button"
                      disabled={!props.activeSid || !props.canControl}
                      onClick={() => props.onSendKey("arrow_left")}
                    >
                      ←
                    </button>
                  </div>
                  <div className="grid gap-3">
                    <button
                      className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-700 bg-slate-950/60 text-xl text-slate-100 disabled:opacity-40"
                      type="button"
                      disabled={!props.activeSid || !props.canControl}
                      onClick={() => props.onSendKey("arrow_up")}
                    >
                      ↑
                    </button>
                    <button
                      className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-500/10 text-sm font-medium text-amber-100 disabled:opacity-40"
                      type="button"
                      disabled={!props.activeSid || !props.canControl}
                      onClick={() => props.onSendKey("escape")}
                    >
                      Esc
                    </button>
                    <button
                      className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-700 bg-slate-950/60 text-xl text-slate-100 disabled:opacity-40"
                      type="button"
                      disabled={!props.activeSid || !props.canControl}
                      onClick={() => props.onSendKey("arrow_down")}
                    >
                      ↓
                    </button>
                  </div>
                  <div className="flex justify-start">
                    <button
                      className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-700 bg-slate-950/60 text-xl text-slate-100 disabled:opacity-40"
                      type="button"
                      disabled={!props.activeSid || !props.canControl}
                      onClick={() => props.onSendKey("arrow_right")}
                    >
                      →
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  {helperKeys.map((shortcut) => (
                    <button
                      key={shortcut.key}
                      className="min-h-12 rounded-2xl border border-slate-700 bg-slate-950/60 px-3 py-3 text-sm text-slate-100 disabled:opacity-40"
                      type="button"
                      disabled={!props.activeSid || !props.canControl}
                      onClick={() => props.onSendKey(shortcut.key)}
                    >
                      <span className="block font-mono text-[13px] opacity-80">{shortcut.chip}</span>
                      <span className="mt-1 block">{shortcut.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <details className="rounded-[28px] border border-slate-800 bg-slate-900/72 p-4">
                <summary className="cursor-pointer list-none text-sm font-medium text-white">
                  多行粘贴
                  <span className="ml-2 text-xs font-normal text-slate-500">脚本、长 prompt、多行命令放这里</span>
                </summary>
                <textarea
                  className="mt-4 min-h-36 w-full rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-[16px] outline-none placeholder:text-slate-500 disabled:opacity-50"
                  value={props.pasteBuffer}
                  onChange={(event) => props.onPasteBufferChange(event.target.value)}
                  placeholder="在这里粘贴多行内容。原样发送不会自动补回车；发送并回车会在末尾补一个回车。"
                  disabled={!props.activeSid || !props.canControl}
                />
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <button
                    className="min-h-12 flex-1 rounded-2xl border border-slate-700 px-4 py-3 text-sm text-slate-200 disabled:opacity-40"
                    type="button"
                    disabled={!props.activeSid || !props.canControl || !props.pasteBuffer}
                    onClick={() => props.onSendPaste("raw")}
                  >
                    原样发送
                  </button>
                  <button
                    className="min-h-12 flex-1 rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-medium text-slate-950 disabled:opacity-40"
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
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_312px]">
              <div className="space-y-4">
                <div className="rounded-[28px] border border-slate-800 bg-slate-950/90 p-3 shadow-[0_24px_80px_rgba(2,6,23,0.45)]">
                  <div className="mb-3 flex items-center justify-between gap-3 px-1">
                    <div>
                      <p className="text-sm font-medium text-white">终端输出</p>
                      <p className="text-xs text-slate-500">这里显示同一个 tmux 会话的实时快照输出。</p>
                    </div>
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-200">
                      {props.activeSession.status === "running" ? "实时同步" : "已结束"}
                    </span>
                  </div>
                  <div className="h-[52svh] min-h-[440px] max-h-[720px] overflow-hidden rounded-[22px] border border-slate-800 bg-[#020617] p-3">
                    <div ref={props.terminalHostRef} className="h-full min-h-full w-full overflow-hidden" />
                  </div>
                </div>

                <div className="rounded-[28px] border border-slate-800 bg-slate-900/72 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-white">快速输入</p>
                      <p className="mt-1 text-xs text-slate-500">适合补一条命令、确认一步操作，发送时会自动追加回车。</p>
                    </div>
                    <span className="rounded-full border border-slate-700 px-3 py-1 text-[11px] text-slate-400">
                      当前会话
                    </span>
                  </div>
                  <form className="mt-4 flex flex-col gap-3 md:flex-row" onSubmit={props.onSubmitCommand}>
                    <input
                      className="min-h-14 flex-1 rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-[16px] outline-none ring-0 placeholder:text-slate-500 disabled:opacity-50"
                      value={props.command}
                      onChange={(event) => props.onCommandChange(event.target.value)}
                      placeholder="例如：claude code / git status / npm test"
                      disabled={!props.activeSid || !props.canControl}
                    />
                    <button
                      className="min-h-14 rounded-2xl bg-sky-500 px-5 py-3 text-sm font-medium text-slate-950 disabled:opacity-60"
                      type="submit"
                      disabled={!props.activeSid || !props.canControl}
                    >
                      发送命令
                    </button>
                  </form>
                </div>

                <details className="rounded-[28px] border border-slate-800 bg-slate-900/72 p-4">
                  <summary className="cursor-pointer list-none text-sm font-medium text-white">
                    多行粘贴
                    <span className="ml-2 text-xs font-normal text-slate-500">脚本、长 prompt、多行命令放这里</span>
                  </summary>
                  <textarea
                    className="mt-4 min-h-36 w-full rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-[16px] outline-none placeholder:text-slate-500 disabled:opacity-50"
                    value={props.pasteBuffer}
                    onChange={(event) => props.onPasteBufferChange(event.target.value)}
                    placeholder="在这里粘贴多行内容。原样发送不会自动补回车；发送并回车会在末尾补一个回车。"
                    disabled={!props.activeSid || !props.canControl}
                  />
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                    <button
                      className="min-h-12 flex-1 rounded-2xl border border-slate-700 px-4 py-3 text-sm text-slate-200 disabled:opacity-40"
                      type="button"
                      disabled={!props.activeSid || !props.canControl || !props.pasteBuffer}
                      onClick={() => props.onSendPaste("raw")}
                    >
                      原样发送
                    </button>
                    <button
                      className="min-h-12 flex-1 rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-medium text-slate-950 disabled:opacity-40"
                      type="button"
                      disabled={!props.activeSid || !props.canControl || !props.pasteBuffer}
                      onClick={() => props.onSendPaste("line")}
                    >
                      发送并回车
                    </button>
                  </div>
                </details>
              </div>

              <aside className="space-y-4">
                <div className="rounded-[28px] border border-slate-800 bg-slate-900/72 p-4">
                  <div className="mb-3">
                    <p className="text-sm font-medium text-white">执行操作</p>
                    <p className="mt-1 text-xs text-slate-500">把最常用的几类控制集中到右侧，不再散成一排丑按钮。</p>
                  </div>
                  <div className="grid gap-3">
                    {executionKeys.map(renderShortcutButton)}
                  </div>
                </div>

                <div className="rounded-[28px] border border-slate-800 bg-slate-900/72 p-4">
                  <div className="mb-3">
                    <p className="text-sm font-medium text-white">移动与补全</p>
                    <p className="mt-1 text-xs text-slate-500">参考 WeTTY / ttyd 这类网页终端的做法，用紧凑的快捷控制代替原来那种裸文本按钮。</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    {navigationKeys.map(renderShortcutButton)}
                  </div>
                </div>
              </aside>
            </div>
          )}
          <p className="text-xs text-slate-500">
            当前模式是浏览器直开 PWA。适合查看流式输出、补命令和关闭会话，不适合重度长文本输入。
          </p>
        </div>
      )}
    </Panel>
  );
}
