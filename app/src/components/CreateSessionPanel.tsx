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
        <div className="tp-panel-copy">
          为长期任务新建一个会话。创建后，你可以在电脑和手机上继续查看同一条上下文。
        </div>
        <Field label="名称" value={props.createName} onChange={props.onCreateNameChange} placeholder="claude-main" disabled={!props.canControl} />
        <Field label="工作目录" value={props.createCwd} onChange={props.onCreateCwdChange} placeholder="/Users/..." disabled={!props.canControl} />
        <Field label="Shell" value={props.createShell} onChange={props.onCreateShellChange} placeholder="/bin/zsh" disabled={!props.canControl} />
        <button className={`${BUTTON_PRIMARY} w-full`} type="submit" disabled={!props.canControl}>
          创建新会话
        </button>
      </form>
    </Panel>
  );
}
