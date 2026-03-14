# <img src="docs/public/favicon.svg" alt="TermPilot logo" width="28" valign="middle" /> TermPilot

English | [简体中文](./README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/%40fengye404%2Ftermpilot)](https://www.npmjs.com/package/@fengye404/termpilot)
[![npm downloads](https://img.shields.io/npm/dm/%40fengye404%2Ftermpilot)](https://www.npmjs.com/package/@fengye404/termpilot)
[![GitHub Actions](https://img.shields.io/github/actions/workflow/status/fengye404/TermPilot/docs.yml?branch=main&label=docs)](https://github.com/fengye404/TermPilot/actions)

Keep one managed terminal session available across desktop and mobile.

TermPilot is a terminal session continuity tool for long-running work. It lets you leave your desk, open your phone browser, and keep watching or controlling the same session that is already running on your computer.

> [!TIP]
> Documentation site: [TermPilot Docs](https://fengye404.top/TermPilot/) · [Quick Start](https://fengye404.top/TermPilot/getting-started) · [CLI Reference](https://fengye404.top/TermPilot/cli-reference) · [Operations Guide](https://fengye404.top/TermPilot/operations-guide) · [Security Design](https://fengye404.top/TermPilot/security-design) · [Architecture](https://fengye404.top/TermPilot/architecture) · [Protocol](https://fengye404.top/TermPilot/protocol)

> [!IMPORTANT]
> TermPilot does not import arbitrary Terminal or iTerm tabs. A session must be created or managed by TermPilot to be available on mobile.

## Why It Exists

Most remote tools solve "how do I get back into a machine?".

TermPilot solves a narrower problem:

- a session is already running on your computer
- it might be Claude Code, OpenCode, a deployment, a migration, or a batch job
- you leave your desk
- you still want that exact session, not a fresh shell with a different context

That is the main path in this project.

## Architecture

```text
Phone browser / PWA  -- https / wss -->  relay  <-- ws / wss --  agent on your computer
                                              |
                                              +-- pairing, grant routing,
                                                  audit metadata, web UI
```

The system has three runtime pieces:

- `relay`: HTTP + WebSocket entrypoint, web UI hosting, pairing, access control, encrypted message routing
- `agent`: daemon running on your computer, managing local sessions and keeping session content on-device
- `app`: mobile web UI served by the relay

## Current Scope

- One npm package with a unified CLI
- One relay serving both the web UI and `/ws`
- One agent managing local tmux-backed sessions
- One mobile web UI focused on viewing, light input, and shortcut controls
- One pairing and grant model for cross-device access

This is a deliberately narrow scope. TermPilot is built for session continuity, not for desktop remoting or generic server administration.

## How It Works Today

These details are based on the current codebase:

- Session backend: `tmux`
- Relay transport: HTTP + WebSocket on the same service
- Mobile client: React app with PWA support, served by the relay
- Output sync: snapshot replacement from `tmux capture-pane`, with replay served by the agent
- Paired access: end-to-end encrypted between browser and agent using per-device pairing keys
- Relay persistence: pairing/grant metadata and audit events only; no session titles, cwd, or terminal output
- Persistence: in-memory by default, optional PostgreSQL via `DATABASE_URL` for relay metadata only

The current implementation is already coherent as a product: relay, pairing, managed sessions, mobile viewing, and light terminal control are all part of the same working path.

## Security Model

- Paired clients exchange public keys during pairing and receive an access token scoped to one device.
- The agent prints a device fingerprint during pairing; compare it with the fingerprint shown in the browser before accepting the binding.
- Session messages travel as encrypted envelopes between the browser and the agent.
- Sensitive session data stays on the computer running the agent: titles, cwd, shell, status details, and terminal output.
- The relay keeps only the minimum server-side metadata required to operate:
  - pairing codes
  - scoped access grants
  - audit events
- Trust boundary: this protects session content from relay-side storage and routine inspection, but a relay-hosted web UI is still part of the trusted delivery path. For a stronger threat model, the web client must be delivered from a separately trusted origin.
- If you redeploy or migrate from an older binding without local keys, re-pair the device.

## Quick Start

### Requirements

On both the server and your computer:

- `Node.js 22+`
- `@fengye404/termpilot`

On your computer:

- `tmux`

Install:

```bash
npm install -g @fengye404/termpilot
```

### 1. Start the relay

Run on a server or another machine reachable from your phone:

```bash
termpilot relay
```

Useful variants:

```bash
termpilot relay start
termpilot relay stop
termpilot relay run
```

By default, the relay starts in the background, listens on `0.0.0.0:8787`, and serves both the web UI and `/ws`.

### 2. Start the agent

Run on your computer:

```bash
termpilot agent
```

On first run, the agent asks for the relay host and port, then:

- saves local config
- starts a background daemon
- prints a one-time pairing code

### 3. Pair your phone

Open the relay URL in your phone browser:

- `http://your-domain.com:8787`
- or `https://your-domain.com` behind a reverse proxy

Enter the pairing code shown on your computer. After that, you land on the session list for that device.

### 4. Start a managed session

For Claude Code:

```bash
termpilot claude code
```

For any other managed command:

```bash
termpilot run -- opencode
```

If you want to create a plain shell session first:

```bash
termpilot create --name my-task --cwd /path/to/project
```

Then attach it explicitly:

```bash
termpilot list
termpilot attach --sid <sid>
```

If you only remember one rule:

- `termpilot run -- <command>` means “start a managed session around this command”
- `termpilot create` + `termpilot attach` means “create a plain shell session, then re-enter it when needed”

## CLI Reference

```bash
termpilot relay
termpilot relay stop
termpilot relay run

termpilot agent
termpilot agent --pair
termpilot agent status
termpilot agent stop

termpilot pair
termpilot create --name my-task --cwd /path/to/project
termpilot list
termpilot attach --sid <sid>
termpilot kill --sid <sid>
termpilot grants
termpilot audit --limit 20
termpilot revoke --token <accessToken>
termpilot doctor

termpilot claude code
termpilot run -- <command>
```

## Configuration

Default local state directory:

```text
~/.termpilot
```

Common files:

- `config.json`: saved relay configuration for the agent
- `agent-runtime.json`: background agent runtime state
- `relay-runtime.json`: background relay runtime state
- `state.json`: local managed session state
- `device-key.json`: local agent E2EE keypair
- `agent.log` / `relay.log`: logs

Useful environment variables:

- `TERMPILOT_HOME`
- `TERMPILOT_RELAY_URL`
- `TERMPILOT_DEVICE_ID`
- `TERMPILOT_AGENT_TOKEN`
- `HOST`
- `PORT`
- `DATABASE_URL`
- `TERMPILOT_PAIRING_TTL_MINUTES`

Examples:

```bash
TERMPILOT_HOME=/data/termpilot termpilot agent
TERMPILOT_RELAY_URL=wss://your-domain.com/ws termpilot agent
HOST=0.0.0.0 PORT=8787 termpilot relay
```

## Deployment Notes

For a quick private trial:

- run `termpilot relay` directly on a reachable machine
- open `http://your-ip:8787` on mobile
- point the agent to `ws://your-ip:8787/ws`

For regular use:

- run `termpilot relay` on a server
- put a reverse proxy in front of it
- use `https://your-domain.com` on mobile
- use `wss://your-domain.com/ws` for the agent

Minimal Caddy example:

```caddyfile
your-domain.com {
    reverse_proxy 127.0.0.1:8787
}
```

## Non-Goals

TermPilot is intentionally not trying to be:

- a remote desktop
- a GUI control layer
- an importer for arbitrary existing terminal tabs
- a full terminal log archive system
- a general-purpose multi-tenant operations platform

If a task should remain visible and controllable from mobile, start it inside a TermPilot-managed session from the beginning.

## Repository Layout

This repository is a pnpm workspace monorepo:

- [`src/cli.ts`](./src/cli.ts): top-level CLI entrypoint
- [`agent/`](./agent): desktop agent and local session management
- [`relay/`](./relay): relay server
- [`app/`](./app): mobile web UI
- [`packages/protocol/`](./packages/protocol): shared protocol definitions
- [`docs/`](./docs): VitePress documentation site

## Development

Run locally:

```bash
pnpm install
pnpm dev:relay
pnpm dev:app
pnpm dev:agent
```

Useful checks:

```bash
pnpm typecheck
pnpm build
pnpm test:ui-smoke
pnpm check:stability
pnpm test:isolation
```

## Documentation

- [Docs site](https://fengye404.top/TermPilot/)
- [Why TermPilot](./docs/why-termpilot.md)
- [Getting started](./docs/getting-started.md)
- [CLI reference](./docs/cli-reference.md)
- [Operations guide](./docs/operations-guide.md)
- [Architecture](./docs/architecture.md)
- [Protocol](./docs/protocol.md)
- [Improvement plan](./docs/roadmap.md)
- [Development](./docs/development.md)
- [Tech selection (2026)](./docs/tech-selection-2026.md)
