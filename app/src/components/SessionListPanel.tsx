import type { SessionRecord } from "@termpilot/protocol";

import { Panel } from "./chrome";

type SessionStatusFilter = "all" | "running" | "exited";

interface SessionListPanelProps {
  canControl: boolean;
  sessions: SessionRecord[];
  filteredSessions: SessionRecord[];
  activeSid: string | null;
  pinnedSids: string[];
  sessionQuery: string;
  statusFilter: SessionStatusFilter;
  onSessionQueryChange: (value: string) => void;
  onStatusFilterChange: (value: SessionStatusFilter) => void;
  onTogglePinnedSession: (sid: string) => void;
  onSelectSession: (sid: string) => void;
  onKillSession: (sid: string) => void;
}

const FILTER_OPTIONS: Array<{ value: SessionStatusFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "running", label: "运行中" },
  { value: "exited", label: "已退出" },
];

export function SessionListPanel(props: SessionListPanelProps) {
  return (
    <Panel title="会话列表">
      <div className="space-y-3">
        <input
          className="w-full rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm outline-none placeholder:text-slate-500"
          value={props.sessionQuery}
          onChange={(event) => props.onSessionQueryChange(event.target.value)}
          placeholder="搜索会话名称或目录"
        />
        <div className="flex flex-wrap gap-2">
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={`min-h-11 rounded-full px-3 py-2 text-sm ${
                props.statusFilter === option.value
                  ? "bg-sky-500 text-slate-950"
                  : "border border-slate-700 text-slate-200"
              }`}
              type="button"
              onClick={() => props.onStatusFilterChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          当前显示 {props.filteredSessions.length} / {props.sessions.length} 个会话。置顶会话会始终排在最前面。
        </p>
        {props.filteredSessions.length === 0 ? (
          <p className="text-sm text-slate-400">
            {props.sessions.length === 0 ? "当前没有会话。" : "没有匹配当前搜索或筛选条件的会话。"}
          </p>
        ) : (
          props.filteredSessions.map((session) => (
            <div
              key={session.sid}
              data-session-name={session.name}
              className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                session.sid === props.activeSid
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
                  className={`rounded-full border px-3 py-1.5 text-xs ${
                    props.pinnedSids.includes(session.sid)
                      ? "border-amber-400/50 text-amber-200"
                      : "border-slate-700 text-slate-200"
                  }`}
                  type="button"
                  onClick={() => props.onTogglePinnedSession(session.sid)}
                >
                  {props.pinnedSids.includes(session.sid) ? "取消置顶" : "置顶"}
                </button>
                <button
                  className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-200"
                  type="button"
                  onClick={() => props.onSelectSession(session.sid)}
                >
                  查看
                </button>
                <button
                  className="rounded-full border border-rose-500/40 px-3 py-1.5 text-xs text-rose-200 disabled:opacity-40"
                  type="button"
                  disabled={session.status !== "running" || !props.canControl}
                  onClick={() => props.onKillSession(session.sid)}
                >
                  关闭
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}
