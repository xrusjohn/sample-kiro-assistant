# Requirements: A2A Agent Registry

## Introduction

Relay (the Kiro Assistant orchestrator) is evolving from a process manager that spawns agents into a session manager and control plane for a distributed multi-agent system. Agents running on Docker, ECS, CDM, Windows, or AgentCore register themselves with Relay on startup and advertise their capabilities via A2A agent cards. Relay maintains a live registry of what's running, where, and what it can do. The UI surfaces this as an observability dashboard. Agents and the orchestrator use the registry for capability-based routing and peer discovery.

This spec covers the registry itself: the data model, the self-registration protocol, the API, the UI, and the agent catalog (known profiles).

## Glossary

- **Relay**: The Kiro Assistant orchestrator server — the Express + TypeScript backend in `src/server/`. Acts as session manager, control plane, and registry host.
- **AgentProfile**: A definition of a type of agent — its skills, tools, platform requirements, and what it will advertise in its A2A card. Stored in `resources/agent-profiles.json`. Mutable at runtime via the Profile Management API. Analogous to a class definition.
- **AgentInstance**: A live registration — a running agent that has POSTed to the Registry. Has a URL, a fetched card, a profile reference, platform metadata, and heartbeat state. Analogous to an object instance.
- **AgentCard**: The A2A `/.well-known/agent-card.json` document served by each agent container. Describes name, skills, tags, and capabilities. Fetched by Relay on registration to verify reachability.
- **Registry**: The in-memory + SQLite store in Relay that holds all current AgentInstances. The source of truth for what is live.
- **A2A_Adapter**: The `scripts/a2a-adapter.js` process running inside each agent container. Serves the AgentCard and proxies A2A protocol messages to the ACP bridge.
- **Platform**: Where an agent runs — `any`, `linux`, `cdm`, `windows`, or `agentcore`. Determines what capabilities are available (Midway auth, Windows filesystem, etc.).
- **Capability**: A named feature an AgentInstance has — e.g., `midway-auth`, `windows-filesystem`, `powershell`. Derived from the profile and platform.
- **Heartbeat**: A periodic `PUT /api/a2a/registry/:id/heartbeat` call from a running agent to signal it is still alive.
- **Self-registration**: The act of an agent POSTing to `POST /api/a2a/registry` on startup to make itself known to Relay.
- **Routing**: The process of selecting an AgentInstance to handle a session, based on skill tag matching and platform availability.
- **Coverage**: A summary of which platforms have at least one online AgentInstance.
- **Self-description**: The act of an agent proposing its own AgentProfile to the registry during registration, so the catalog reflects what the agent actually is rather than what was hand-authored.
- **Self-modification**: An agent updating its own running configuration (skills, MCPs) via the registry API and signaling a restart to apply changes.
- **Profile authoring**: Creating or updating an AgentProfile via the API — performed by an agent, the orchestrator, or the UI rather than by hand-editing JSON files.
- **Agent spawning**: Launching a new agent container from a profile definition via `POST /api/a2a/spawn`, callable by the orchestrator or by another agent.

## Requirements

### Requirement 1: Agent Profile Catalog

**User Story:** As a developer, I want a catalog of known agent profiles that can be created and updated at runtime, so that the system knows what agents could exist and agents can define themselves without hand-crafted JSON.

#### Acceptance Criteria

