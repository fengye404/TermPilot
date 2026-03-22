# Xterm Follow-Ups

## Goal

- Complete the remaining high-impact `xterm.js` follow-ups so the terminal behaves more like a real terminal end-to-end, not just in the browser shell.

## Non-Goals

- Replace tmux as the session backend.
- Build full desktop remoting or mouse reporting.
- Redesign the public app shell outside terminal-adjacent UX.

## Affected Areas

- `packages/protocol`
- `agent`
- `app`

## Acceptance Criteria

- [x] `session.resize` applies real terminal dimensions to tmux-backed sessions.
- [x] Session output supports incremental append frames with replay-safe replace fallback.
- [x] The app reconciles append/replace output safely and requests replay when incremental continuity is broken.
- [x] `xterm` test mirrors are no longer always present in production browsing contexts.
- [x] The app can prefetch terminal chunks before the user starts typing into a session.
- [x] Browser smoke covers the mobile-style `beforeinput` path and passes.

## Verification

- [x] `pnpm typecheck`
- [x] `pnpm build`
- [x] `pnpm test:ui-smoke:built`

## Decision Log

- 2026-03-23: Prefer incremental append frames plus replay-time replace fallback instead of introducing a wholly new streaming transport in the same pass.
- 2026-03-23: Keep the `beforeinput`-driven mobile keyboard path as the canonical browser regression target, because it best matches iPhone Safari soft-keyboard behavior.
