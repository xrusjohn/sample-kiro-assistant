# Claude Code Agent Support — Design

## Current Architecture

The agent binary is currently hard-coded in `runner.ts` via the `KIRO_AGENT` env var, which only controls the `--agent` flag passed to `kiro-cli`. There is no concept of switching to a different binary entirely, and the `Session` DB schema has no `agent` column.

```
StartSessionModal
  → session.start event (no agent field)
  → session-handler.ts
  → runner.ts: spawn("kiro-cli", ["acp", "--agent", "kiro-assistant", "--trust-all-tools"])
```

## Target Architecture

```
StartSessionModal (agent selector)
  → session.start event { ..., agentId: "kiro" | "claude-code" }
  → session-handler.ts → stores agentId in DB
  → runner-manager.ts → passes agentId to createAcpRunner()
  → runner.ts: AgentConfig lookup → spawn correct binary with correct args
```

Agent availability is checked at startup and exposed via `GET /api/agents`.

```
┌─────────────────────┐     WebSocket      ┌──────────────────────┐
│  Browser UI          │◄──────────────────►│  Express Server       │
│  (agent selector,    │                    │  index.ts              │
│   agent badge)       │                    └──────────┬────────────┘
└─────────────────────┘                               │
                                            ┌──────────▼────────────┐
                                            │  session-handler.ts    │
                                            │  (stores agentId)      │
                                            └──────────┬────────────┘
                                                       │
                                            ┌──────────▼────────────┐
                                            │  runner-manager.ts     │
                                            │  (agentId per entry)   │
                                            └──────┬────────┬────────┘
                                                   │        │
                                         ┌─────────▼──┐  ┌──▼──────────┐
                                         │  kiro-cli  │  │   claude    │
                                         │  acp       │  │   acp       │
                                         │  (stdio)   │  │  (stdio)    │
                                         └────────────┘  └─────────────┘
```

## Component Changes

### 1. Agent Registry (new: `src/server/agent-registry.ts`)

Central definition of all supported agents. Responsible for configuration, binary resolution, and availability checks.

```typescript
interface AgentDefinition {
  id: string;              // "kiro" | "claude-code"
  label: string;           // "Kiro" | "Claude Code"
  binaryEnvVar: string;    // env var to override binary path
  defaultBinary: string;   // "kiro-cli" | "claude"
  defaultArgs: string[];   // ["acp", "--agent", "kiro-assistant", "--trust-all-tools"] | ["acp"]
  available?: boolean;     // resolved at startup
  resolvedBinary?: string; // absolute path after resolution
}

const AGENT_DEFINITIONS: AgentDefinition[] = [
  {
    id: "kiro",
    label: "Kiro",
    binaryEnvVar: "KIRO_BINARY",
    defaultBinary: "kiro-cli",
    defaultArgs: ["acp", "--agent", "kiro-assistant", "--trust-all-tools"],
  },
  {
    id: "claude-code",
    label: "Claude Code",
    binaryEnvVar: "CLAUDE_BINARY",
    defaultBinary: "claude",
    defaultArgs: ["acp"],
  },
];

class AgentRegistry {
  // Check binary availability using `which` or `where` (cross-platform)
  async checkAvailability(): Promise<void>;

  // Get all agents with availability status
  getAll(): AgentDefinition[];

  // Get a single agent by ID — throws if not found
  get(id: string): AgentDefinition;

  // Get the default agent ID (from settings or first available)
  getDefault(): string;
}
```

Availability check uses Node's `child_process.execFile` with a short timeout to run `which <binary>` (Unix) or `where <binary>` (Windows). The result is cached for the lifetime of the server process.

### 2. Runner Changes (`src/server/runner.ts`)

`createAcpRunner()` currently hard-codes the `kiro-cli` binary. Change its signature to accept an `AgentDefinition`:

