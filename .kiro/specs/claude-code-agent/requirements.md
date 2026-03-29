# Requirements: Claude Code Agent Support

## Overview

Allow users to choose Claude Code as the agent backend for a session, alongside the existing Kiro agent. Both agents speak the ACP (Agent Communication Protocol) over stdin/stdout, so the communication layer requires no changes — this is primarily a UI, configuration, and session-model change.

## Requirements

### Requirement 1: Agent Selection at Session Start

**User Story:** As a user, I want to choose between Kiro and Claude Code when starting a new session, so that I can use the agent best suited for my task.

**Acceptance Criteria:**
- [ ] The "New Session" modal includes an agent selector (e.g., segmented control or dropdown) defaulting to Kiro
- [ ] Selecting Claude Code starts the session using `claude acp` instead of `kiro-cli acp --agent kiro-assistant`
- [ ] The selected agent is persisted with the session in the database
- [ ] The agent selector shows only agents whose CLI binary is available on the system

### Requirement 2: Agent Identity Visible in the UI

**User Story:** As a user, I want to see which agent is powering each session, so that I'm never confused about which backend is responding.

**Acceptance Criteria:**
- [ ] Each session in the sidebar displays the agent name or a distinct icon/badge (e.g., "K" for Kiro, "C" for Claude Code)
- [ ] The session detail header shows the active agent name
- [ ] Sessions started with different agents can coexist in the sidebar simultaneously

### Requirement 3: Agent-Specific Spawn Configuration

**User Story:** As a developer or power user, I want agent invocation to be configurable, so that I can control binary paths and flags without modifying source code.

**Acceptance Criteria:**
- [ ] The Kiro agent binary path defaults to `kiro-cli` and is overridable via `KIRO_BINARY` env var
- [ ] The Claude Code agent binary path defaults to `claude` and is overridable via `CLAUDE_BINARY` env var
- [ ] Each agent definition includes its default CLI arguments (e.g., `--trust-all-tools` for Kiro)
- [ ] If the selected agent binary is not found at session start, an error is surfaced to the user immediately rather than spawning a failed process

### Requirement 4: Agent Availability Detection

**User Story:** As a user, I want the UI to tell me if an agent is not installed, so that I don't start a session that's doomed to fail.

**Acceptance Criteria:**
- [ ] On server start (or first request), the system checks whether each agent binary is available via `which`/`where` or a test invocation
- [ ] Unavailable agents are shown as disabled in the agent selector, with a tooltip explaining the binary is not found
- [ ] A REST endpoint (`GET /api/agents`) returns the list of configured agents and their availability status

### Requirement 5: Session Resume Uses Correct Agent

**User Story:** As a user, I want a resumed or lazily-respawned session to use the same agent it was originally started with, so that conversation continuity is maintained.

**Acceptance Criteria:**
- [ ] The session record stores the agent ID used at creation
- [ ] `session.continue` and lazy-respawn flows read the stored agent ID and spawn the correct binary
- [ ] A session started with Claude Code is never accidentally resumed with Kiro, and vice versa

### Requirement 6: Default Agent Preference

**User Story:** As a user, I want to set a default agent so that I don't have to select it every time I start a session.

**Acceptance Criteria:**
- [ ] A settings option (persisted in app settings) stores the preferred default agent
- [ ] The agent selector in the new-session modal pre-selects the stored default
- [ ] The default can be overridden per-session without changing the stored preference

## Correctness Properties

- CP-1: A session's agent is immutable after creation — it cannot be changed mid-session.
- CP-2: No session is ever spawned with an agent binary that is known to be unavailable.
- CP-3: Session resume always uses the agent recorded in the session row, never the current default.
- CP-4: Concurrent sessions may use different agents without interfering with each other.
- CP-5: No regressions to existing Kiro-only sessions or the single-session workflow.
