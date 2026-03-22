# terminal-capture-layout

## Goal

- Fix terminal layout corruption caused by tmux pane capture semantics and add a fast local verification path for browser-driven terminal resize.

## Non-Goals

- Redesign the terminal UI.
- Change the relay deployment workflow.

## Affected Areas

- `agent`
- `cli`

## Acceptance Criteria

- [x] Browser replay keeps fullscreen/TUI layouts intact instead of joining rows incorrectly.
- [x] A repository-native local command exists to validate browser-driven terminal resize without publishing to npm first.

## Implementation Notes

- `capture-pane -J` joins wrapped rows and breaks fullscreen TUI layouts such as Claude Code safety prompts.
- Keep the new local verification script focused on validating tmux resize after browser attach.

## Verification

- [x] `pnpm typecheck`
- [x] `pnpm build`
- [x] `pnpm test:terminal-resize:built`
- [x] `pnpm test:ui-smoke:built`

## Decision Log

- 2026-03-23: Remove `capture-pane -J` because it preserves shell soft-wrap less aggressively but keeps fullscreen TUI screen geometry correct, which matches user-visible terminal expectations better.

## Follow-Ups

- Consider a separate fixture that validates fullscreen/TUI layout replay with deterministic ANSI screen content.
