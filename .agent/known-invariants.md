# Known Invariants

- Relay persistence is metadata-only: pairing codes, grants, and audit events.
- Session title, cwd, shell, status details, and output buffers stay on the agent host.
- `@termpilot/protocol` is the shared contract between runtime slices.
- Mobile UI is optimized for viewing and light control, not desktop-grade terminal editing.
- SQLite is the default long-running relay store.
- Browser-device pairing relies on local key material and device-scoped grants.
- Public docs in `docs/` describe the product and operations; internal docs here describe how to evolve the repo safely.
