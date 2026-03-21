# Runtime Boundaries

## Ownership

- `agent/`
  - Local session state
  - tmux integration
  - local replay buffers
  - device identity and device-side persistence
- `relay/`
  - public entrypoint
  - pairing and grant management
  - audit metadata
  - static web asset delivery
- `app/`
  - browser workflow
  - session browsing, viewing, and light input
- `packages/protocol/`
  - shared message shapes
  - shared record types
  - shared crypto helpers

## Import Rules

- `app/src/**` may import local app files and `@termpilot/protocol`.
- `agent/src/**` may import local agent files and `@termpilot/protocol`.
- `relay/src/**` may import local relay files and `@termpilot/protocol`.
- `packages/protocol/src/**` must not import runtime-layer source files.
- `src/cli.ts` is the composition seam between `agent` and `relay`.

## Behavioral Rules

- `relay` must not become the session source of truth.
- `app` must not quietly absorb backend business logic.
- Any new shared wire shape belongs in `packages/protocol`.
- Any change to session semantics must consider both `shell` and `command` launch modes.

## Enforcement

- Mechanical import checks live in `scripts/check-architecture.mjs`.
- Human-readable entrypoints live in `AGENTS.md`, `ARCHITECTURE.md`, and this file.
