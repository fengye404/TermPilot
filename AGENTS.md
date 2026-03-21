# TermPilot Agent Map

This file is the short entrypoint for coding agents working in this repository.

## Start Here

1. Read [ARCHITECTURE.md](./ARCHITECTURE.md) for the top-level code and runtime map.
2. Read [PLANS.md](./PLANS.md) before starting any multi-file or cross-runtime change.
3. Use [`.agent/index.md`](./.agent/index.md) as the internal knowledge index.

## What Counts As Internal Docs

- `docs/` is the user-facing documentation site.
- `AGENTS.md`, `ARCHITECTURE.md`, `PLANS.md`, and `.agent/` are the internal agent-oriented knowledge base.
- When these disagree, fix the drift instead of guessing.

## Repo Shape

- `src/cli.ts`: top-level CLI composition layer.
- `agent/`: local device daemon, tmux lifecycle, local state.
- `relay/`: HTTP and WebSocket relay, pairing, grants, audit metadata.
- `app/`: mobile web UI.
- `packages/protocol/`: shared protocol and crypto helpers.
- `docs/`: public docs site for users and operators.
- `.agent/`: internal engineering knowledge, invariants, verification, plans.

## Golden Rules

- Session source of truth lives on the `agent`, not on the `relay`.
- `relay` stores only pairing, grant, and audit metadata.
- `app` is for viewing, light input, and light control, not desktop remoting.
- Shared wire shapes must flow through `@termpilot/protocol`.
- `shell` and `command` sessions have different exit semantics; do not blur them accidentally.
- Default long-running relay storage is SQLite unless a task explicitly changes that assumption.

## Working Style

1. Identify which runtime slice the task touches: `agent`, `relay`, `app`, `protocol`, or CLI composition.
2. If the change crosses runtime boundaries or has non-obvious behavior, create or update an execution plan from [`.agent/exec-plans/TEMPLATE.md`](./.agent/exec-plans/TEMPLATE.md).
3. Keep cross-runtime coupling explicit and minimal.
4. Run the smallest verification that still covers the change.
5. Update internal docs when architecture, invariants, or verification guidance changes.

## Verification Entry Points

```bash
pnpm verify:fast
pnpm verify:full
pnpm verify:browser
pnpm verify:e2ee
pnpm test:ui-smoke
```

Notes:

- `pnpm verify:fast` is the default pre-PR loop.
- `pnpm verify:full` is the full repository verification loop that fits CI.
- `pnpm verify:browser` and `pnpm test:ui-smoke` use the repository-native Playwright smoke path.
- `pnpm verify:e2ee` runs the browser smoke and device-isolation checks together after build.
- Browser-based smoke is intentionally separate from `verify:full` so we can keep the default loop faster.

## When Internal Docs Must Change

- A runtime boundary changes.
- A new invariant is introduced.
- Verification expectations change.
- A cross-runtime task needed an execution plan or left behind follow-up debt.

## Primary References

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [PLANS.md](./PLANS.md)
- [`.agent/index.md`](./.agent/index.md)
- [`.agent/runtime-boundaries.md`](./.agent/runtime-boundaries.md)
- [`.agent/known-invariants.md`](./.agent/known-invariants.md)
- [`.agent/verification.md`](./.agent/verification.md)
