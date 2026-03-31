# Kiro Assistant — Project Context

## What This Is
A web-based AI assistant UI (React + Express + WebSocket) that wraps Kiro CLI and Claude Code CLI. It runs as a persistent server managed via tmux.

## Architecture
- Frontend: React (Vite build) → `dist-react/`
- Backend: Express + WebSocket server → `dist-server/`
- Entry point: `src/server/index.ts` (Express on port 3001)
- UI entry: `src/ui/App.tsx`
- Shared types/models: `src/shared/`
- Electron shell (optional desktop mode): `src/electron/`

## Server Management
The server runs inside a tmux session called `kiro-server`. Use the management script:

```
npm run server:start    # build + start in tmux on port 3001
npm run server:stop     # graceful stop
npm run server:restart  # stop + start
npm run server:status   # check if running + last 5 log lines
npm run server:logs     # last 100 lines from tmux pane
```

Or directly: `./scripts/server.sh {start|stop|restart|status|logs}`

To check if the server is up:
```
curl -sf http://localhost:3001/api/server/status
```

## Port
The server runs on port **3001** (not 3000). Set via `PORT=3001` in `scripts/server.sh`.

## Build Commands
- `npm run build:web` — builds both React frontend and server TypeScript
- `npm run server` — runs the already-built server (`node dist-server/server/index.js`)
- `npm run dev:web` — build + run in one shot (foreground, not tmux)

## Key Directories
- `scripts/` — server management, dev helpers, MCP tools
- `resources/` — agent config templates
- `src/server/` — Express server, session handling, runner management
- `src/ui/` — React frontend components, store, hooks
- `src/shared/` — shared types, models, MCP config
- `.kiro/settings/mcp.json` — workspace MCP server configuration

## Testing
```
npm test          # vitest run (single pass)
```

## When Asked About Server Status
Always check with `npm run server:status` or `curl http://localhost:3001/api/server/status` first. Don't scan processes manually.
