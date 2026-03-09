import type { FormEvent } from "react";

import { Field, Panel } from "./chrome";

interface CreateSessionPanelProps {
  createName: string;
  createCwd: string;
  createShell: string;
  onCreateNameChange: (value: string) => void;
  onCreateCwdChange: (value: string) => void;
  onCreateShellChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function CreateSessionPanel(props: CreateSessionPanelProps) {
  return (
    <Panel title="创建会话">
      <form className="space-y-3" onSubmit={props.onSubmit}>
        <Field label="名称" value={props.createName} onChange={props.onCreateNameChange} placeholder="claude-main" />
        <Field label="工作目录" value={props.createCwd} onChange={props.onCreateCwdChange} placeholder="/Users/..." />
        <Field label="Shell" value={props.createShell} onChange={props.onCreateShellChange} placeholder="/bin/zsh" />
        <button className="w-full rounded-full bg-emerald-400 px-4 py-2.5 text-sm font-medium text-slate-950" type="submit">
          创建
        </button>
      </form>
    </Panel>
  );
}
