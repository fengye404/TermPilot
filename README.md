# <img src="docs/public/favicon.svg" alt="TermPilot logo" width="28" valign="middle" /> TermPilot

English | [简体中文](./README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/%40fengye404%2Ftermpilot)](https://www.npmjs.com/package/@fengye404/termpilot)
[![npm downloads](https://img.shields.io/npm/dm/%40fengye404%2Ftermpilot)](https://www.npmjs.com/package/@fengye404/termpilot)
[![GitHub Actions](https://img.shields.io/github/actions/workflow/status/fengye404/TermPilot/docs.yml?branch=main&label=docs)](https://github.com/fengye404/TermPilot/actions)

Keep the same terminal session alive across desktop and mobile.

TermPilot is a terminal session continuity tool for long-running work. It lets you leave your desk, open your phone browser, and keep watching or controlling the same session that is already running on your computer.

> [!TIP]
> Documentation site: [TermPilot Docs](https://fengye404.top/TermPilot/) · [Quick Start](https://fengye404.top/TermPilot/getting-started) · [Operations Guide](https://fengye404.top/TermPilot/operations-guide) · [Architecture](https://fengye404.top/TermPilot/architecture) · [Protocol](https://fengye404.top/TermPilot/protocol) · [Roadmap](https://fengye404.top/TermPilot/roadmap)

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
                                              +-- pairing, auth, session metadata,
                                                  output replay, audit events, web UI
```

The system has three runtime pieces:

- `relay`: HTTP + WebSocket entrypoint, web UI hosting, pairing, access control, session metadata
- `agent`: daemon running on your computer, managing local sessions and syncing them to the relay
- `app`: mobile web UI served by the relay

## What It Does Well

- Keeps desktop and mobile attached to the same managed session
- Works well for long-running terminal tasks instead of one-off remote access
- Ships as a single npm package with a unified CLI
- Requires no mobile app install
- Supports one-time pairing codes, grant listing, revocation, and audit events
- Exposes a deployable relay plus a built-in mobile web UI

## Current Implementation

These details are based on the current codebase:

- Session backend: `tmux`
- Relay transport: HTTP + WebSocket on the same service
- Mobile client: React app with PWA support, served by the relay
- Output sync: snapshot replacement from `tmux capture-pane`, with replay from recent buffered frames
- Persistence: in-memory by default, optional PostgreSQL via `DATABASE_URL`

This keeps the product honest: it is focused on continuity for managed terminal sessions, not on full terminal streaming fidelity or desktop remoting.

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

For OpenCode:

```bash
termpilot open code
```

For a generic managed session:

```bash
termpilot create --name my-task --cwd /path/to/project
```

Your current terminal attaches to that managed session. The phone sees the same session state and output.

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
termpilot open code
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
- `agent.log` / `relay.log`: logs

Useful environment variables:

- `TERMPILOT_HOME`
- `TERMPILOT_RELAY_URL`
- `TERMPILOT_DEVICE_ID`
- `TERMPILOT_AGENT_TOKEN`
- `TERMPILOT_CLIENT_TOKEN`
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
- [Operations guide](./docs/operations-guide.md)
- [Architecture](./docs/architecture.md)
- [Protocol](./docs/protocol.md)
- [Roadmap](./docs/roadmap.md)
- [Development](./docs/development.md)
- [Tech selection (2026)](./docs/tech-selection-2026.md)