1. THE Relay SHALL ship a `resources/agent-profiles.json` file defining the initial set of AgentProfiles.
2. THE Relay SHALL require each AgentProfile to include: `id`, `label`, `description`, `platform` (one of `any` | `linux` | `cdm` | `windows` | `agentcore`), `skills` (array of skill IDs), `tools` (array of MCP server IDs), `tags` (array of strings), and `cardTemplate` (the AgentCard it will advertise when running).
3. THE catalog SHALL include at minimum the following profiles: `coding-assistant`, `diagram-specialist`, `outlook-manager`, `disk-manager`, and `pdf-processor`.
4. WHEN `GET /api/a2a/profiles` is called, THE Relay SHALL return the full AgentProfile catalog regardless of which instances are currently registered.
5. WHEN the catalog file changes on disk, THE Relay SHALL return the updated catalog on the next request without requiring a server restart.
6. WHEN `POST /api/a2a/profiles` is called with a valid AgentProfile body, THE Relay SHALL add the profile to the catalog and persist it to `agent-profiles.json`.
7. WHEN `PUT /api/a2a/profiles/:id` is called with a valid AgentProfile body, THE Relay SHALL update the matching profile in the catalog and persist the change.
8. WHEN `DELETE /api/a2a/profiles/:id` is called, THE Relay SHALL remove the profile from the catalog and persist the change.
9. IF `PUT` or `DELETE /api/a2a/profiles/:id` is called with an unknown `id`, THEN THE Relay SHALL return HTTP 404.

### Requirement 2: Agent Self-Registration

**User Story:** As an agent container, I want to register myself with Relay on startup, so that I appear in the registry and can receive routed sessions.

#### Acceptance Criteria

1. WHEN an agent calls `POST /api/a2a/registry` with `{ url, profileId, platform, metadata }`, THE Registry SHALL attempt to register the agent as a new AgentInstance.
2. WHEN a registration request is received, THE Registry SHALL fetch `/.well-known/agent-card.json` from the provided URL to verify reachability and capture the AgentCard.
3. IF the AgentCard fetch fails or returns a non-200 response, THEN THE Registry SHALL reject the registration with HTTP 400 and a `message` field describing the failure.
4. WHEN registration succeeds, THE Registry SHALL return `{ id, registeredAt }` where `id` is a stable UUID for this AgentInstance.
5. WHEN an agent calls `POST /api/a2a/registry` with a URL and profileId that already exists in the Registry, THE Registry SHALL upsert the record rather than create a duplicate.
6. WHEN `ORCHESTRATOR_URL` is set in the environment, THE A2A_Adapter SHALL call `POST /api/a2a/registry` on process startup.
7. WHEN the A2A_Adapter receives SIGTERM, THE A2A_Adapter SHALL call `DELETE /api/a2a/registry/:id` before exiting.
8. WHEN an agent registers with a `profileId` that does not exist in the catalog, THE Registry SHALL automatically create a new AgentProfile derived from the agent's fetched AgentCard and persist it to the catalog.
9. WHEN `GET /api/a2a/registry/:id/introspect` is called, THE Registry SHALL return the full AgentInstance including its card, resolved profile, active session count, and uptime.

### Requirement 3: Heartbeat and Liveness

**User Story:** As an operator, I want Relay to automatically detect when agents go offline, so that the registry reflects reality and routing does not send sessions to dead agents.

#### Acceptance Criteria

1. WHILE an AgentInstance is registered, THE A2A_Adapter SHALL call `PUT /api/a2a/registry/:id/heartbeat` every 30 seconds.
2. WHEN an AgentInstance has not sent a heartbeat within 90 seconds, THE Registry SHALL set that instance's status to `offline`.
3. WHEN a heartbeat or new registration is received for an instance with status `offline`, THE Registry SHALL set that instance's status to `online`.
4. WHILE an AgentInstance has status `offline`, THE Registry SHALL exclude it from routing decisions.
5. WHEN `GET /api/a2a/registry` is called, THE Registry SHALL include both `online` and `offline` instances, each with a `status` field.
6. WHEN `GET /api/a2a/registry/online` is called, THE Registry SHALL return only instances with status `online`.

### Requirement 4: Registry API

**User Story:** As a developer or agent, I want a clean REST API to query and manage the registry, so that both the UI and peer agents can discover what is available.

#### Acceptance Criteria

