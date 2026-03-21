# Verification Guide

## Default Loops

- `pnpm verify:fast`
  - Runs typechecking plus internal architecture and repo-doc checks.
  - Use this for most code changes before opening or updating a PR.
- `pnpm verify:full`
  - Runs the fast loop, build, public docs build, and the repository-safe runtime checks.
  - This is the intended CI-equivalent loop.
- `pnpm verify:browser`
  - Runs the built UI smoke path with Playwright.
  - Use this when app, session workflow, or pairing UX changes.
- `pnpm verify:e2ee`
  - Runs the built E2EE-oriented validation bundle.
  - Use this when pairing, secure routing, or browser-agent trust flow changes.

## Targeted Commands

- `pnpm build`
  - Rebuilds the CLI bundle and app bundle after TypeScript checks.
- `pnpm test:relay-storage`
  - Verifies relay storage behavior and packaging assumptions.
- `pnpm test:app-versioning`
  - Verifies version metadata and build metadata exposure.
- `pnpm test:isolation`
  - Verifies device-scoped visibility and message isolation.
- `pnpm check:architecture`
  - Fails on disallowed cross-runtime source imports.
- `pnpm check:repo-docs`
  - Fails when the internal agent doc structure drifts.
- `pnpm check:public-docs`
  - Fails when implementation hotspots changed without their mapped public docs changing too.
- `pnpm test:ui-smoke:built`
  - Runs the repository-native Playwright smoke against a locally spawned relay.
- `pnpm test:e2ee:built`
  - Runs the built device-isolation and UI encryption flow checks together.

## Browser Checks

- `pnpm test:ui-smoke`
  - Builds first, then runs the Playwright smoke script.
- `pnpm test:ui-smoke:built`
  - Assumes the repository is already built.

## Update This File When

- A new routine verification command is added.
- CI semantics change.
- A previously local-only check becomes repository-native.