```typescript
// Before
function createAcpRunner(opts: { sessionId, cwd, kiroConversationId?, conversationHistory? }): RunnerHandle

// After
function createAcpRunner(opts: { sessionId, cwd, agent: AgentDefinition, kiroConversationId?, conversationHistory? }): RunnerHandle
```

Inside `createAcpRunner`, replace:
```typescript
// Before
const binary = process.env.KIRO_CLI_BINARY ?? "kiro-cli";
const agent = (process.env.KIRO_AGENT ?? "kiro-assistant").trim();
const child = spawn(binary, ["acp", "--agent", agent, "--trust-all-tools"], { ... });

// After
const child = spawn(opts.agent.resolvedBinary!, opts.agent.defaultArgs, { ... });
```

No changes needed to the ACP message-handling logic — both agents speak JSON-RPC 2.0 ACP over stdin/stdout.

### 3. Runner Manager Changes (`src/server/runner-manager.ts`)

Add `agentId` to `RunnerEntry` so the manager knows which agent each process uses:

```typescript
interface RunnerEntry {
  handle: RunnerHandle;
  sessionId: string;
  agentId: string;           // NEW
  state: "starting" | "active" | "idle" | "suspended";
  lastActivity: number;
  spawnedAt: number;
}
```

Update `spawn()` and `getOrSpawn()` signatures to accept `agentId`:

```typescript
spawn(sessionId: string, opts: SpawnOpts & { agentId: string }): RunnerHandle | null
getOrSpawn(sessionId: string, opts: GetOrSpawnOpts & { agentId: string }): RunnerHandle | null
```

Inside both methods, look up the `AgentDefinition` from `AgentRegistry` and pass it to `createAcpRunner()`.

### 4. Session Database Schema (`src/server/sessions.ts` or equivalent)

Add `agent_id` column to the sessions table:

```sql
ALTER TABLE sessions ADD COLUMN agent_id TEXT NOT NULL DEFAULT 'kiro';
```

For the `Session` TypeScript type:

```typescript
interface Session {
  id: string;
  title: string;
  status: SessionStatus;
  agentId: string;           // NEW — defaults to "kiro"
  kiroConversationId?: string;
  cwd?: string;
  createdAt: number;
  updatedAt: number;
}
```

### 5. Session Handler Changes (`src/server/session-handler.ts`)

- `session.start` event payload gains an optional `agentId` field (defaults to `AgentRegistry.getDefault()`)
- Store `agentId` in the DB row when creating the session
- `session.continue` and lazy-respawn paths read `session.agentId` from DB and pass it to `manager.getOrSpawn()`

### 6. Client Event Types (update `src/electron/types.ts`)

```typescript
// Before
type SessionStartPayload = { title: string; prompt: string; cwd?: string; allowedTools?: string[]; interactive?: boolean }

// After
type SessionStartPayload = { title: string; prompt: string; agentId?: string; cwd?: string; allowedTools?: string[]; interactive?: boolean }
```

New server event to push agent availability to the UI on connect:

```typescript
| { type: "agents.list"; payload: { agents: AgentInfo[] } }

interface AgentInfo {
  id: string;
  label: string;
  available: boolean;
}
```

### 7. REST Endpoint: `GET /api/agents`

Returns the agent list for polling or initial page load:

```json
{
  "agents": [
    { "id": "kiro", "label": "Kiro", "available": true },
    { "id": "claude-code", "label": "Claude Code", "available": true }
  ],
  "default": "kiro"
}
```

### 8. UI: Agent Selector in StartSessionModal (`src/ui/components/StartSessionModal.tsx`)

Add a compact segmented control above the prompt input:

```
[ Kiro ]  [ Claude Code ]
```

- Controlled by local state initialized from `appStore.defaultAgentId`
- Unavailable agents rendered as disabled with a "not installed" tooltip
- Selected `agentId` passed in the `session.start` payload

### 9. UI: Agent Badge in Sidebar (`src/ui/components/Sidebar.tsx`)

Each session item gains a small agent badge next to the title:

```
● My task               [K]
● Debug this script     [C]
```

