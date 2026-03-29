# Claude Code Agent Support — Tasks

## Phase 1: Agent Registry & Server Config

- [ ] 1a. Create `src/server/agent-registry.ts` with `AgentDefinition` type and `AgentRegistry` class
  - Define Kiro and Claude Code entries with binary env vars and default args
  - Implement `checkAvailability()` using `which`/`where` (cross-platform)
  - Implement `getAll()`, `get(id)`, `getDefault()` methods

- [ ] 1b. Add environment variable documentation in `.env.example` or README:
  - `KIRO_BINARY`, `CLAUDE_BINARY`, `DEFAULT_AGENT`
  - Mark `KIRO_AGENT` and `KIRO_CLI_BINARY` as deprecated

- [ ] 1c. Add `GET /api/agents` endpoint in `src/server/index.ts`
  - Returns agent list with availability and default
  - Call `registry.checkAvailability()` on server start

## Phase 2: Runner & Session Model

- [ ] 2a. Update `src/server/runner.ts` — `createAcpRunner()` accepts `agent: AgentDefinition`
  - Replace hard-coded `kiro-cli` binary and args with `agent.resolvedBinary` and `agent.defaultArgs`
  - Remove `KIRO_AGENT` and `KIRO_CLI_BINARY` reads (keep as deprecated fallback only)

- [ ] 2b. Add `agent_id` column to sessions DB table in `src/server/sessions.ts`
  - Migration: `ALTER TABLE sessions ADD COLUMN agent_id TEXT NOT NULL DEFAULT 'kiro'`
  - Update `Session` TypeScript type to include `agentId: string`
  - Update all DB read/write paths to include `agent_id`

- [ ] 2c. Update `src/server/runner-manager.ts` — add `agentId` to `RunnerEntry`
  - Update `spawn()` and `getOrSpawn()` signatures to accept `agentId`
  - Look up `AgentDefinition` from registry and pass to `createAcpRunner()`

## Phase 3: Session Handler & Event Types

- [ ] 3a. Update `src/electron/types.ts` (and `src/ui/types.ts` if separate)
  - Add `agentId?: string` to `SessionStartPayload`
  - Add `agents.list` server event type with `AgentInfo[]` payload
  - Add `agentId: string` to `SessionView` / `Session` client type

- [ ] 3b. Update `src/server/session-handler.ts`
  - `session.start`: read `agentId` from payload (default to `AgentRegistry.getDefault()`), store in DB
  - `session.continue` / lazy-respawn: read `agentId` from DB row, pass to `manager.getOrSpawn()`
  - Validate `agentId` against registry on `session.start`; emit `runner.error` if unknown or unavailable

- [ ] 3c. Emit `agents.list` event to WebSocket clients on connection in `src/server/index.ts`

## Phase 4: UI Changes

- [ ] 4a. Update `src/ui/store/useAppStore.ts`
  - Add `agents: AgentInfo[]` and `defaultAgentId: string` to store state
  - Handle `agents.list` server event
  - Add `setDefaultAgent(id)` action with `localStorage` persistence
  - Read `defaultAgentId` from `localStorage` on init (fallback: `"kiro"`)
  - Persist `agentId` in `SessionView` from session list events

- [ ] 4b. Update `src/ui/components/StartSessionModal.tsx`
  - Add segmented control / dropdown for agent selection
  - Initialize selection from `appStore.defaultAgentId`
  - Disable unavailable agents with tooltip
  - Include `agentId` in `session.start` payload

- [ ] 4c. Update `src/ui/components/Sidebar.tsx`
  - Add agent badge (e.g., "K" / "C") to each session list item
  - Derive badge from `session.agentId`

- [ ] 4d. Update session detail header component
  - Show agent name alongside session title

## Phase 5: Validation

- [ ] 5a. Unit test: `AgentRegistry` availability check with mocked `execFile`
- [ ] 5b. Unit test: `createAcpRunner` spawns correct binary when given each `AgentDefinition`
- [ ] 5c. Unit test: `session.start` with `agentId: "claude-code"` stores and returns correct agent
- [ ] 5d. Manual test: start a Kiro session and a Claude Code session concurrently — verify independent operation
- [ ] 5e. Manual test: suspend a Claude Code session, resume it — verify `claude acp` is respawned (not `kiro-cli`)
- [ ] 5f. Manual test: disable Claude Code binary, verify it shows as disabled in UI and produces a clear error if somehow invoked
- [ ] 5g. Regression test: existing Kiro-only workflow unchanged end-to-end
