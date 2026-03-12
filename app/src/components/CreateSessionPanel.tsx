import type { FormEvent } from "react";

import { BUTTON_PRIMARY, Field, Panel } from "./chrome";

interface CreateSessionPanelProps {
  canControl: boolean;
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
        <Field label="名称" value={props.createName} onChange={props.onCreateNameChange} placeholder="claude-main" disabled={!props.canControl} />
        <Field label="工作目录" value={props.createCwd} onChange={props.onCreateCwdChange} placeholder="/Users/..." disabled={!props.canControl} />
        <Field label="Shell" value={props.createShell} onChange={props.onCreateShellChange} placeholder="/bin/zsh" disabled={!props.canControl} />
        <button className={`${BUTTON_PRIMARY} w-full`} type="submit" disabled={!props.canControl}>
          创建
        </button>
      </form>
    </Panel>
  );
}
