# Kiro Assistant — Self-Knowledge Base

> This document helps the agent (you) understand the application you're running inside of.
> It is loaded as context so you don't start from scratch each session.

## What You Are

You are an AI agent running inside **Kiro Assistant**, a custom web UI built around `kiro-cli`.
You communicate via **ACP (Agent Client Protocol)** — a JSON-RPC protocol over stdio.
The server spawns a `kiro-cli acp` process per session. You are that process.

## Architecture

```
Browser (React) ←→ WebSocket ←→ Express Server (Node.js) ←→ ACP (stdio) ←→ kiro-cli
```

- **Express server**: `src/server/index.ts` — REST API + WebSocket on port 3001 (default)
- **React UI**: Vite-built SPA served as static files
- **Session store**: SQLite at `~/.kiro-assistant/sessions.db`
- **Agent config**: `~/.kiro/agents/agent_config.json` (MCP servers, tools, prompt)
- **Process manager**: tmux via `scripts/server.sh` (start|stop|restart|status|check|logs)

## Key Constraint: Don't Kill Yourself

The server process hosts you. If you run `server.sh restart` or kill the node process,
you die mid-execution. Always tell the user to restart from another terminal.

## UI Components (What the User Sees)

| Component | Location | What It Does |
|-----------|----------|-------------|
| **Sidebar** | Left panel (280px) | Session list, new task button, ACP debug toggle, settings, server status, auth |
| **PromptInput** | Bottom center | Text input for sending messages |
| **FileBar** | Above prompt input | Chips showing files created/accessed during the session |
| **FileSidebar** | Right panel (resizable) | Inline preview of text, markdown, images, Excel, PowerPoint, PDF |
| **EventCard** | Main content area | Renders each message (user prompts, assistant responses, tool calls) |
| **SettingsModal** | Modal overlay | MCP servers, skills, model selection, widgets toggle |
| **ServerStatus** | Bottom of sidebar | Green/red dot, uptime, memory, active agent count, restart button |
| **AcpDebugPanel** | Bottom drawer | Raw ACP JSON-RPC messages (send/recv) for debugging |
| **DecisionPanel** | Inline in chat | Permission request UI for tool approvals |
| **StartSessionModal** | Modal | New session creation with working directory picker |

## Session Lifecycle

1. User clicks "+ New Task" or sends a prompt
2. Server creates a session in SQLite, assigns a workspace under `~/Documents/workspace-kiro-assistant/task-YYYYMMDD-HHMMSS/`
3. Server spawns a `kiro-cli acp` process (RunnerManager enforces max 5 concurrent)
4. Messages stream over ACP → WebSocket → React
5. Idle sessions auto-suspend after 30 min (configurable via `KIRO_IDLE_TIMEOUT_MINUTES`)
6. Stuck detection: if no activity for 3 min while "running", UI shows "Stuck — Restart Agent"

## File Tracking

The store (`useAppStore.ts`) extracts file paths from tool outputs:
- `extractFilesFromMessage()` parses tool results for file paths
- Files are categorized as "created" (write/shell output) or "accessed" (read)
- FileBar shows chips; clicking opens FileSidebar with inline preview
- Supported previews: text/code (syntax highlighted), markdown (rendered), images, Excel (tabbed sheets), PowerPoint (slide-by-slide), PDF

## Agents

Two agents are registered in `AgentRegistry`:
- **kiro** (default): `kiro-cli acp --agent kiro-assistant --trust-all-tools`
- **claude-code**: `claude-agent-acp` (Claude Code CLI)

Configured via env vars: `KIRO_BINARY`, `CLAUDE_BINARY`, `DEFAULT_AGENT`

## MCP Servers (Tools)

Configured in `~/.kiro/agents/agent_config.json` under `mcpServers`.
The user's current setup includes (among others):
- `amazon-outlook-mcp` — Outlook email (read, send, search, calendar)
- `amazon-sharepoint-mcp` — SharePoint/OneDrive via Midway auth
- `playwright` — Browser automation
- `composio` — 500+ SaaS integrations
- `excel` — Excel file manipulation

Settings UI can enable/disable servers (toggles `disabled` flag).

## REST API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/healthz` | GET | Health check (uptime, pid) |
| `/api/server/status` | GET | Uptime, memory, active sessions |
| `/api/server/restart` | POST | Graceful restart (notifies WS clients, tmux respawns) |
| `/api/sessions/health` | GET | RunnerManager health (all sessions, states) |
| `/api/sessions/:id/restart` | POST | Kill+respawn one session's ACP process |
| `/api/mcp-servers` | GET | List configured MCP servers |
| `/api/mcp-disabled` | POST | Toggle MCP server enabled/disabled |
| `/api/agents` | GET | List available agents |
| `/api/skills` | GET | List loaded skills |
| `/api/model-settings` | GET | Current model config |
| `/api/read-file` | POST | Read file content (text, image, excel, pdf) |
| `/api/files/download` | GET | Force-download a file |
| `/api/files/preview` | GET | Preview file (renders .md as HTML) |
| `/downloads` | GET | List files in ~/Downloads |
| `/downloads/:filename` | GET | Download a specific file |
| `/api/upload` | POST | Upload files to session workspace |
| `/api/widgets-enabled` | GET/POST | Toggle widget rendering |

## Widgets

The UI can render interactive widgets inline in chat via fenced code blocks:
```
```widget:clock
```widget:countdown
```widget:progress
```widget:meetings
```widget:html
```

The `html` widget renders arbitrary HTML inline — useful for rich output.

## Auth

- **Midway/Cognito**: OAuth flow via `/auth/callback`, token stored in localStorage + `~/.kiro-auth-token`
- **MCP auth**: Each MCP server has its own auth (Midway certs, API keys, OAuth tokens)

## Models

Default: `claude-sonnet-4.5`. Changeable in Settings. Available models include opus-4.6, sonnet-4.5, sonnet-4, haiku-4.5, and 1M context variants.

## Project Paths

- Project root: `~/projects/sample-kiro-assistant`
- Server source: `src/server/`
- UI source: `src/ui/`
- Electron source: `src/electron/` (desktop app variant)
- Scripts: `scripts/server.sh`, `scripts/run-dev.sh`
- Build output: `dist-server/`, `dist-react/`
- Data: `~/.kiro-assistant/sessions.db`
- Config: `~/.kiro/agents/agent_config.json`
- Skills: `~/.kiro/skills/*/SKILL.md`
- Workspaces: `~/Documents/workspace-kiro-assistant/`

## Future Vision (from conversations with the user)

- **Introspection API**: Runtime endpoint for session awareness, loaded tools, screen state
- **Send-to**: Route messages/context between sessions
- **Shared memory**: Cross-session persistent state
- **DevTools integration**: Awareness of what the UI "looks like"
- **The app needs a new name** (not "sample-kiro-assistant")
