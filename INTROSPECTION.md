---
name: self-awareness
description: Kiro Assistant self-knowledge base — architecture, components, session lifecycle, and project context.
inclusion: always
---

# Kiro Assistant — Self-Knowledge Base

> This document helps the agent (you) understand the application you're running inside of.
> It is loaded as context so you don't start from scratch each session.

## What You Are

You are an AI agent running inside **Kiro Assistant**, a general-purpose conversational UI built around `kiro-cli`.
You communicate via **ACP (Agent Client Protocol)** — a JSON-RPC protocol over stdio.
The server spawns a `kiro-cli acp` process per session. You are that process.

The project has grown beyond a simple coding assistant. It is now a **builder-first personal assistant** with 500+ tools, dynamic skills, and multiple deployment modes — designed for Solutions Architects and builders who need to context-switch between code, comms, and artifacts seamlessly.

## Architecture

```
Browser (React) ←→ WebSocket ←→ Express Server (Node.js) ←→ Runner ←→ kiro-cli / AgentCore / ECS
```

- **Express server**: `src/server/index.ts` — REST API + WebSocket, default port 3001 (env: `PORT`)
- **React UI**: Vite-built SPA served as static files from `dist-react/`
- **Session store**: SQLite at `~/.kiro-assistant/sessions.db` (optionally synced to S3 via `SESSIONS_S3_URI`)
- **Agent config**: `~/.kiro/agents/agent_config.json` (MCP servers, tools, prompt)
- **Process manager**: tmux via `scripts/server.sh` (start|stop|restart|status|check|logs)

## Key Constraint: Don't Kill Yourself

The server process hosts you. If you run `server.sh restart` or kill the node process,
you die mid-execution. Always tell the user to restart from another terminal.

## Runner Types (Pluggable)

The `RunnerManager` selects a runner based on environment variables:

| Runner | Env Flag | How It Works |
|--------|----------|-------------|
| **ACP** (default) | — | Spawns `kiro-cli acp` locally, communicates via stdio JSON-RPC |
| **ECS** | `ECS_RUNNER_ENABLED=true` | Launches ECS Fargate task, connects via ACP-over-TCP |
| **AgentCore** | `AGENTCORE_RUNNER_ENABLED=true` | Invokes AWS Bedrock AgentCore via `InvokeAgentRuntimeCommand`, streams SSE |

If both ECS and AgentCore are set, AgentCore wins (with a warning).

AgentCore runner config: `AGENTCORE_AGENT_RUNTIME_ARN`, `AGENTCORE_REGION` (default: `us-east-1`).

## Session Lifecycle

1. User clicks "+ New Task" or sends a prompt
2. Server creates a session in SQLite, assigns a workspace under `~/Documents/workspace-kiro-assistant/task-YYYYMMDD-HHMMSS/`
3. `RunnerManager` spawns the appropriate runner (max 5 concurrent, configurable via `KIRO_MAX_SESSIONS`)
4. Messages stream over ACP → WebSocket → React
5. Idle sessions auto-suspend after 30 min (configurable via `KIRO_IDLE_TIMEOUT_MINUTES`)
6. Stuck detection: if no activity for 3 min while "running", UI shows "Stuck — Restart Agent"
7. Hot-restart: kill ACP process and respawn with full history — picks up new MCP config, skills, model

## Agents

Registered in `AgentRegistry` (`src/server/agent-registry.ts`):
- **kiro** (default): `kiro-cli acp --agent kiro-assistant --trust-all-tools`
- **claude-code**: `claude-agent-acp` (Claude Code CLI via `@agentclientprotocol/claude-agent-acp`)

Configured via env vars: `KIRO_BINARY`, `CLAUDE_BINARY`, `DEFAULT_AGENT`

## UI Components (What the User Sees)

