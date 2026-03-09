# remote-terminal-control

Remote terminal control system for monitoring and driving PC coding sessions from a phone through a relay server.

## Overview

This project is intended to provide:

- a PC agent that manages local PTY sessions
- a relay server that brokers authenticated connections
- a mobile client for viewing output and sending input

## Initial Scope

- phone and PC connect outward only
- terminal-first remote workflow, not full desktop control
- multi-session support with streaming output and reconnection
