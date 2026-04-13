# AG-UI Migration Plan

Mapping our custom WS events to the AG-UI standard, and the plan to get there.

## Why

Our current frontend protocol is custom — invented event types that only our UI understands. AG-UI is the emerging standard for agent ↔ frontend communication (CopilotKit, LangGraph, CrewAI all adopting). Switching means:
- Any AG-UI-compatible frontend can plug into Relay
- Any AG-UI-compatible agent can be rendered by our UI
- We stop maintaining a custom protocol

## Event Mapping

### Server → Client (streaming)

| Our event | AG-UI event | Notes |
|---|---|---|
| `session.status { status: "running" }` | `RUN_STARTED { threadId, runId }` | Session = thread, turn = run |
| `session.status { status: "idle" }` | `RUN_FINISHED { threadId, runId }` | |
| `session.status { status: "error" }` | `RUN_ERROR { threadId, runId, message }` | |
| `stream.message { event: content_block_start }` | `TEXT_MESSAGE_START { messageId }` | |
| `stream.message { event: content_block_delta }` | `TEXT_MESSAGE_CONTENT { messageId, delta }` | The hot path — streaming text |
| `stream.message { event: content_block_stop }` | `TEXT_MESSAGE_END { messageId }` | |
| `stream.message { type: "assistant" }` | `MESSAGES_SNAPSHOT { messages }` | Full message for persistence |
| `stream.user_prompt` | `MESSAGES_SNAPSHOT` | Include user message in snapshot |
| `stream.message { tool_call }` | `TOOL_CALL_START { toolCallId, name }` | |
| `stream.message { tool_call args }` | `TOOL_CALL_ARGS { toolCallId, delta }` | |
| `stream.message { tool_call end }` | `TOOL_CALL_END { toolCallId }` | |
| `session.metadata` | `CUSTOM { name: "metadata", value: {...} }` | Credits, context %, duration |
| `debug.acp` | `CUSTOM { name: "debug", value: {...} }` | Keep as custom, debug only |
| `runner.error` | `RUN_ERROR` | |
| `agents.list` | `CUSTOM { name: "agents.list", value: {...} }` | Relay-specific, no AG-UI equivalent |
| `permission.request` | `CUSTOM { name: "permission.request", value: {...} }` | Human-in-the-loop, may map to AG-UI interrupt proposal |

### Client → Server (input)

| Our event | AG-UI equivalent | Notes |
|---|---|---|
| `session.start { prompt }` | `RunAgentInput { threadId, tools, context }` | POST to start a run |
| `session.continue { prompt }` | `RunAgentInput` on existing thread | Same endpoint, same threadId |
| `session.stop` | Cancel/abort the run | AG-UI doesn't standardize this yet (draft proposal: interrupt lifecycle) |
| `session.list` | Out of scope for AG-UI | Session management is Relay-specific |
| `session.history` | Out of scope | Relay-specific |
| `session.delete` | Out of scope | Relay-specific |
| `permission.response` | Out of scope | Maps to AG-UI interrupt proposal (draft) |

### What doesn't map

AG-UI is focused on the streaming run. Session management (list, delete, history) and agent registry (agents.list) are Relay-specific concerns that live outside AG-UI. That's fine — AG-UI handles the run, Relay handles the rest via REST API.

## Concept Mapping

| Relay concept | AG-UI concept |
|---|---|
| Session | Thread |
| Turn / prompt-response | Run |
| Session ID | threadId |
| (new) | runId (unique per turn within a thread) |
| StreamMessage | BaseEvent |

## Architecture

```
Browser
  │
  ├── AG-UI events (SSE or WS) ──── streaming runs
  │
  └── REST API ──── session CRUD, agent registry, config
        │
     Orchestrator
        │
        ├── ACP (local)
        ├── A2A (cloud)
        ├── WS (firewall)
        └── Matrix (federated)
```

The orchestrator exposes two interfaces:
1. **AG-UI endpoint** — `POST /ag-ui/run` accepts `RunAgentInput`, returns SSE stream of `BaseEvent`
2. **REST API** — `/api/sessions/*`, `/api/a2a/*`, `/api/agents/*` for management

The browser uses the AG-UI client SDK for streaming and our REST API for everything else.

## Migration Plan

### Step 1: Add AG-UI translation layer (additive)
- Add `src/server/ag-ui-adapter.ts` — translates our internal events to AG-UI events
- Add `POST /ag-ui/run` endpoint that wraps session.start + streaming
- Keep existing WS protocol working — both run in parallel
- Frontend can opt-in to AG-UI via a flag

### Step 2: Migrate frontend to AG-UI client
- Replace custom WS event handling in `useAppStore.ts` with AG-UI client SDK
- Session management stays on REST API
- Remove custom `stream.message` parsing

### Step 3: Remove custom WS streaming
- Once frontend is fully on AG-UI, remove the old `stream.message` event path
- WS connection stays for session management events (or move those to REST polling)
- relay-cli migrates to AG-UI too

### Step 4: Publish AG-UI agent card
- Relay itself becomes an AG-UI-compatible agent endpoint
- Any AG-UI frontend (CopilotKit, custom apps) can connect to Relay