| Component | What It Does |
|-----------|-------------|
| **Sidebar** | Session list, new task button, ACP debug toggle, settings, server status, auth |
| **PromptInput** | Text input with file upload (paperclip icon) |
| **FileBar** | Chips showing files created/accessed during the session |
| **FileSidebar** | Inline preview: text/code (syntax highlighted), markdown, images, Excel (tabbed sheets), PowerPoint (slide-by-slide), PDF |
| **EventCard** | Renders each message — user prompts, assistant responses, tool calls |
| **SettingsModal** | MCP servers, skills, model selection, widgets toggle |
| **ServerStatus** | Green/red dot, uptime, memory, active agent count, restart button |
| **AcpDebugPanel** | Raw ACP JSON-RPC messages (send/recv) for debugging |
| **DecisionPanel** | Permission request UI for tool approvals |
| **StartSessionModal** | New session creation with working directory picker |
| **SendToMenu** | Route a file to an external destination (email, Quip, S3, clipboard, session, memory) |
| **SendToConfigPanel** | Configure destination parameters |
| **SendToStatusIndicator** | Shows send-to operation status inline |

## Send-To System

Files can be routed to external destinations via the Send-To system (`src/server/send-to/`):

| Provider | Destination |
|----------|------------|
| `EmailProvider` | Send file via email |
| `QuipProvider` | Attach to a Quip document |
| `S3Provider` | Upload to S3 |
| `ClipboardProvider` | Copy to clipboard |
| `SessionProvider` | Route to another active session |
| `MemoryProvider` | Store in shared cross-session memory |

API: `GET /api/files/send-to/destinations`, `POST /api/files/send-to`

## File Tracking

The store (`useAppStore.ts`) extracts file paths from tool outputs:
- `extractFilesFromMessage()` parses tool results for file paths
- Files are categorized as "created" (write/shell output) or "accessed" (read)
- FileBar shows chips; clicking opens FileSidebar with inline preview

## MCP Servers (Tools)

Configured in `~/.kiro/agents/agent_config.json` under `mcpServers`.
The user's current setup includes (among others):
- `amazon-outlook-mcp` — Outlook email (read, send, search, calendar)
- `amazon-sharepoint-mcp` — SharePoint/OneDrive via Midway auth
- `playwright` — Browser automation
- `composio` — 500+ SaaS integrations (ElevenLabs, HeyGen, Gmail, etc.)
- `excel` — Excel file manipulation
- `diagram-renderer` — Graphviz/Pillow diagram rendering
- `gateway-mcp-proxy` — AgentCore gateway proxy

Settings UI can enable/disable servers (toggles `disabled` flag in config).

## REST API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/healthz` | GET | Health check (uptime, pid) |
| `/api/server/status` | GET | Uptime, memory, active sessions, port |
| `/api/server/restart` | POST | Graceful restart (notifies WS clients, tmux respawns) |
| `/api/sessions/health` | GET | RunnerManager health — all sessions, states, ECS/AgentCore info |
| `/api/sessions/:id/restart` | POST | Hot-restart one session's runner (respawns with history) |
| `/api/sessions/restart-all` | POST | Restart all active sessions |
| `/api/mcp-servers` | GET | List configured MCP servers |
| `/api/mcp-disabled` | POST | Toggle MCP server enabled/disabled |
| `/api/agents` | GET | List available agents with availability status |
| `/api/skills` | GET | List loaded skills |
| `/api/model-settings` | GET | Available models + current selection |
| `/api/set-default-model` | POST | Change default model |
| `/api/read-file` | POST | Read file content (text, image, excel, pdf) |
| `/api/files` | GET | Serve file directly |
| `/api/files/download` | GET | Force-download a file |
| `/api/files/preview` | GET | Preview file (renders .md as HTML) |
| `/api/files/send-to/destinations` | GET | List send-to destinations |
| `/api/files/send-to` | POST | Send file to a destination |
| `/downloads` | GET | List files in ~/Downloads |
| `/downloads/:filename` | GET | Download a specific file |
| `/api/upload` | POST | Upload files to session workspace (collision-safe renaming) |
| `/api/widgets-enabled` | GET/POST | Toggle widget rendering |
| `/api/auth/token` | GET/POST | Read/store auth token |
| `/auth/callback` | GET | OAuth callback for Cognito/Midway |
| `/api/generate-session-title` | POST | AI-generated title from user input |
| `/api/rename-session` | POST | Rename a session |
| `/api/recent-cwds` | GET | Recently used working directories |
| `/api/run-kiro-command` | POST | Execute arbitrary kiro-cli command |

