# Multi-Session Support — Design

## Current Architecture

Today, `session-handler.ts` maintains a `Map<string, RunnerHandle>` keyed by session ID. Each `createAcpRunner()` call spawns a `kiro-cli acp` child process communicating over stdin/stdout pipes (no TCP ports needed). The map already supports multiple entries, but the system lacks lifecycle management, concurrency limits, and proper status tracking for multiple active processes.

```
┌─────────────┐     WebSocket      ┌──────────────────┐
│  Browser UI  │◄──────────────────►│  Express Server   │
│  (React)     │                    │  index.ts          │
└─────────────┘                    └────────┬───────────┘
                                            │
                                   ┌────────▼───────────┐
                                   │  session-handler.ts │
                                   │  runnerHandles Map  │
                                   └────────┬───────────┘
                                            │ spawn per session
                              ┌─────────────┼─────────────┐
                              ▼             ▼             ▼
                         ┌────────┐   ┌────────┐   ┌────────┐
                         │kiro-cli│   │kiro-cli│   │kiro-cli│
                         │  acp   │   │  acp   │   │  acp   │
                         │(stdio) │   │(stdio) │   │(stdio) │
                         └────────┘   └────────┘   └────────┘
```

## Component Changes

### 1. Runner Lifecycle Manager (new: `src/server/runner-manager.ts`)

Central manager that wraps the `runnerHandles` map with lifecycle logic.

```typescript
interface RunnerEntry {
  handle: RunnerHandle;
  sessionId: string;
  state: "starting" | "active" | "idle" | "suspended";
  lastActivity: number;       // timestamp of last prompt sent
  spawnedAt: number;
}

interface RunnerManagerConfig {
  maxConcurrent: number;      // default: 5
  idleTimeoutMs: number;      // default: 30 * 60 * 1000
  healthCheckIntervalMs: number; // default: 60 * 1000
}
```

Responsibilities:
- Enforce `maxConcurrent` limit before spawning new ACP processes
- Track `lastActivity` per runner, run periodic sweep to suspend idle ones
- Provide `getOrSpawn(sessionId)` that lazily creates runners on demand
- Expose health/status data for the REST endpoint
- Clean up on `abort()` / session delete

### 2. Session Handler Changes (`src/server/session-handler.ts`)

- Replace direct `runnerHandles` Map usage with `RunnerManager` calls
- `session.start` → calls `manager.spawn(sessionId, opts)` which checks limits
- `session.continue` → calls `manager.getOrSpawn(sessionId)` for lazy resume
- `session.stop` → calls `manager.markIdle(sessionId)` instead of just updating DB status
- `session.delete` → calls `manager.destroy(sessionId)`
- New event type: `session.suspended` emitted when idle timeout triggers

### 3. Session Status Model (update `src/electron/types.ts`)

Add `"suspended"` to `SessionStatus` type:

```typescript
type SessionStatus = "idle" | "running" | "completed" | "error" | "suspended";
```

### 4. Server Event Types (update types)

New events:
```typescript
| { type: "session.suspended"; payload: { sessionId: string } }
| { type: "session.limit_reached"; payload: { maxConcurrent: number; active: number } }
```

### 5. REST Endpoint (`GET /api/sessions/health`)

Returns:
```json
{
  "maxConcurrent": 5,
  "activeProcesses": 3,
  "sessions": [
    { "id": "abc", "state": "active", "idleSeconds": 0 },
    { "id": "def", "state": "idle", "idleSeconds": 342 },
    { "id": "ghi", "state": "suspended", "idleSeconds": null }
  ]
}
```

### 6. UI Changes (`src/ui/components/Sidebar.tsx`, `src/ui/store/useAppStore.ts`)

- Sidebar session items show a colored dot or icon for status:
  - 🟢 running — actively streaming
  - 🟡 idle — ACP process alive, no active prompt
  - ⚪ suspended — ACP process terminated, will resume on prompt
  - 🔴 error
- Store handles new `session.suspended` and `session.limit_reached` events
- When limit is reached, disable "New Session" button with tooltip

### 7. Event Routing

Current `setBroadcast` sends all events to all WebSocket clients. This is acceptable because:
- Events already carry `sessionId` in their payload
- The UI store already filters by `activeSessionId` for display
- Broadcasting is simpler and avoids client-tracking complexity

No change needed here. If we later support multiple browser tabs with different active sessions, we can add server-side filtering.

## Sequence: New Session With Limit Check

```
User clicks "New Session"
  → Client sends session.start
  → session-handler calls manager.spawn()
  → manager checks activeCount < maxConcurrent
    → YES: spawn kiro-cli acp, add to map, proceed normally
    → NO: emit session.limit_reached, return error to client
```

## Sequence: Idle Timeout → Suspend → Resume

```
Timer fires (every 60s)
  → manager sweeps entries where (now - lastActivity) > idleTimeoutMs
  → For each idle entry:
    → handle.abort()
    → remove from active map
    → set state = "suspended"
    → emit session.suspended

User sends prompt to suspended session
  → session.continue handler calls manager.getOrSpawn(sessionId)
  → manager spawns new kiro-cli acp
  → attempts session/load with stored kiroConversationId
  → on success: delivers prompt
  → on failure: falls back to session/new with history injection (existing behavior)
```

## Configuration

Environment variables (with defaults):
```
KIRO_MAX_SESSIONS=5
KIRO_IDLE_TIMEOUT_MINUTES=30
```

## Process Cleanup (Prerequisite)

Before multi-session, we need robust child process lifecycle management to prevent orphan `kiro-cli acp` processes.

### Layer 1: Graceful Shutdown

Server catches `SIGINT`/`SIGTERM`, iterates all runner handles, aborts each, then exits.

### Layer 2: PID File Tracking (`src/server/pid-tracker.ts`)

```typescript
interface TrackedProcess {
  pid: number;
  sessionId: string;
  spawnedAt: number;
}
```

- On spawn: write child PID + sessionId to `/tmp/kiro-assistant-pids.json`
- On child exit (normal or abort): remove PID from file
- On server boot: read file, check if any PIDs are still alive (`process.kill(pid, 0)`), kill stale ones with `SIGTERM`→`SIGKILL` escalation, then clean the file

### Layer 3: Default spawn behavior

`child_process.spawn` defaults to `detached: false`, so children share the parent's process group. No change needed.

## Error Handling

- ACP process crash: existing `child.on("close")` handler already emits error status. Manager removes entry from active map.
- session/load failure on resume: existing fallback to session/new with history injection handles this.
- spawn failure (binary not found): existing error handling in `createAcpRunner` covers this.

## Testing Strategy

- Unit: RunnerManager lifecycle logic (spawn, idle sweep, limit enforcement)
- Integration: Two concurrent sessions streaming simultaneously
- Manual: Server restart → session resume flow, idle timeout behavior
