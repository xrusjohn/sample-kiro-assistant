# Kiro Assistant Web Server

Run the Kiro Assistant UI in a browser, connected to `kiro-cli` on a remote machine.

This is an alternative to the Electron desktop app — designed for setups where you run
`kiro-cli` on a remote VM (e.g., Amazon Linux / DevSpaces / CDM) and access the UI from
your local machine's browser (e.g., Windows via VS Code port forwarding).

## Architecture

```
Browser  ──HTTP/WS──▶  Express Server (Remote VM, port 3001)  ──Runner──▶  kiro-cli / ECS / AgentCore
```

- **Express + WebSocket server** replaces the Electron main process
- **ACP (Agent Client Protocol)** provides real-time streaming via JSON-RPC over stdio
- **Browser bridge** (`src/ui/api.ts`) populates `window.electron` via fetch/WebSocket
- **React UI** is completely unchanged — same components, store, and styles
- **Three runner backends** — local ACP (default), ECS Fargate, or AWS Bedrock AgentCore

## Quick Start

```bash
# Install dependencies (if not already done)
npm install

# Build React UI + server
npm run build:web

# Start the server (port 3001)
npm run server
# → Kiro Assistant running at http://0.0.0.0:3001
```

Then open `http://your-remote-vm:3001` in your browser, or use VS Code port forwarding.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run build:web` | Build React UI + compile server TypeScript |
| `npm run server` | Start the already-built server |
| `npm run dev:web` | Build and start in one command (foreground) |
| `npm run dev:web:watch` | Watch mode — Vite + tsc + node --watch |
| `npm run server:start` | Build + start in tmux session `kiro-server` |
| `npm run server:stop` | Graceful stop |
| `npm run server:restart` | Stop + start |
| `npm run server:status` | Check if running + last 5 log lines |
| `npm run server:logs` | Last 100 lines from tmux pane |

Set `PORT` environment variable to change the port (default: 3001).

## How It Works

### Server (`src/server/`)

| File | Purpose |
|------|---------|
| `index.ts` | Express server — static files, REST API, WebSocket, file upload |
| `session-handler.ts` | Session lifecycle — create, resume, restart, history |
| `runner-manager.ts` | Manages up to 5 concurrent runners, auto-suspends idle sessions |
| `runner.ts` | ACP runner — spawns `kiro-cli acp` and handles JSON-RPC streaming |
| `ecs-runner.ts` | ECS runner — launches Fargate tasks, connects via ACP-over-TCP |
| `agentcore-runner.ts` | AgentCore runner — invokes Bedrock AgentCore Runtime via SDK |
| `agent-registry.ts` | Registers available agents (kiro, claude-code) |
| `app-settings.ts` | Model settings persistence |
| `paths.ts` | Data directory, S3 sync for sessions DB |
| `send-to/` | File routing system (email, Quip, S3, clipboard, session, memory) |

### Browser Bridge (`src/ui/api.ts`)

Populates `window.electron` with the same interface the React UI expects, backed by:
- **WebSocket** for real-time events (session updates, streaming messages)
- **fetch()** for request/response calls (read file, model settings, MCP config, etc.)

### What's Unchanged

All React components, Zustand store, styles, and the original Electron code are untouched.
The Electron build still works if needed.

## Runner Selection

The server picks a runner based on environment variables:

```
AGENTCORE_RUNNER_ENABLED=true  →  AgentCore Runtime (request-driven, serverless)
ECS_RUNNER_ENABLED=true        →  ECS Fargate (task-per-session, ACP-over-TCP)
(neither)                      →  Local ACP (default, spawns kiro-cli locally)
```

See `docs/RUNNERS.md` for full details on each runner.

## Streaming

Uses kiro-cli's **ACP (Agent Client Protocol)** — a JSON-RPC protocol over stdin/stdout:

1. `initialize` → exchange capabilities
2. `session/new` → create a session with working directory
3. `session/prompt` → send prompt, receive streaming `agent_message_chunk` events
4. Thinking text streams in *italics*, response text in normal font
5. Final message persists in the chat — no re-render after streaming completes

## Data Storage

| What | Where |
|------|-------|
| Session metadata | `~/.kiro-assistant/sessions.db` (SQLite) |
| Model settings | `~/.kiro-assistant/assistant-settings.json` |
| Per-session workspaces | `~/Documents/workspace-kiro-assistant/task-YYYYMMDD-HHMMSS/` |
| Agent config | `~/.kiro/agents/agent_config.json` |
| S3 sync (optional) | Set `SESSIONS_S3_URI=s3://bucket/key` — DB pulled on startup, pushed on idle |

## Key Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `KIRO_BINARY` | `kiro-cli` | Path to kiro-cli binary |
| `CLAUDE_BINARY` | `claude-agent-acp` | Path to Claude Code CLI |
| `DEFAULT_AGENT` | `kiro` | Default agent (`kiro` or `claude-code`) |
| `KIRO_MAX_SESSIONS` | `5` | Max concurrent sessions |
| `KIRO_IDLE_TIMEOUT_MINUTES` | `30` | Auto-suspend idle sessions |
| `KIRO_WIDGETS` | `1` | Enable widget rendering (`0` to disable) |
| `SESSIONS_S3_URI` | — | S3 URI for sessions DB sync |
| `ECS_RUNNER_ENABLED` | — | Set `true` to use ECS runner |
| `AGENTCORE_RUNNER_ENABLED` | — | Set `true` to use AgentCore runner |

## Differences from Electron App

| Feature | Electron | Web Server |
|---------|----------|------------|
| File picker | Native OS dialog | Browser file input |
| Open file externally | `shell.openPath` | Download via HTTP |
| kiro-cli communication | SQLite polling | ACP (JSON-RPC streaming) |
| Streaming | Batch (after completion) | Real-time token streaming |
| Platform | macOS/Windows/Linux desktop | Any browser + remote server |
| Runner backends | Local only | Local, ECS, AgentCore |
