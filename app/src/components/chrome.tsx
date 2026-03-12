import type { ReactNode } from "react";

export const BUTTON_PRIMARY = "tp-button tp-button-primary";
export const BUTTON_SECONDARY = "tp-button tp-button-secondary";
export const BUTTON_DANGER = "tp-button tp-button-danger";
export const BUTTON_SUBTLE = "tp-button tp-button-subtle";

export function Panel(props: { title: string; children: ReactNode }) {
  return (
    <section className="tp-card px-4 py-4 sm:px-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="tp-panel-title">{props.title}</h2>
      </div>
      {props.children}
    </section>
  );
}

export function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="tp-label">{props.label}</span>
      <input
        className="tp-input disabled:opacity-50"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        disabled={props.disabled}
      />
    </label>
  );
}

export function StatusBadge(props: { active: boolean; label: string }) {
  return (
    <span className={`tp-chip ${props.active ? "tp-chip-active" : "tp-chip-danger"}`}>
      {props.label}
    </span>
  );
}

export function NoticeBanner(props: {
  kind: "info" | "success" | "error";
  text: string;
  onDismiss: () => void;
}) {
  const tone = props.kind === "error"
    ? "border-[rgba(204,104,86,0.34)] bg-[rgba(204,104,86,0.12)] text-[#ffd8d2]"
    : props.kind === "success"
      ? "border-[rgba(31,122,83,0.34)] bg-[rgba(31,122,83,0.12)] text-[#d8f3e6]"
      : "border-[rgba(31,122,83,0.28)] bg-[rgba(31,122,83,0.08)] text-[#e4f4eb]";

  return (
    <div className={`tp-card flex items-start justify-between gap-3 px-4 py-3 text-sm ${tone}`}>
      <p>{props.text}</p>
      <button
        className="tp-button tp-button-subtle min-h-0 px-3 py-1 text-xs"
        type="button"
        onClick={props.onDismiss}
      >
        关闭
      </button>
    </div>
  );
}
