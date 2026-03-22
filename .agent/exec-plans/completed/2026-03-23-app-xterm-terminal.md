# App Xterm Terminal

## Goal

- Replace the mobile/web terminal snapshot viewer with an `xterm.js`-backed terminal surface so keyboard input, focus, selection, and resize feel like a real terminal instead of an app-level input bridge.

## Non-Goals

- Change the relay or agent wire contract for session output delivery.
- Rework session persistence or replay semantics on the agent.
- Ship desktop remoting or mouse-driven terminal UI beyond what `xterm.js` already gives us.

## Affected Areas

- `app`

## Acceptance Criteria

- [x] The active terminal workspace renders through `xterm.js` instead of the ANSI-to-HTML snapshot component.
- [x] Keyboard input flows through the terminal surface directly, with mobile focus mode no longer showing a visible text input strip.
- [x] Terminal resize is propagated to the agent with the existing `session.resize` contract.
- [x] Mobile focus mode remains terminal-first, keeps lightweight control affordances, and avoids clipped controls in portrait and landscape.
- [x] Repository verification covers the new terminal input path and passes.

## Implementation Notes

- Keep the existing `session.output` replace-frame semantics for this iteration by rehydrating the xterm buffer from the latest snapshot.
- Use `@xterm/addon-fit` to drive geometry and send `session.resize` when the viewport changes.
- Preserve the existing quick-command and tool controls as secondary affordances, but let `xterm.js` own direct typing/focus.

## Verification

- [x] `pnpm typecheck`
- [x] `pnpm build`
- [x] `pnpm test:ui-smoke:built`

## Decision Log

- 2026-03-23: Start with an app-only `xterm.js` migration and keep the current replace-style output protocol to reduce cross-runtime risk.
- 2026-03-23: Load `xterm` and `@xterm/addon-fit` lazily so the app shell stays lighter before a session is opened.
- 2026-03-23: Reconcile snapshots by append-when-possible and full clear-when-needed, instead of calling `terminal.reset()` for every frame.

## Follow-Ups

- Evaluate whether the agent should eventually expose incremental output frames tuned for terminal emulators instead of full-buffer replace frames.
