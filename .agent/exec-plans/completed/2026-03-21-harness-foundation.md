# Harness Foundation

## Goal

- Introduce an internal agent-oriented documentation system that is separate from the public docs site.
- Add lightweight mechanical checks for repository boundaries and internal doc structure.
- Add a PR-oriented CI loop that can run on a fresh machine.

## Non-Goals

- Rewriting the user-facing VitePress documentation site.
- Replacing all existing runtime tests.
- Building a full documentation freshness linter for public docs.

## Affected Areas

- `cli`
- `agent`
- `relay`
- `app`
- `protocol`

## Acceptance Criteria

- [x] Root agent entrypoints exist and point to internal knowledge.
- [x] Internal engineering knowledge lives outside the public docs site.
- [x] Architecture and internal-doc checks are runnable from `package.json`.
- [x] CI has a repository-native verification workflow.

## Implementation Notes

- Introduced `AGENTS.md`, `ARCHITECTURE.md`, and `PLANS.md` as short root-level maps.
- Added `.agent/` as the internal knowledge base with beliefs, boundaries, invariants, verification guidance, and plan templates.
- Added repository-portable path resolution to runtime verification scripts that previously depended on absolute local paths.

## Verification

- [x] `pnpm verify:fast`
- [x] `pnpm verify:full`

## Decision Log

- 2026-03-21: Kept internal docs outside `docs/` to avoid mixing agent-facing engineering context with the public docs site.
- 2026-03-21: Started with import-boundary checks instead of a heavier dependency graph tool to keep the harness simple and easy to evolve.

## Follow-Ups

- Add a freshness check between selected public docs and implementation hotspots.
