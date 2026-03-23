import type { SessionRecord } from "@termpilot/protocol";
import { memo, useEffect, useMemo, useState } from "react";

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
  suspectedOrphanedCount: number;
  cleanupPending: boolean;
  onSessionQueryChange: (value: string) => void;
  onStatusFilterChange: (value: SessionStatusFilter) => void;
  onTogglePinnedSession: (sid: string) => void;
  onSelectSession: (sid: string) => void;
  onKillSession: (sid: string) => void;
  onCleanupSuspectedSessions: () => void;
}

const FILTER_OPTIONS: Array<{ value: SessionStatusFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "running", label: "运行中" },
  { value: "exited", label: "已退出" },
];
const PAGE_SIZE = 6;

function formatRelativeTime(iso: string | null | undefined, nowMs: number): string {
  if (!iso) {
    return "未知";
  }
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) {
    return "未知";
  }
  const diffMs = Math.max(0, nowMs - timestamp);
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 1) {
    return "刚刚";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} 分钟前`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} 小时前`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} 天前`;
}

function formatRemaining(targetIso: string | null | undefined, nowMs: number): string {
  if (!targetIso) {
    return "等待计算";
  }
  const timestamp = Date.parse(targetIso);
  if (!Number.isFinite(timestamp)) {
    return "等待计算";
  }
  const diffMs = Math.max(0, timestamp - nowMs);
  if (diffMs < 60_000) {
    return "1 分钟内";
  }
  const diffMinutes = Math.ceil(diffMs / 60_000);
  if (diffMinutes < 60) {
    return `约 ${diffMinutes} 分钟`;
  }
  const diffHours = Math.ceil(diffMinutes / 60);
  if (diffHours < 24) {
    return `约 ${diffHours} 小时`;
  }
  const diffDays = Math.ceil(diffHours / 24);
  return `约 ${diffDays} 天`;
}

export function SessionListPanel(props: SessionListPanelProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [page, setPage] = useState(1);
  const sessionCounts = useMemo(() => {
    let running = 0;
    let exited = 0;
    let managedRunning = 0;
    for (const session of props.sessions) {
      if (session.status === "running") {
        running += 1;
        if (session.launchMode === "command") {
          managedRunning += 1;
        }
      } else if (session.status === "exited") {
        exited += 1;
      }
    }
    return { running, exited, managedRunning };
  }, [props.sessions]);
  const pinnedCount = props.pinnedSids.length;
  const pageCount = Math.max(1, Math.ceil(props.filteredSessions.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleSessions = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return props.filteredSessions.slice(start, start + PAGE_SIZE);
  }, [currentPage, props.filteredSessions]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, sessionCounts.managedRunning > 0 ? 30_000 : 60_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [sessionCounts.managedRunning]);

  useEffect(() => {
    setPage(1);
  }, [props.sessionQuery, props.statusFilter]);

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  return (
    <Panel title="会话列表">
      <div className="space-y-3">
        <div className="tp-session-overview">
          <div className="tp-session-overview-item">
            <span className="tp-session-overview-label">总会话</span>
            <span className="tp-session-overview-value">{props.sessions.length}</span>
          </div>
          <div className="tp-session-overview-item">
            <span className="tp-session-overview-label">运行中</span>
            <span className="tp-session-overview-value">{sessionCounts.running}</span>
          </div>
          <div className="tp-session-overview-item">
            <span className="tp-session-overview-label">已退出</span>
            <span className="tp-session-overview-value">{sessionCounts.exited}</span>
          </div>
          <div className="tp-session-overview-item">
            <span className="tp-session-overview-label">置顶</span>
            <span className="tp-session-overview-value">{pinnedCount}</span>
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
        <div className="tp-session-list-meta">
          <p className="text-xs text-[var(--tp-text-soft)]">
            当前显示 {props.filteredSessions.length} / {props.sessions.length} 个会话
          </p>
          {pageCount > 1 ? (
            <div className="tp-session-pagination">
              <button
                className="tp-session-pagination-button"
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                上一页
              </button>
              <span className="tp-session-pagination-label">{currentPage} / {pageCount}</span>
              <button
                className="tp-session-pagination-button"
                type="button"
                disabled={currentPage >= pageCount}
                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
              >
                下一页
              </button>
            </div>
          ) : null}
        </div>
        {props.suspectedOrphanedCount > 0 ? (
          <div className="tp-card-muted flex items-center justify-between gap-3 px-3 py-3">
            <div>
              <p className="text-sm font-medium text-[var(--tp-text)]">发现疑似残留会话</p>
              <p className="mt-1 text-xs text-[var(--tp-text-soft)]">
                当前有 {props.suspectedOrphanedCount} 条托管命令会话已无人附着且长时间无输出，默认会在 12 小时后自动回收。
              </p>
            </div>
            <button
              className={`${BUTTON_DANGER} min-h-10 px-4 py-2 text-xs`}
              type="button"
              disabled={!props.canControl || props.cleanupPending}
              onClick={props.onCleanupSuspectedSessions}
            >
              {props.cleanupPending ? "正在清理…" : `一键清理 ${props.suspectedOrphanedCount} 条`}
            </button>
          </div>
        ) : null}
        {props.filteredSessions.length === 0 ? (
          <p className="text-sm text-[var(--tp-text-muted)]">
            {props.sessions.length === 0 ? "当前没有会话。" : "没有匹配当前搜索或筛选条件的会话。"}
          </p>
        ) : (
          <div className="tp-session-list-stack">
            {visibleSessions.map((session) => (
              <SessionCard
                key={session.sid}
                session={session}
                active={session.sid === props.activeSid}
                pinned={props.pinnedSids.includes(session.sid)}
                canControl={props.canControl}
                nowMs={nowMs}
                onTogglePinnedSession={props.onTogglePinnedSession}
                onSelectSession={props.onSelectSession}
                onKillSession={props.onKillSession}
              />
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

interface SessionCardProps {
  session: SessionRecord;
  active: boolean;
  pinned: boolean;
  canControl: boolean;
  nowMs: number;
  onTogglePinnedSession: (sid: string) => void;
  onSelectSession: (sid: string) => void;
  onKillSession: (sid: string) => void;
}

const SessionCard = memo(function SessionCard(props: SessionCardProps) {
  const { session, active, pinned, canControl, nowMs } = props;

  return (
    <div
      data-session-name={session.name}
      className={`tp-session-card ${active ? "tp-session-card-active" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium text-[var(--tp-text)]">{session.name}</p>
            <span className={`tp-chip min-h-0 whitespace-nowrap px-2.5 py-1 text-[11px] ${session.status === "running" ? "tp-chip-active" : ""}`}>
              {session.status === "running" ? "运行中" : "已退出"}
            </span>
            {pinned ? <span className="tp-chip tp-chip-warning min-h-0 px-2.5 py-1 text-[11px]">已置顶</span> : null}
          </div>
          <p className="mt-1 truncate text-xs text-[var(--tp-text-muted)]">{session.cwd}</p>
          {session.launchMode === "command" && session.status === "running" ? (
            <>
              <div className="mt-2 flex flex-wrap gap-2">
                {(session.attachedClientCount ?? 0) === 0 ? (
                  <span className="tp-chip tp-chip-warning min-h-0 px-2.5 py-1 text-[11px]">无人附着</span>
                ) : null}
                {session.suspectedOrphaned ? (
                  <span className="tp-chip tp-chip-danger min-h-0 px-2.5 py-1 text-[11px]">疑似残留</span>
                ) : null}
              </div>
              <div className="mt-2 space-y-1 text-[11px] text-[var(--tp-text-soft)]">
                <p>上次输出 {formatRelativeTime(session.lastOutputAt ?? session.lastActivityAt, nowMs)}</p>
                {(session.attachedClientCount ?? 0) === 0 && session.detachedAt ? (
                  <p>离开会话 {formatRelativeTime(session.detachedAt, nowMs)}</p>
                ) : null}
                {(session.attachedClientCount ?? 0) === 0 && session.autoCleanupAt ? (
                  <p>
                    {session.suspectedOrphaned ? "预计" : "若持续空闲，预计"} {formatRemaining(session.autoCleanupAt, nowMs)}后自动清理
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className={`tp-chip min-h-0 px-3 py-1.5 text-xs ${pinned ? "tp-chip-warning" : ""}`}
          type="button"
          onClick={() => props.onTogglePinnedSession(session.sid)}
        >
          {pinned ? "取消置顶" : "置顶"}
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
          disabled={session.status !== "running" || !canControl}
          onClick={() => props.onKillSession(session.sid)}
        >
          关闭
        </button>
      </div>
    </div>
  );
}, (prev, next) => (
  prev.session === next.session
  && prev.active === next.active
  && prev.pinned === next.pinned
  && prev.canControl === next.canControl
  && Math.floor(prev.nowMs / 30_000) === Math.floor(next.nowMs / 30_000)
));
