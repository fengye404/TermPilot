# <img src="docs/public/favicon.svg" alt="TermPilot logo" width="28" valign="middle" /> TermPilot

English | [简体中文](./README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/%40fengye404%2Ftermpilot)](https://www.npmjs.com/package/@fengye404/termpilot)
[![npm downloads](https://img.shields.io/npm/dm/%40fengye404%2Ftermpilot)](https://www.npmjs.com/package/@fengye404/termpilot)
[![GitHub Actions](https://img.shields.io/github/actions/workflow/status/fengye404/TermPilot/docs.yml?branch=main&label=docs)](https://github.com/fengye404/TermPilot/actions)

Keep one managed terminal session available across desktop and mobile.

TermPilot is a local-first terminal session continuity tool for long-running work. It keeps the same managed session reachable from your phone without moving session content into the relay.

> [!TIP]
> Documentation site: [TermPilot Docs](https://fengye404.top/TermPilot/) · [Quick Start](https://fengye404.top/TermPilot/getting-started) · [Deployment Guide](https://fengye404.top/TermPilot/deployment-guide) · [Agent Operations](https://fengye404.top/TermPilot/agent-operations) · [Troubleshooting](https://fengye404.top/TermPilot/troubleshooting) · [CLI Reference](https://fengye404.top/TermPilot/cli-reference)

> [!IMPORTANT]
> TermPilot does not import arbitrary Terminal or iTerm tabs. A session must be created or managed by TermPilot to be available on mobile.

## What It Is

TermPilot is built around one narrow path:

- one managed session already exists on your computer
- you leave your desk
- you still want that exact session on your phone

That session can be Claude Code, a deployment, a migration, or any other long-running terminal task. The product is designed around continuity, not remote desktop access.

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

## Current Model

- Unified CLI package for relay, agent, and session commands
- `tmux`-backed managed sessions with output replay served by the agent
- Local-first session state: titles, cwd, status details, and terminal output stay on the agent host
- Device-scoped pairing, access grants, and encrypted browser-to-agent session messages
- Relay persistence limited to pairing, grant, and audit metadata, with SQLite as the default long-running store and optional PostgreSQL via `DATABASE_URL`
- Mobile web UI focused on viewing, light input, and shortcut controls on the same session
- Browser notifications for device offline, session exit, and suspected stale managed sessions while the page is in the background
- Adaptive output polling: active sessions stay snappy, while long-detached managed sessions are polled more conservatively
- Managed command sessions include lightweight stale-session governance for long-detached, no-output leftovers

This is a deliberately narrow scope. TermPilot is built for session continuity, not for desktop remoting or generic server administration.

If you redeploy or migrate from an older binding without local keys, re-pair the device.

## Quick Start

If you want the structured docs flow instead of reading the repository README top to bottom, use this path:

- Product overview: [Why TermPilot](https://fengye404.top/TermPilot/why-termpilot)
- First setup: [Quick Start](https://fengye404.top/TermPilot/getting-started)
- Relay deployment: [Deployment Guide](https://fengye404.top/TermPilot/deployment-guide)
- Agent lifecycle and session operations: [Agent Operations](https://fengye404.top/TermPilot/agent-operations)
- Problem diagnosis: [Troubleshooting](https://fengye404.top/TermPilot/troubleshooting)
- Runtime design: [Security Design](https://fengye404.top/TermPilot/security-design), [Architecture](https://fengye404.top/TermPilot/architecture), [Protocol](https://fengye404.top/TermPilot/protocol)

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

By default, the relay starts in the background, listens on `0.0.0.0:8787`, serves both the web UI and `/ws`, and persists relay metadata to `~/.termpilot/relay.db`.

### 2. Start the agent

Run on your computer:

```bash
termpilot agent
```

On first run, the agent asks for the relay host and port, then:

- saves local config
- starts a background daemon
- prints a one-time pairing code

If you want the agent to stay up permanently, let a system process manager run:

```bash
termpilot agent --foreground --relay wss://your-domain.com/ws
```

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
- `device-key.json`: local agent device keypair
- `agent.log` / `relay.log`: logs

Useful environment variables:

- `TERMPILOT_HOME`
- `TERMPILOT_RELAY_URL`
- `TERMPILOT_DEVICE_ID`
- `TERMPILOT_AGENT_TOKEN`
- `TERMPILOT_RELAY_STORE`
- `TERMPILOT_SQLITE_PATH`
- `TERMPILOT_ORPHAN_WARNING_MS`
- `TERMPILOT_MANAGED_SESSION_AUTOCLEANUP_MS`
- `HOST`
- `PORT`
- `DATABASE_URL`
- `TERMPILOT_PAIRING_TTL_MINUTES`

Managed command cleanup defaults:

- `TERMPILOT_ORPHAN_WARNING_MS`: detached and idle warning threshold, default `3600000` (1 hour)
- `TERMPILOT_MANAGED_SESSION_AUTOCLEANUP_MS`: detached and idle auto-clean threshold, default `43200000` (12 hours)

Relay store defaults:

- `TERMPILOT_RELAY_STORE`: `sqlite` by default, can be set to `memory`
- `TERMPILOT_SQLITE_PATH`: SQLite file path, default `~/.termpilot/relay.db`

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
- keep relay metadata on SQLite or PostgreSQL instead of volatile memory

Minimal Caddy example:

```caddyfile
your-domain.com {
    reverse_proxy 127.0.0.1:8787
}
```

For deployment and runtime details, continue with:

- [Deployment Guide](./docs/deployment-guide.md)
- [Agent Operations](./docs/agent-operations.md)
- [Troubleshooting](./docs/troubleshooting.md)
- [Security Design](./docs/security-design.md)

### Relay Docker Image

Use the published relay image directly:

```bash
docker pull fengye404/termpilot-relay:latest
```

Run it with a persistent state volume:

```bash
docker run -d \
  --name termpilot-relay \
  -p 8787:8787 \
  -e TERMPILOT_AGENT_TOKEN=change-me \
  -v termpilot-relay-data:/var/lib/termpilot \
  fengye404/termpilot-relay:latest
```

Inside the container, relay metadata persists to `/var/lib/termpilot/relay.db` by default. If you want reproducible rollout, pin a version tag such as `fengye404/termpilot-relay:0.3.9`.

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
