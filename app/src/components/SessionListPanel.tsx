import type { SessionRecord } from "@termpilot/protocol";

import { BUTTON_DANGER, BUTTON_SECONDARY, Panel } from "./chrome";

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
  const runningCount = props.sessions.filter((session) => session.status === "running").length;
  const exitedCount = props.sessions.filter((session) => session.status === "exited").length;
  const pinnedCount = props.pinnedSids.length;

  return (
    <Panel title="会话列表">
      <div className="space-y-3">
        <div className="tp-kicker">Sessions</div>
        <div className="tp-stat-grid">
          <div className="tp-stat-card">
            <div className="tp-stat-label">总会话</div>
            <div className="tp-stat-value">{props.sessions.length}</div>
          </div>
          <div className="tp-stat-card">
            <div className="tp-stat-label">运行中</div>
            <div className="tp-stat-value">{runningCount}</div>
          </div>
          <div className="tp-stat-card">
            <div className="tp-stat-label">已退出</div>
            <div className="tp-stat-value">{exitedCount}</div>
          </div>
          <div className="tp-stat-card">
            <div className="tp-stat-label">已置顶</div>
            <div className="tp-stat-value">{pinnedCount}</div>
          </div>
        </div>
        <input
          className="tp-input"
          value={props.sessionQuery}
          onChange={(event) => props.onSessionQueryChange(event.target.value)}
          placeholder="搜索会话名称或目录"
        />
        <div className="flex flex-wrap gap-2">
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={`tp-chip ${
                props.statusFilter === option.value
                  ? "tp-chip-active"
                  : ""
              }`}
              type="button"
              onClick={() => props.onStatusFilterChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-[var(--tp-text-soft)]">
          当前显示 {props.filteredSessions.length} / {props.sessions.length} 个会话。置顶会话会始终排在最前面。
        </p>
        {props.filteredSessions.length === 0 ? (
          <p className="text-sm text-[var(--tp-text-muted)]">
            {props.sessions.length === 0 ? "当前没有会话。" : "没有匹配当前搜索或筛选条件的会话。"}
          </p>
        ) : (
          props.filteredSessions.map((session) => (
            <div
              key={session.sid}
              data-session-name={session.name}
              className={`tp-session-card ${
                session.sid === props.activeSid
                  ? "tp-session-card-active"
                  : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-white">{session.name}</p>
                  <p className="mt-1 text-xs text-[var(--tp-text-muted)]">{session.cwd}</p>
                  <p className="mt-2 text-[11px] text-[var(--tp-text-soft)]">
                    {session.backend} · 最近帧 {session.lastSeq}
                  </p>
                </div>
                <span className={`tp-chip min-h-0 px-2.5 py-1 text-[11px] ${session.status === "running" ? "tp-chip-active" : ""}`}>
                  {session.status === "running" ? "运行中" : "已退出"}
                </span>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  className={`tp-chip min-h-0 px-3 py-1.5 text-xs ${
                    props.pinnedSids.includes(session.sid)
                      ? "tp-chip-warning"
                      : ""
                  }`}
                  type="button"
                  onClick={() => props.onTogglePinnedSession(session.sid)}
                >
                  {props.pinnedSids.includes(session.sid) ? "取消置顶" : "置顶"}
                </button>
                <button
                  className={`${BUTTON_SECONDARY} min-h-0 px-3 py-1.5 text-xs`}
                  type="button"
                  onClick={() => props.onSelectSession(session.sid)}
                >
                  查看
                </button>
                <button
                  className={`${BUTTON_DANGER} min-h-0 px-3 py-1.5 text-xs`}
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