1. WHEN `GET /api/a2a/registry` is called, THE Registry SHALL return all AgentInstances (online and offline) with full metadata.
2. WHEN `GET /api/a2a/registry/online` is called, THE Registry SHALL return only AgentInstances with status `online`.
3. WHEN `GET /api/a2a/registry/:id` is called with a valid instance ID, THE Registry SHALL return that single AgentInstance.
4. IF `GET /api/a2a/registry/:id` is called with an unknown ID, THEN THE Registry SHALL return HTTP 404 with a `message` field.
5. WHEN `DELETE /api/a2a/registry/:id` is called, THE Registry SHALL remove that AgentInstance immediately.
6. WHEN `PUT /api/a2a/registry/:id/heartbeat` is called, THE Registry SHALL update `lastSeen` to the current timestamp and set status to `online`.
7. WHEN `GET /api/a2a/registry?tag=<value>` is called, THE Registry SHALL return only instances whose AgentCard skills include a tag matching `<value>`.
8. WHEN `GET /api/a2a/registry?platform=<value>` is called, THE Registry SHALL return only instances whose platform field equals `<value>`.
9. THE Registry SHALL return all responses as JSON. IF an error occurs, THEN THE Registry SHALL include a `message` field in the response body.

### Requirement 5: Platform Coverage Summary

**User Story:** As an operator, I want to see at a glance which platforms are currently covered, so that I know whether platform-specific tasks can be handled right now.

#### Acceptance Criteria

1. WHEN `GET /api/a2a/coverage` is called, THE Registry SHALL return a Coverage object listing each known platform (`any`, `linux`, `cdm`, `windows`, `agentcore`) with an `online` count and an `offline` count.
2. THE Relay UI SHALL display a platform coverage indicator at the top of the Agents panel showing which platforms have at least one online instance.
3. WHEN a platform has zero online instances and the catalog contains at least one AgentProfile requiring that platform, THE Relay UI SHALL display a warning naming the affected profiles.

### Requirement 6: Parameterized Agent Card

**User Story:** As an agent container, I want my A2A agent card to reflect my actual profile and skills, so that discovery is accurate and routing works correctly.

#### Acceptance Criteria

1. THE A2A_Adapter SHALL read `A2A_PROFILE`, `A2A_SKILLS`, `A2A_TAGS`, `A2A_PLATFORM`, and `A2A_LABEL` from environment variables on startup.
2. WHEN `A2A_PROFILE` is set and matches a known profile ID in the catalog, THE A2A_Adapter SHALL populate the AgentCard from that profile's `cardTemplate`.
3. WHEN `A2A_SKILLS` or `A2A_TAGS` are set, THE A2A_Adapter SHALL use those values to override the corresponding fields from the profile template.
4. WHEN no `A2A_PROFILE` or skill env vars are set, THE A2A_Adapter SHALL serve the default "Kiro Assistant" AgentCard.
5. THE AgentCard served at `GET /.well-known/agent-card.json` SHALL include a `platform` field reflecting the value of `A2A_PLATFORM`, or `any` if not set.

### Requirement 7: Capability-Based Session Routing

**User Story:** As the orchestrator, I want to route new sessions to the best available agent instance based on skill tags, so that specialized agents handle the tasks they are built for.

#### Acceptance Criteria

1. WHEN a new session is created with an explicit `profileId` parameter, THE Relay SHALL select an online AgentInstance whose `profileId` matches, if one exists.
2. WHEN a new session is created without an explicit `profileId`, THE Relay SHALL select an online AgentInstance whose AgentCard tags include at least one tag from a predefined keyword-to-tag mapping applied to the session's initial prompt.
3. IF no matching online AgentInstance is found, THEN THE Relay SHALL fall back to the default local ACP runner (coding-assistant behavior).
4. WHEN a routing decision is made, THE Relay SHALL log the selected instance ID, the match reason (`explicit-profile`, `tag-match`, or `fallback`), and the session ID.
5. WHEN the selected AgentInstance transitions to `offline` during an active session, THE Relay SHALL emit a `session.status` event with `{ status: "agent-offline", instanceId }` to the connected WebSocket client.

### Requirement 8: Registry UI (Observability Dashboard)

**User Story:** As an operator, I want a live view of all registered agents in the Relay UI, so that I can see what is running, where, and whether it is healthy.

#### Acceptance Criteria

