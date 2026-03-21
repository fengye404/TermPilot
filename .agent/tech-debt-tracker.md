# Tech Debt Tracker

## Active Debt

- Runtime architecture checks currently validate import boundaries, not higher-level behavioral invariants.
- Public-doc freshness currently relies on static hotspot mappings rather than semantic diffing.
- Legacy Python verification entrypoints remain as compatibility wrappers and should eventually be removed.

## Debt Intake Rule

Add an entry here when a task leaves behind a known follow-up that could affect future agent runs.
