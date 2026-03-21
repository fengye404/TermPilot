# TermPilot Architecture Map

This is the top-level map for agents and maintainers. It is intentionally shorter than the public architecture page in `docs/`.

## Runtime Slices

- `src/cli.ts`
  - Composes the public `termpilot` command from the internal runtimes.
  - This is the only place where importing both `agent` and `relay` directly is expected.
- `agent/`
  - Owns local session state, tmux lifecycle, local device identity, and output replay buffers.
- `relay/`
  - Owns HTTP and WebSocket entrypoints, pairing, grants, audit metadata, and static web serving.
- `app/`
  - Owns the mobile browser experience.
- `packages/protocol/`
  - Owns shared protocol types, message shapes, and crypto helpers.
- `docs/`
  - User-facing documentation site.
- `.agent/`
  - Internal engineering knowledge base for coding agents.

## Dependency Expectations

- `app` may depend on `@termpilot/protocol`, but not on `agent` or `relay` source files.
- `agent` may depend on `@termpilot/protocol`, but not on `relay` or `app` source files.
- `relay` may depend on `@termpilot/protocol`, but not on `agent` or `app` source files.
- `packages/protocol` must stay independent from runtime layers.
- Cross-runtime composition belongs in `src/cli.ts`, not inside the runtime packages.

These expectations are mechanically checked by `pnpm check:architecture`.

## Data Ownership

- `agent`
  - Session metadata
  - tmux session lifecycle
  - output buffers and replay
  - local device keys and state
- `relay`
  - pairing codes
  - grants
  - audit metadata
  - served web assets
- `app`
  - browser-local UI state
  - browser-local pairing key material

## Read Next

- Internal map: [`.agent/index.md`](./.agent/index.md)
- Runtime boundaries: [`.agent/runtime-boundaries.md`](./.agent/runtime-boundaries.md)
- Invariants: [`.agent/known-invariants.md`](./.agent/known-invariants.md)
- Verification: [`.agent/verification.md`](./.agent/verification.md)
- Execution plans: [PLANS.md](./PLANS.md)
