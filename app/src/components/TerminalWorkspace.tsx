import type { FormEvent, RefObject } from "react";
import type { InputKey, SessionRecord } from "@termpilot/protocol";

import { Panel } from "./chrome";

interface TerminalWorkspaceProps {
  activeSession: SessionRecord | null;
  activeSid: string | null;
  canControl: boolean;
  command: string;
  pasteBuffer: string;
  shortcutKeys: Array<{ key: InputKey; label: string }>;
  terminalRef: RefObject<HTMLDivElement | null>;
  onCommandChange: (value: string) => void;
  onSubmitCommand: (event: FormEvent<HTMLFormElement>) => void;
  onPasteBufferChange: (value: string) => void;
  onSendPaste: (mode: "raw" | "line") => void;
  onSendKey: (key: InputKey) => void;
}

export function TerminalWorkspace(props: TerminalWorkspaceProps) {
  return (
    <Panel title={props.activeSession ? `${props.activeSession.name} · ${props.activeSession.status === "running" ? "运行中" : "已退出"}` : "当前未选择会话"}>
      <div className="flex h-full min-h-[68vh] flex-col gap-4">
        <div className="flex flex-wrap gap-2 md:sticky md:top-0 md:z-10 md:bg-slate-900/72 md:pb-2">
          {props.shortcutKeys.map(({ key, label }) => (
            <button
              key={key}
              className="min-h-11 rounded-full border border-slate-700 px-3 py-2 text-sm text-slate-200 disabled:opacity-40"
              disabled={!props.activeSid || !props.canControl}
              onClick={() => props.onSendKey(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-[440px] flex-1 overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/95 p-3">
          <div ref={props.terminalRef} className="h-full w-full overflow-hidden" />
        </div>

        <form className="flex flex-col gap-3 md:flex-row" onSubmit={props.onSubmitCommand}>
          <input
            className="flex-1 rounded-full border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm outline-none ring-0 placeholder:text-slate-500 disabled:opacity-50"
            value={props.command}
            onChange={(event) => props.onCommandChange(event.target.value)}
            placeholder="输入命令，发送时会自动追加回车"
            disabled={!props.activeSid || !props.canControl}
          />
          <button className="rounded-full bg-sky-500 px-5 py-3 text-sm font-medium text-slate-950 disabled:opacity-60" type="submit" disabled={!props.activeSid || !props.canControl}>
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
            value={props.pasteBuffer}
            onChange={(event) => props.onPasteBufferChange(event.target.value)}
            placeholder="在这里粘贴多行内容。原样发送不会自动补回车；发送并回车会在末尾补一个回车。"
            disabled={!props.activeSid || !props.canControl}
          />
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <button
              className="min-h-11 flex-1 rounded-full border border-slate-700 px-4 py-3 text-sm text-slate-200 disabled:opacity-40"
              type="button"
              disabled={!props.activeSid || !props.canControl || !props.pasteBuffer}
              onClick={() => props.onSendPaste("raw")}
            >
              原样发送
            </button>
            <button
              className="min-h-11 flex-1 rounded-full bg-emerald-400 px-4 py-3 text-sm font-medium text-slate-950 disabled:opacity-40"
              type="button"
              disabled={!props.activeSid || !props.canControl || !props.pasteBuffer}
              onClick={() => props.onSendPaste("line")}
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
  );
}
