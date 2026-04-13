# ACP Protocol Reference — Lessons Learned

Field notes from integrating with `kiro-cli acp` (JSON-RPC over stdio).

## Handshake Sequence

```
Client → kiro-cli:  initialize
kiro-cli → Client:  initialize response (agentInfo, protocolVersion)
Client → kiro-cli:  session/new
kiro-cli → Client:  (many _kiro.dev/* notifications — MCP servers, commands, metadata)
kiro-cli → Client:  session/new response (sessionId, modes)
Client → kiro-cli:  session/prompt
kiro-cli → Client:  session/update notifications (agent_message_chunk, tool_call, turn_end)
```

## Critical: initialize params

Must match what kiro-cli expects. Use numeric `protocolVersion`, include `clientCapabilities`:

```json
{
  "jsonrpc": "2.0", "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": 1,
    "clientCapabilities": {
      "fs": { "readTextFile": true, "writeTextFile": true },
      "terminal": true
    },
    "clientInfo": { "name": "ws-agent", "version": "1.0.0" }
  }
}
```

**Gotcha:** Using `"protocolVersion": "0.3.0"` (string) works for initialize but may cause subtle issues downstream.

## Critical: prompt format is an ARRAY, not a string

This is the #1 thing that will silently break you.

```json
// ✅ CORRECT — array of content blocks
{
  "method": "session/prompt",
  "params": {
    "sessionId": "...",
    "prompt": [{ "type": "text", "text": "What is 2+2?" }]
  }
}

// ❌ WRONG — kiro-cli exits with code 0, no error, no output
{
  "method": "session/prompt",
  "params": {
    "sessionId": "...",
    "prompt": "What is 2+2?"
  }
}
```

When kiro-cli receives a plain string prompt, it silently exits with code 0. No error message, no stderr, nothing. This cost us days of debugging.

## Critical: session/new must include mcpServers

```json
{
  "method": "session/new",
  "params": {
    "cwd": "/path/to/workdir",
    "mcpServers": []
  }
}
```

Without `mcpServers: []`, kiro-cli may exit immediately after session/new.

## Critical: wait for initialize response before session/new

Send `initialize` → wait for response with `agentInfo` → then send `session/new`. Sending both immediately causes kiro-cli to exit.

## session/update event types

| `sessionUpdate` / `kind` | Meaning |
|---|---|
| `agent_message_chunk` | Streaming text: `update.content.text` |
| `tool_call` | Tool invocation: `update.title` or `update.toolName` |
| `tool_call_update` | Progress on tool (can ignore) |
| `turn_end` | Model finished responding |

## Notifications to expect (and ignore)

After `session/new`, kiro-cli sends many notifications before the session/new response:

- `_kiro.dev/mcp/server_initialized` — each MCP server coming online
- `_kiro.dev/commands/available` — slash commands (repeated per MCP)
- `_kiro.dev/metadata` — context usage percentage
- `_kiro.dev/subagent/list_update` — sub-agent list
- `_kiro.dev/agent/not_found` — if `--agent` name doesn't match (falls back to `kiro_default`)

These are informational. The session/new response (with `sessionId`) comes after all MCPs initialize.

## Response to session/prompt

The model's response comes as streaming `session/update` notifications. The turn ends with either:
- A `session/update` with `kind: "turn_end"`
- A response to the `session/prompt` RPC with `result.stopReason`

Either one means the turn is done.

## Process lifecycle

- kiro-cli ACP stays alive between prompts — it's a persistent session
- Send multiple `session/prompt` calls on the same `sessionId`
- The process only exits on `session/cancel`, SIGINT, or error
- On clean exit (code 0 unexpectedly), restart and create a new session

## Environment variables

```bash
NO_COLOR=1          # Suppress color codes
CLICOLOR=0          # Suppress color codes (belt and suspenders)
TERM=dumb           # Prevent TUI detection
KIRO_CLI_DISABLE_PAGER=1  # Prevent pager
```

## Debugging tips

- Add `console.log` for every message received — kiro-cli sends a LOT of notifications
- If kiro-cli exits with code 0 silently, check the prompt format first
- The `--agent kiro-assistant` flag may trigger `agent/not_found` if the agent config isn't installed — kiro-cli falls back to `kiro_default` and continues working
- stderr is mostly silent in ACP mode — don't rely on it for error detection
