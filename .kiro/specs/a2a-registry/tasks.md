# Tasks: A2A Agent Registry

## Task List

- [x] 1. Create agent profile catalog
  - [x] 1.1 Create `resources/agent-profiles.json` with all five required profiles (`coding-assistant`, `diagram-specialist`, `outlook-manager`, `disk-manager`, `pdf-processor`), each with `id`, `label`, `description`, `platform`, `skills`, `tools`, `tags`, and `cardTemplate` fields
  - [x] 1.2 Write a profile schema validator function (used by the registry and tests)
  - [x] 1.3 Implement `saveProfiles()` — write the in-memory profile list back to `agent-profiles.json` atomically (write to temp file, rename)

- [x] 2. Implement A2ARegistry core module (`src/server/a2a-registry.ts`)
  - [x] 2.1 Define TypeScript types: `Platform`, `InstanceStatus`, `AgentCard`, `AgentInstance`, `AgentProfile`, `Coverage`
  - [x] 2.2 Add SQLite table `agent_instances` migration — run on `A2ARegistry` construction using the existing `better-sqlite3` `db` instance passed from `session-handler.ts`
  - [x] 2.3 Implement `register()` — fetch agent card from URL, upsert instance in memory + SQLite, return `{ id, registeredAt }`
  - [x] 2.4 Implement `deregister()` — remove from memory and SQLite
  - [x] 2.5 Implement `heartbeat()` — update `lastSeen` and set status to `online` in memory + SQLite
  - [x] 2.6 Implement `getAll()` with optional `status`, `tag`, and `platform` filters
  - [x] 2.7 Implement `getById()`
  - [x] 2.8 Implement `getCoverage()` — count online/offline per platform
  - [x] 2.9 Implement `getProfiles()` — read `resources/agent-profiles.json` from disk on each call (no caching)
  - [x] 2.10 Implement `saveProfile(profile)` — upsert a profile in the catalog and persist to disk atomically
  - [x] 2.11 Implement `deleteProfile(id)` — remove a profile from the catalog and persist to disk
  - [x] 2.12 Implement `findBestInstance()` — explicit profileId match first, then tag match, returns `undefined` if no online match
  - [x] 2.13 Implement `startHeartbeatSweep()` — `setInterval` every 30s, marks instances with `lastSeen` > 90s ago as `offline`; also handles `unknown` status instances on startup
  - [x] 2.14 Implement startup load — on construction, load all persisted instances with status `unknown`, start a 90s one-shot timer to demote still-`unknown` instances to `offline`
  - [x] 2.15 Implement `getInstanceConfig(id)` — return merged config (profile defaults + instance overrides from metadata)
  - [x] 2.16 Implement `updateInstanceConfig(id, config)` — persist config overrides to instance metadata in memory + SQLite; if `restart: true`, emit `agent.restart` event

- [x] 3. Add Express routes (`/api/a2a/*`)
  - [x] 3.1 Create `createA2ARouter(registry: A2ARegistry)` factory that returns an Express `Router`
  - [x] 3.2 `POST /api/a2a/registry` — validate body, call `registry.register()`, return 400 on card fetch failure
  - [x] 3.3 `GET /api/a2a/registry` — call `registry.getAll()` with query param filters (`tag`, `platform`)
  - [x] 3.4 `GET /api/a2a/registry/online` — call `registry.getAll({ status: 'online' })`
  - [x] 3.5 `GET /api/a2a/registry/:id` — call `registry.getById()`, return 404 if not found
  - [x] 3.6 `DELETE /api/a2a/registry/:id` — call `registry.deregister()`, return 404 if not found
  - [x] 3.7 `PUT /api/a2a/registry/:id/heartbeat` — call `registry.heartbeat()`, return 404 if not found
  - [x] 3.8 `GET /api/a2a/profiles` — call `registry.getProfiles()`
  - [x] 3.9 `POST /api/a2a/profiles` — validate body, call `registry.saveProfile()`, return 201 with the created profile
  - [x] 3.10 `PUT /api/a2a/profiles/:id` — validate body, call `registry.saveProfile()`, return 404 if not found
  - [x] 3.11 `DELETE /api/a2a/profiles/:id` — call `registry.deleteProfile()`, return 404 if not found
  - [x] 3.12 `GET /api/a2a/coverage` — call `registry.getCoverage()`
  - [x] 3.13 `GET /api/a2a/registry/:id/introspect` — return full instance with card, resolved profile, active session count, and uptime
  - [x] 3.14 `GET /api/a2a/registry/:id/config` — call `registry.getInstanceConfig()`
  - [x] 3.15 `PUT /api/a2a/registry/:id/config` — call `registry.updateInstanceConfig()`; if `restart: true`, emit restart event
  - [x] 3.16 Mount the router in `src/server/index.ts` before the static file handler; instantiate `A2ARegistry` and start the heartbeat sweep in `boot()`