## Widgets

The UI renders interactive widgets inline in chat via fenced code blocks:

```
```widget:clock
```widget:countdown
```widget:progress
```widget:meetings
```widget:html
```

The `html` widget renders arbitrary HTML inline — useful for rich output, dashboards, etc.
Toggle via `KIRO_WIDGETS=0` env var or Settings UI.

## Auth

- **Midway/Cognito**: OAuth flow via `/auth/callback`, token stored in localStorage + `~/.kiro-auth-token`
- **MCP auth**: Each MCP server has its own auth (Midway certs, API keys, OAuth tokens)

## Models

Persisted to `~/.kiro-assistant/assistant-settings.json`. Default: `claude-sonnet-4.5`.
Changes take effect on the next new task (not mid-session).

Available today: `claude-opus-4.6`, `claude-opus-4.6-1m`, `claude-opus-4.5`, `claude-sonnet-4.5`, `claude-sonnet-4.5-1m`, `claude-sonnet-4`, `claude-haiku-4.5`

Coming soon (Bedrock): `deepseek-3.2`, `kimi-k2.5`, `minimax-m2.1`, `glm-4.7`, `qwen3-coder-next`

## Data Persistence

| What | Where |
|------|-------|
| Sessions DB | `~/.kiro-assistant/sessions.db` (SQLite) |
| Model settings | `~/.kiro-assistant/assistant-settings.json` |
| Agent config | `~/.kiro/agents/agent_config.json` |
| Skills | `~/.kiro/skills/*/SKILL.md` |
| Auth token | `~/.kiro-auth-token` |
| Workspaces | `~/Documents/workspace-kiro-assistant/task-YYYYMMDD-HHMMSS/` |
| S3 sync (optional) | `SESSIONS_S3_URI=s3://bucket/key` — DB pulled on startup, pushed on session idle |

## Project Paths

- Project root: `~/projects/sample-kiro-assistant`
- Server source: `src/server/`
- UI source: `src/ui/`
- Shared types/models: `src/shared/`
- Electron source: `src/electron/` (desktop app variant)
- Scripts: `scripts/server.sh`, `scripts/run-dev.sh`
- Build output: `dist-server/`, `dist-react/`
- CDK infra: `infra/cdk/` (ECS stacks, AgentCore stack, network stack, orchestrator)

## Infrastructure (CDK)

`infra/cdk/lib/` contains stacks for cloud deployment:
- `network-stack.ts` — VPC, subnets, security groups
- `ecs-subagent-stack.ts` — ECS Fargate task for kiro-cli subagents
- `agentcore-stack.ts` — Bedrock AgentCore agent runtime
- `agentcore-subagent-stack.ts` — AgentCore subagent variant
- `orchestrator-stack.ts` — Orchestrator layer

## Design Seeds (Active Roadmap)

| Seed | Status | What It Is |
|------|--------|-----------|
| **ACP Gateway** | Designed | REST/SSE endpoint so any HTTP client (Nova Sonic, Strands, curl) can talk to kiro-cli |
| **Artifact Bus** | Designed | S3-based file handle pattern — URIs instead of base64, thumbnail generation, tool composability |
| **ECS Session Manager** | Designed | Two-tier: ECS-local (public tools) + CDM-bridged (internal tools), smart routing |
| **Hot Reload** | Implemented | Restart ACP process without losing session context |
| **Multi-Agent Matrix** | Designed | Orchestrate multiple agents in parallel |
| **Send-To** | Implemented | Route files/context to email, Quip, S3, clipboard, other sessions, memory |
| **Shared Memory** | Implemented (MemoryProvider) | Cross-session persistent state via MemoryProvider |

## Vision

Kiro Assistant is for everyone — not just developers. The goal is a single conversational interface that can:
- Read an email, write code, create a diagram, email the diagram — all in one session
- Work across domains: Sales, Marketing, HR, Legal, FSI, Telco, etc.
- Be customized with **Kiro Powers** (skills + tools bundles) shareable via [kirohub.dev](https://kirohub.dev/)
- Run on CDM, AgentSpaces, ECS, or as a desktop Electron app
