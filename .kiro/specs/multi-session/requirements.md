# Requirements: Multi-Session Support

## Overview

Enable users to run multiple concurrent sessions in Kiro Assistant's web server mode, each backed by its own kiro-cli ACP process, with proper lifecycle management and resource controls.

## Requirements

### Requirement 1: Concurrent Active Sessions

**User Story:** As a user, I want to start a new session while another is actively running, so that I can work on multiple tasks in parallel.

**Acceptance Criteria:**
- [ ] The system spawns a separate kiro-cli ACP process for each new session
- [ ] Two or more sessions can stream agent responses simultaneously without interference
- [ ] Each session maintains its own independent conversation state

### Requirement 2: Session Switching Without Loss

**User Story:** As a user, I want to switch between sessions in the sidebar without losing any conversation state, so that I can context-switch freely.

**Acceptance Criteria:**
- [ ] Selecting a session in the sidebar displays that session's full conversation history
- [ ] The selected session's current streaming state is shown accurately
- [ ] Switching sessions does not interrupt or affect any background sessions

### Requirement 3: Session Status Visibility

**User Story:** As a user, I want to see the status of each session at a glance, so that I know which sessions are active, idle, or in an error state.

**Acceptance Criteria:**
- [ ] Each session in the sidebar displays a visual status indicator
- [ ] Supported statuses include: running, idle, suspended, and error
- [ ] Status indicators update in real time as session state changes

### Requirement 4: Idle Session Lifecycle

**User Story:** As a user, I want idle sessions to be automatically suspended and transparently resumed, so that system resources are not wasted on inactive sessions.

**Acceptance Criteria:**
- [ ] Sessions whose ACP process has been idle for a configurable duration (default: 30 minutes) are gracefully terminated and marked as "suspended"
- [ ] Sending a prompt to a suspended session spawns a new ACP process and attempts to resume via `session/load`
- [ ] The resume process is transparent to the user — the prompt is delivered without extra manual steps

### Requirement 5: Maximum Concurrent Process Limit

**User Story:** As a user, I want the system to enforce a maximum number of concurrent ACP processes, so that the host machine's resources are protected.

**Acceptance Criteria:**
- [ ] The system enforces a configurable maximum concurrent ACP process limit (default: 5)
- [ ] When the limit is reached, new session creation is blocked and a clear message is displayed to the user
- [ ] When an active ACP process finishes or is terminated, new sessions can be started again

### Requirement 6: Session Resume After Server Restart

**User Story:** As a user, I want my sessions to survive a server restart, so that I don't lose my work.

**Acceptance Criteria:**
- [ ] On server restart, ACP processes are NOT automatically respawned
- [ ] Sending a prompt to a session whose ACP process is no longer running lazily respawns the process
- [ ] The respawned process attempts `session/load` using the stored `kiroConversationId`

### Requirement 7: Resource Monitoring

**User Story:** As a user or operator, I want to monitor the health of running sessions, so that I can detect resource issues early.

**Acceptance Criteria:**
- [ ] A REST endpoint (`GET /api/sessions/health`) exposes active process count and per-session status
- [ ] Memory usage and process count are tracked while multiple ACP processes are running

## Correctness Properties

- CP-1: Two concurrent sessions streaming responses must never cross-contaminate each other's conversation data.
- CP-2: The number of active ACP processes must never exceed the configured maximum limit.
- CP-3: A suspended session, when prompted, must always attempt to resume before creating a fresh conversation.
- CP-4: After server restart, no ACP processes are spawned until a user explicitly sends a prompt to a session.
- CP-5: No regressions to the single-session workflow — existing single-session behavior must remain fully functional.
