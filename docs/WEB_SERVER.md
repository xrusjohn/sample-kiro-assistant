# Kiro Assistant Web Server

Run the Kiro Assistant UI in a browser, connected to `kiro-cli` on a remote machine.

This is an alternative to the Electron desktop app — designed for setups where you run
`kiro-cli` on a remote VM (e.g., Amazon Linux / DevSpaces) and access the UI from your
local machine's browser (e.g., Windows via VS Code port forwarding).

## Architecture

```
Browser (Windows)  ──HTTP/WS──▶  Express Server (Remote VM)  ──ACP/stdio──▶  kiro-cli
```

- **Express + WebSocket server** replaces the Electron main process
- **ACP (Agent Client Protocol)** provides real-time streaming via JSON-RPC over stdio
- **Browser bridge** (`src/ui/api.ts`) populates `window.electron` via fetch/WebSocket
- **React UI** is completely unchanged — same components, store, and styles

## Quick Start

```bash
# Install dependencies (if not already done)
npm install

# Build React UI + server
npm run build:web

# Start the server
npm run server
# → Kiro Assistant Web UI running at http://0.0.0.0:3000
```

Then open `http://your-remote-vm:3000` in your browser, or use VS Code port forwarding
for port 3000.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run build:web` | Build React UI + compile server |
| `npm run server` | Start the web server (port 3000) |
| `npm run dev:web` | Build and start in one command |

Set `PORT` environment variable to change the port (default: 3000).

## How It Works

### Server (`src/server/`)

| File | Purpose |
|------|---------|
| `index.ts` | Express server — static files, REST API, WebSocket, file upload |
| `runner.ts` | Spawns `kiro-cli acp` and handles JSON-RPC streaming |
| `session-handler.ts` | WebSocket event handler — session lifecycle |
| `paths.ts` | Data directory (`~/.kiro-assistant/`) |
| `app-settings.ts` | Model settings persistence |
| `util.ts` | Enhanced PATH, session titles |

### Browser Bridge (`src/ui/api.ts`)

Populates `window.electron` with the same interface the React UI expects, backed by:
- **WebSocket** for real-time events (session updates, streaming messages)
- **fetch()** for request/response calls (read file, model settings, MCP config, etc.)

### What's Unchanged

All React components, Zustand store, styles, and the original Electron code are untouched.
The Electron build still works if needed.

## Streaming

Uses kiro-cli's **ACP (Agent Client Protocol)** — a JSON-RPC protocol over stdin/stdout:

1. `initialize` → exchange capabilities
2. `session/new` → create a session with working directory
3. `session/prompt` → send prompt, receive streaming `agent_message_chunk` events
4. Thinking text streams in *italics*, response text in normal font
5. Final message persists in the chat — no re-render after streaming completes

## Data Storage

- Session metadata: `~/.kiro-assistant/sessions.db` (SQLite)
- Model settings: `~/.kiro-assistant/assistant-settings.json`
- Per-session workspaces: `~/Documents/workspace-kiro-assistant/`
- Agent config: `~/.kiro/agents/agent_config.json`

## Differences from Electron App

| Feature | Electron | Web Server |
|---------|----------|------------|
| File picker | Native OS dialog | Browser file input |
| Open file externally | `shell.openPath` | Download via HTTP |
| kiro-cli communication | SQLite polling | ACP (JSON-RPC streaming) |
| Streaming | Batch (after completion) | Real-time token streaming |
| Platform | macOS/Windows/Linux desktop | Any browser + remote server |