- [x] 4. Update `scripts/a2a-adapter.js` for self-registration and self-modification
  - [x] 4.1 Read `A2A_PROFILE`, `A2A_SKILLS`, `A2A_TAGS`, `A2A_PLATFORM`, `A2A_LABEL` env vars on startup
  - [x] 4.2 Build the `AGENT_CARD` dynamically from env vars: load profile template from catalog if `A2A_PROFILE` is set, apply `A2A_SKILLS`/`A2A_TAGS` overrides, set `platform` from `A2A_PLATFORM`
  - [x] 4.3 Implement `selfRegister()` — when `ORCHESTRATOR_URL` is set, `POST /api/a2a/registry` with `{ url, profileId, platform, metadata }` on startup; if profileId is unknown, include the full card so the registry can auto-create the profile; store returned `id`
  - [x] 4.4 Implement `startHeartbeat(instanceId)` — `setInterval` every 30s calling `PUT /api/a2a/registry/:id/heartbeat`
  - [x] 4.5 Add SIGTERM handler — call `DELETE /api/a2a/registry/:id` before exiting
  - [x] 4.6 Listen for `agent.restart` event from the registry (via a long-poll or SSE endpoint `GET /api/a2a/registry/:id/events`) — on receipt, reload env-driven config and re-serve updated AgentCard without full process restart

- [x] 5. Implement capability-based session routing
  - [x] 5.1 Add keyword-to-tag mapping (e.g., `{ "diagram": ["diagrams"], "email": ["email", "outlook"], "pdf": ["pdf"] }`) in the registry or a routing helper
  - [x] 5.2 Update `session-handler.ts` `session.start` handler to call `a2aRegistry.findBestInstance()` before falling back to the local ACP runner
  - [x] 5.3 Log routing decisions with instance ID, match reason (`explicit-profile`, `tag-match`, `fallback`), and session ID
  - [x] 5.4 Emit `session.status` event with `{ status: "agent-offline", instanceId }` when a routed instance goes offline during an active session

- [x] 6. Build the Agents UI panel (`src/ui/components/AgentsPanel.tsx`)
  - [x] 6.1 Create `AgentsPanel` component that fetches `/api/a2a/registry`, `/api/a2a/profiles`, and `/api/a2a/coverage` on mount and every 10 seconds
  - [x] 6.2 Render platform coverage summary bar at the top (colored badge per platform: green if online > 0, grey otherwise)
  - [x] 6.3 Render warning for platforms with zero online instances that have catalog profiles
  - [x] 6.4 Render each online `AgentInstance` row: profile label, platform badge, green status dot, URL, skills/tags, last seen timestamp, active session count
  - [x] 6.5 Render offline instances with dimmed style and red status dot
  - [x] 6.6 Render catalog profiles with no registered instance in a visually distinct "not running" style
  - [x] 6.7 Add "Deregister" button per instance row that calls `DELETE /api/a2a/registry/:id` and removes the row
  - [x] 6.8 Add "Agents" nav item to the `Sidebar` component that toggles the panel
  - [x] 6.9 Add "New Profile" button that opens an inline form to author a profile (id, label, platform, skills, tags) and calls `POST /api/a2a/profiles`
  - [x] 6.10 Add "Edit" button per catalog profile row that opens the same form pre-populated and calls `PUT /api/a2a/profiles/:id`
  - [x] 6.11 Add "Spawn" button per catalog profile row that calls `POST /api/a2a/spawn` and shows a spinner until the instance appears in the registry

- [x] 7. Agent spawning (`POST /api/a2a/spawn`)
  - [x] 7.1 Implement `spawnAgent(profileId, platform, env)` in a new `src/server/agent-spawner.ts` — launches a Docker container with the profile's env vars set (`A2A_PROFILE`, `A2A_SKILLS`, `A2A_TAGS`, `A2A_PLATFORM`, `ORCHESTRATOR_URL`)
  - [x] 7.2 Implement inline profile spawn — if `profile` object is passed instead of `profileId`, call `registry.saveProfile()` first then spawn
  - [x] 7.3 Implement spawn wait — poll the registry for the new instance's self-registration for up to 60 seconds; return `{ instanceId, registeredAt }` on success or HTTP 504 on timeout
  - [x] 7.4 `POST /api/a2a/spawn` route — validate body, call `spawnAgent()`, return result
  - [x] 7.5 `DELETE /api/a2a/spawn/:instanceId` route — send SIGTERM to the container and deregister the instance

- [x] 8. Write tests
  - [x] 8.1 Unit tests for `A2ARegistry` in `src/server/a2a-registry.test.ts` using `:memory:` SQLite — cover registration, deregistration, heartbeat, filters, coverage, startup load, sweep, profile CRUD, config get/update, and auto-profile creation on unknown profileId
  - [x] 8.2 Property-based tests using `fast-check` for all correctness properties defined in the design document (minimum 100 iterations each, tagged with `// Feature: a2a-registry, Property N: ...`)
  - [x] 8.3 Unit tests for the Express routes (use `supertest`) — cover all endpoints including 400/404 error cases, profile mutation endpoints, introspect, config endpoints
  - [x] 8.4 Unit tests for `AgentsPanel` — snapshot test for online/offline/catalog rendering, deregister button behavior, coverage warning display, profile editor modal
  - [x] 8.5 Unit tests for `agent-spawner.ts` — mock Docker, verify env var construction, timeout behavior
