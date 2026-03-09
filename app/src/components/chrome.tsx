import type { ReactNode } from "react";

export function Panel(props: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-slate-800/80 bg-slate-900/72 p-5 shadow-2xl shadow-slate-950/30 backdrop-blur">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">{props.title}</h2>
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
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-slate-400">{props.label}</span>
      <input
        className="w-full rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm outline-none placeholder:text-slate-500"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
      />
    </label>
  );
}

export function StatusBadge(props: { active: boolean; label: string }) {
  return (
    <span
      className={`rounded-full border px-3 py-2 text-xs font-medium ${
        props.active
          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-200"
          : "border-rose-500/40 bg-rose-500/10 text-rose-200"
      }`}
    >
      {props.label}
    </span>
  );
}
