# Claude Code Agent Support — Tasks

## Phase 1: Agent Registry & Server Config

- [x] 1a. Create `src/server/agent-registry.ts` with `AgentDefinition` type and `AgentRegistry` class
  - Define Kiro and Claude Code entries with binary env vars and default args
  - Implement `checkAvailability()` using `which`/`where` (cross-platform) with short TTL cache (~30s)
  - Implement `getAll()`, `get(id)`, `getDefault()` methods
  - Support legacy `KIRO_CLI_BINARY` / `KIRO_AGENT` env vars as fallbacks for the Kiro agent (emit deprecation warning to console)

- [x] 1b. Add environment variable documentation in `.env.example` or README:
  - `KIRO_BINARY`, `CLAUDE_BINARY`, `DEFAULT_AGENT`
  - Mark `KIRO_AGENT` and `KIRO_CLI_BINARY` as deprecated

- [x] 1c. Add `GET /api/agents` endpoint in `src/server/index.ts`
  - Returns agent list with availability and default
  - Call `registry.checkAvailability()` on server start

## Phase 2: Runner & Session Model

- [x] 2a. Update `src/server/runner.ts` — `createAcpRunner()` accepts `agent: AgentDefinition`
  - Replace hard-coded `kiro-cli` binary and args with `agent.resolvedBinary` and `agent.defaultArgs`
  - Update error messages (e.g., `child.on("close")`) to use agent label instead of hard-coded "kiro-cli"
  - Legacy `KIRO_AGENT` and `KIRO_CLI_BINARY` reads removed from runner (handled by AgentRegistry fallback)

- [-] 2b. Add `agent_id` column to sessions DB table in `src/electron/libs/session-store.ts`
  - Migration using existing pattern: `pragma table_info` check, then `ALTER TABLE sessions ADD COLUMN agent_id TEXT NOT NULL DEFAULT 'kiro'`
  - Update `Session` and `StoredSession` TypeScript types to include `agentId: string`
  - Update `createSession()`, `loadSessions()`, `getSession()`, and `persistSession()` to read/write `agent_id`

- [ ] 2c. Update `src/server/runner-manager.ts` — add `agentId` to `RunnerEntry`
  - Update existing `spawn()` and `getOrSpawn()` opts to accept `agentId`
  - Look up `AgentDefinition` from registry and pass to `createAcpRunner()`
  - Store `agentId` in the `RunnerEntry` for tracking

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

- [ ] 4e. Update `src/ui/components/SettingsModal.tsx`
  - Add "Default Agent" selector to the settings modal
  - Read from and write to `appStore.defaultAgentId` / `appStore.setDefaultAgent()`
  - Show unavailable agents as "(not installed)"

## Phase 5: Validation

- [ ] 5a. Unit test: `AgentRegistry` availability check with mocked `execFile`
- [ ] 5b. Unit test: `createAcpRunner` spawns correct binary when given each `AgentDefinition`
- [ ] 5c. Unit test: `session.start` with `agentId: "claude-code"` stores and returns correct agent
- [ ] 5d. Manual test: start a Kiro session and a Claude Code session concurrently — verify independent operation
- [ ] 5e. Manual test: suspend a Claude Code session, resume it — verify `claude acp` is respawned (not `kiro-cli`)
- [ ] 5f. Manual test: disable Claude Code binary, verify it shows as disabled in UI and produces a clear error if somehow invoked
- [ ] 5g. Regression test: existing Kiro-only workflow unchanged end-to-end