1. THE Relay UI SHALL include an "Agents" panel accessible from the sidebar.
2. THE Agents panel SHALL display each registered AgentInstance with: profile label, platform badge, status indicator, URL, skills/tags, last seen timestamp, and active session count.
3. THE Agents panel SHALL also display AgentProfiles from the catalog that have no registered instance, rendered in a visually distinct style (e.g., greyed out).
4. THE Agents panel SHALL refresh its data every 10 seconds without a full page reload.
5. THE Agents panel SHALL display the platform Coverage summary at the top of the panel.
6. WHEN an operator clicks "Deregister" on an AgentInstance row, THE Relay UI SHALL call `DELETE /api/a2a/registry/:id` and remove the row from the panel.

### Requirement 9: Persistence

**User Story:** As an operator, I want the registry to survive Relay restarts, so that agents that are still running do not need to re-register immediately.

#### Acceptance Criteria

1. THE Registry SHALL persist AgentInstance records to the SQLite database at `~/.kiro-assistant/sessions.db`.
2. THE Registry schema SHALL store the following fields per instance: `id`, `profileId`, `url`, `platform`, `card` (JSON), `metadata` (JSON), `registeredAt`, `lastSeen`, `status`.
3. WHEN Relay starts, THE Registry SHALL load all previously persisted AgentInstances with status `unknown`.
4. WHEN an AgentInstance with status `unknown` sends a heartbeat within 90 seconds of Relay startup, THE Registry SHALL set that instance's status to `online`.
5. WHEN an AgentInstance with status `unknown` does not send a heartbeat within 90 seconds of Relay startup, THE Registry SHALL set that instance's status to `offline`.

### Requirement 10: Agent Self-Modification

**User Story:** As a running agent, I want to update my own profile and configuration via the registry API, so that I can evolve my capabilities without an operator hand-editing files.

#### Acceptance Criteria

1. WHEN an agent calls `PUT /api/a2a/registry/:id/config` with `{ skills, tools, tags, mcpServers }`, THE Registry SHALL update the AgentInstance's metadata and persist the new configuration.
2. WHEN an agent calls `PUT /api/a2a/registry/:id/config` with `{ restart: true }`, THE Registry SHALL emit a `agent.restart` event to the A2A_Adapter for that instance, which SHALL reload its configuration and re-serve an updated AgentCard.
3. WHEN an agent updates its own configuration, THE Registry SHALL also update the corresponding AgentProfile in the catalog if the `profileId` matches an existing profile.
4. WHEN `GET /api/a2a/registry/:id/config` is called, THE Registry SHALL return the current effective configuration for that instance (merged from profile defaults and instance overrides).
5. WHEN an agent calls `POST /api/a2a/profiles` to create a new profile, THE Registry SHALL accept the request from any registered AgentInstance (not just human operators), treating agent-authored profiles as first-class entries in the catalog.

### Requirement 11: Agent Spawning

**User Story:** As an agent or operator, I want to spawn a new agent instance from a profile definition via the API, so that the system can grow its own capabilities without manual container management.

#### Acceptance Criteria

1. WHEN `POST /api/a2a/spawn` is called with `{ profileId, platform, env }`, THE Relay SHALL launch a new agent container configured with the matching profile's skills, tools, and tags.
2. WHEN `POST /api/a2a/spawn` is called with an inline `{ profile, platform, env }` (no existing profileId), THE Relay SHALL create the profile in the catalog and then spawn the container.
3. WHEN a spawned container successfully self-registers, THE Relay SHALL return `{ instanceId, registeredAt }` to the original spawn caller.
4. IF a spawned container fails to self-register within 60 seconds, THEN THE Relay SHALL return HTTP 504 with a `message` field and clean up the container.
5. WHEN `DELETE /api/a2a/spawn/:instanceId` is called, THE Relay SHALL send SIGTERM to the spawned container and remove it from the registry.
6. THE spawn endpoint SHALL be callable by any registered AgentInstance, enabling agents to spawn peer specialists autonomously.
