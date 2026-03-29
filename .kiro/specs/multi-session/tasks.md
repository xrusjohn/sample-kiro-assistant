# Multi-Session Support — Tasks

## Phase 0: Process Cleanup (Prerequisite)

- [ ] 0a. Create `src/server/pid-tracker.ts` — track child PIDs in `/tmp/kiro-assistant-pids.json`, with add/remove/killStale/cleanup methods
- [ ] 0b. Integrate pid-tracker into `createAcpRunner` (register on spawn, unregister on child exit)
- [ ] 0c. Add graceful shutdown handler in `src/server/index.ts` — catch SIGINT/SIGTERM, abort all runners, clean PID file, exit
- [ ] 0d. Call `killStale()` on server boot before starting the HTTP listener

## Phase 1: Runner Lifecycle Manager

- [ ] 1. Create `src/server/runner-manager.ts` with `RunnerManager` class
  - `RunnerEntry` type with state, lastActivity, spawnedAt
  - `spawn()` with maxConcurrent check
  - `getOrSpawn()` for lazy resume
  - `markIdle()`, `destroy()`, `getHealth()` methods
  - Periodic idle sweep timer (configurable interval)

- [ ] 2. Add `"suspended"` to `SessionStatus` in `src/electron/types.ts` and `src/ui/types.ts`

- [ ] 3. Add new server events: `session.suspended`, `session.limit_reached` to both type files

## Phase 2: Wire Into Session Handler

- [ ] 4. Refactor `src/server/session-handler.ts` to use `RunnerManager` instead of raw `runnerHandles` Map
  - `session.start` → `manager.spawn()`
  - `session.continue` → `manager.getOrSpawn()`
  - `session.stop` → `manager.markIdle()`
  - `session.delete` → `manager.destroy()`

- [ ] 5. Read `KIRO_MAX_SESSIONS` and `KIRO_IDLE_TIMEOUT_MINUTES` env vars in session-handler or runner-manager, with defaults (5 and 30)

- [ ] 6. Add `GET /api/sessions/health` endpoint in `src/server/index.ts` returning active process count and per-session state

## Phase 3: UI Updates

- [ ] 7. Update `src/ui/store/useAppStore.ts` to handle `session.suspended` and `session.limit_reached` events
  - `session.suspended` → update session status in store
  - `session.limit_reached` → set a `sessionLimitReached` flag

- [ ] 8. Update `src/ui/components/Sidebar.tsx` to show status indicators per session
  - 🟢 running, 🟡 idle, ⚪ suspended, 🔴 error
  - Disable "New Session" button when limit reached, with tooltip

- [ ] 9. Ensure prompt submission to a suspended session works transparently (no UI changes needed — session.continue already handles it, just verify)

## Phase 4: Validation

- [ ] 10. Manual test: open two sessions, send prompts to both, verify concurrent streaming
- [ ] 11. Manual test: leave a session idle past timeout, verify it suspends and resumes on next prompt
- [ ] 12. Manual test: restart server, send prompt to existing session, verify lazy resume
- [ ] 13. Verify no regressions to single-session workflow
