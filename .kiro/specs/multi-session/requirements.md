# Multi-Session Support — Requirements

## Overview

Enable users to run multiple concurrent sessions in Kiro Assistant's web server mode, each backed by its own kiro-cli ACP process, with proper lifecycle management and resource controls.

## User Stories

### US-1: Concurrent Active Sessions

WHEN a user starts a new session while another session is actively running
THE SYSTEM SHALL spawn a separate kiro-cli ACP process for the new session and allow both to stream responses concurrently

### US-2: Session Switching Without Loss

WHEN a user switches between sessions in the sidebar
THE SYSTEM SHALL display the selected session's conversation history and streaming state without interrupting any background sessions

### US-3: Session Status Visibility

WHEN multiple sessions exist with different states (running, idle, completed, error)
THE SYSTEM SHALL display a visual status indicator on each session in the sidebar so the user can see which sessions are active at a glance

### US-4: Idle Session Lifecycle

WHEN a session's ACP process has been idle (no prompts sent) for a configurable duration (default: 30 minutes)
THE SYSTEM SHALL gracefully terminate the ACP process and mark the session as "suspended"

WHEN a user sends a prompt to a suspended session
THE SYSTEM SHALL spawn a new ACP process, attempt to resume via `session/load`, and deliver the prompt transparently

### US-5: Maximum Concurrent Process Limit

WHEN the number of active ACP processes reaches a configurable maximum (default: 5)
THE SYSTEM SHALL prevent starting new sessions and display a message indicating the limit has been reached

WHEN an active ACP process finishes or is terminated
THE SYSTEM SHALL allow new sessions to be started again

### US-6: Session Resume After Server Restart

WHEN the web server restarts and previously active sessions exist in the database
THE SYSTEM SHALL NOT automatically respawn ACP processes

WHEN a user sends a prompt to a session whose ACP process is no longer running
THE SYSTEM SHALL lazily respawn an ACP process and attempt `session/load` using the stored `kiroConversationId`

### US-7: Resource Monitoring

WHEN multiple ACP processes are running
THE SYSTEM SHALL track memory and process count and expose this information via a REST endpoint (`GET /api/sessions/health`)

## Acceptance Criteria

- [ ] Two sessions can stream agent responses simultaneously without interference
- [ ] Sidebar shows real-time status (running/idle/suspended/error) per session
- [ ] Idle sessions are automatically suspended after the configured timeout
- [ ] Suspended sessions transparently resume on next user prompt
- [ ] Server enforces a maximum concurrent ACP process limit
- [ ] After server restart, sessions resume lazily on first prompt
- [ ] Health endpoint reports active process count and per-session status
- [ ] No regressions to single-session workflow