- "K" = Kiro, "C" = Claude Code (or small logo icons if assets are available)
- Badge is derived from `session.agentId` stored in the Zustand store

### 10. UI: Agent Badge in Session Header

The session detail header (chat area top bar) shows the agent name alongside the session title, so the user always knows which backend is active.

### 11. App Store Changes (`src/ui/store/useAppStore.ts`)

```typescript
interface AppState {
  // ...existing fields...
  agents: AgentInfo[];                  // NEW — populated from agents.list event or /api/agents
  defaultAgentId: string;               // NEW — persisted in localStorage
}
```

- Handle `agents.list` server event to populate `agents`
- Expose `setDefaultAgent(id)` action that writes to `localStorage`
- On store init, read `defaultAgentId` from `localStorage` (fallback: `"kiro"`)
- Persist `agentId` per session in the `SessionView` type

## Sequence: New Session With Agent Selection

```
User opens StartSessionModal
  → Modal fetches agent list from store (populated via agents.list on connect)
  → User selects "Claude Code", types prompt, clicks Start
  → Client sends: { type: "session.start", payload: { title, prompt, agentId: "claude-code" } }
  → session-handler: creates DB row with agent_id = "claude-code"
  → runner-manager.spawn(): looks up AgentRegistry.get("claude-code")
  → createAcpRunner({ agent: claudeCodeDef, ... })
  → spawn("claude", ["acp"], { ... })
  → ACP handshake proceeds identically to Kiro
```

## Sequence: Lazy Resume Preserves Agent

```
User sends prompt to suspended session (agentId = "claude-code")
  → session.continue handler reads session from DB → agentId = "claude-code"
  → manager.getOrSpawn(sessionId, { agentId: "claude-code" })
  → spawns "claude acp" (not kiro-cli)
  → ACP session/load or session/new with history injection
  → prompt delivered
```

## Configuration

New environment variables:

```
KIRO_BINARY=kiro-cli        # override Kiro binary path
CLAUDE_BINARY=claude         # override Claude Code binary path
DEFAULT_AGENT=kiro           # server-side default agent (UI preference takes precedence)
```

The existing `KIRO_AGENT` and `KIRO_CLI_BINARY` env vars are deprecated in favor of the new `KIRO_BINARY` env var. They remain functional for backwards compatibility but are no longer the primary configuration mechanism.

## ACP Compatibility Notes

Both Kiro and Claude Code implement ACP (JSON-RPC 2.0 over stdio). The `initialize` / `session/new` / `session/load` / `session/prompt` message flow is identical. Differences to be aware of:

- The `agentInfo` returned in the `initialize` response will differ (name, version, capabilities). The runner already ignores unknown fields, so no special handling is needed.
- Claude Code's `acp` subcommand may not support all flags that Kiro does (e.g., `--trust-all-tools`). The per-agent `defaultArgs` in `AgentRegistry` encapsulates these differences cleanly.
- If Claude Code uses a different `stopReason` vocabulary, the existing `turn_end` handler may need a small guard — validate during manual testing.

## Error Handling

- Binary not found at spawn time: emit `runner.error` with a human-readable message ("Claude Code binary not found — install Claude Code CLI and try again")
- `AgentRegistry.get(unknownId)`: throw immediately in session-handler, surface as `runner.error` before any process is spawned
- Backwards compatibility: existing sessions with no `agent_id` DB column value default to `"kiro"` via the `DEFAULT 'kiro'` column constraint

## Testing Strategy

- Unit: `AgentRegistry` availability checks (mock `execFile`, test available/unavailable paths)
- Unit: `createAcpRunner` selects correct binary from `AgentDefinition`
- Unit: `session.start` with `agentId` stores it in DB and passes it through to spawn
- Integration: Start two concurrent sessions — one Kiro, one Claude Code — verify independent streaming
- Manual: Verify agent badge displays correctly in sidebar and header
- Manual: Resume a Claude Code session after suspend — verify correct binary is respawned
