# Implementation Plan: AgentCore Runtime Sub-Agent

## Overview

Implement AgentCore Runtime as an alternative sub-agent backend alongside ECS Fargate and local process runners. The system uses a request-driven model via `InvokeAgentRuntime` with an A2A protocol adapter inside the container. The orchestrator's `RunnerManager` gains a three-way toggle (local → ECS → AgentCore), and credentials are managed via Token Vault with a fallback to existing bootstrap logic.

## Tasks

- [ ] 1. Refine AgentCore Runner implementation (`src/server/agentcore-runner.ts`)
  - [ ] 1.1 Update `loadConfig` to read `AGENTCORE_AGENT_ID`, `AGENTCORE_REGION`, `AGENTCORE_ENDPOINT`, and `AGENTCORE_STARTUP_TIMEOUT_MS` from environment variables, matching the design's `AgentCoreConfig` interface
    - Add `agentId`, optional `endpoint`, and `startupTimeoutMs` fields
    - Rename `agentRuntimeArn` to `agentRuntimeArn` only if the SDK requires it; otherwise use `agentId` per design
    - _Requirements: 4.5_

  - [ ] 1.2 Add `startupLatencyMs` tracking to `AgentCoreRunnerInfo` and log round-trip latency from invocation to first response
    - Record `launchedAt` timestamp before `InvokeAgentRuntime` call
    - Compute and store `startupLatencyMs` when first response chunk arrives
    - Log latency with `[agentcore:...]` tag
    - _Requirements: 8.1_

  - [ ] 1.3 Implement startup timeout logic — emit `runner.error` if container doesn't respond within `AGENTCORE_STARTUP_TIMEOUT_MS` (default 120s)
    - Wrap `InvokeAgentRuntime` call with a timeout race
    - On timeout, emit `runner.error` event and reject `ready` promise
    - _Requirements: 2.8, 8.5_

  - [ ] 1.4 Implement connection drop detection — when the SSE stream from `InvokeAgentRuntime` drops unexpectedly, emit `session.status` error and invoke close callbacks
    - Detect stream errors and premature close events
    - Emit `session.status` with status `error` and descriptive message
    - Call all registered `onClose` callbacks with exit code 1
    - _Requirements: 2.9_

  - [ ] 1.5 Ensure `abort` sends cancel payload via `InvokeAgentRuntime` and suppresses further events
    - Set `aborted = true` before any async work
    - After abort, no further `onEvent` calls should occur
    - Clean up `agentCoreRunnerStates` entry
    - _Requirements: 2.7_

  - [ ]* 1.6 Write property test: RunnerHandle Interface Conformance
    - **Property 1: RunnerHandle Interface Conformance**
    - Generate random valid option objects with fast-check, verify returned handle has `abort`, `sendPrompt`, `ready`, `onClose` methods
    - Minimum 100 iterations
    - **Validates: Requirements 2.1**

  - [ ]* 1.7 Write property test: Invocation API Receives Session Parameters
    - **Property 2: Invocation API Receives Session Parameters**
    - Generate random session IDs, cwds, and model strings; mock `InvokeAgentRuntime`; verify all three parameters are passed through
    - Minimum 100 iterations
    - **Validates: Requirements 2.2, 2.3**

  - [ ]* 1.8 Write property test: Invocation Failure Propagation
    - **Property 6: Invocation Failure Propagation**
    - Generate random error messages and timeout durations; verify `runner.error` event emitted and `ready` promise rejected
    - Minimum 100 iterations
    - **Validates: Requirements 2.8, 8.5**

  - [ ]* 1.9 Write property test: Connection Drop Detection
    - **Property 7: Connection Drop Detection**
    - Generate random connection states; simulate stream drop; verify `session.status` error emitted and close callbacks invoked
    - Minimum 100 iterations
    - **Validates: Requirements 2.9**

  - [ ]* 1.10 Write unit test: AgentCore Runner creation — verify RunnerHandle methods exist and are callable
    - _Requirements: 2.1_

  - [ ]* 1.11 Write unit test: Startup timeout — verify error emitted when container doesn't respond within timeout
    - _Requirements: 2.8, 8.5_

- [ ] 2. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 3. Implement A2A SSE response mapping and prompt forwarding
  - [ ] 3.1 Refine `handleA2AChunk` to correctly parse all ACP event types from SSE stream: `agent_message_chunk`, `tool_call`, `tool_call_update`, `turn_end`, and `_kiro.dev/metadata`
    - Handle `turn_end` events to trigger `finishTurn`
    - Map `_kiro.dev/metadata` to `session.metadata` events (contextUsagePercent, creditsUsed, turnDurationMs)
    - Skip `tool_call_update` events (progress updates)
    - _Requirements: 2.6, 5.5_

  - [ ] 3.2 Ensure `sendPrompt` constructs the correct A2A `message/stream` payload with session ID header (`X-Amzn-Bedrock-AgentCore-Runtime-Session-Id`) for session affinity
    - Include `runtimeSessionId` in `InvokeAgentRuntimeCommand` for session routing
    - Format prompt as A2A `message/stream` JSON-RPC with `parts: [{ kind: "text", text }]`
    - _Requirements: 2.6_

  - [ ]* 3.3 Write property test: Prompt Forwarding and Event Relay
    - **Property 4: Prompt Forwarding and Event Relay**
    - Generate random prompt strings and ACP event sequences; verify order-preserving relay to orchestrator event emitter
    - Minimum 100 iterations
    - **Validates: Requirements 2.6**

  - [ ]* 3.4 Write property test: Protocol Compatibility
    - **Property 12: Protocol Compatibility**
    - Generate random valid ACP JSON-RPC messages (initialize response, session/update, turn_end, metadata); verify AgentCore runner produces same `ServerEvent` types with equivalent payloads as ECS runner
    - Minimum 100 iterations
    - **Validates: Requirements 5.5**

- [ ] 4. Update Runner Manager and health endpoint
  - [ ] 4.1 Verify the three-way toggle in `runner-manager.ts` matches design: AgentCore → ECS → local, with warning when both flags are set
    - Confirm `AGENTCORE_RUNNER_ENABLED=true` takes precedence over `ECS_RUNNER_ENABLED=true`
    - Confirm warning is logged when both are set
    - Confirm local runner is used when neither is set
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6_

  - [ ] 4.2 Extend `getHealth()` to include `startupLatencyMs` in AgentCore runner info for the `/api/sessions/health` endpoint
    - Add `startupLatencyMs` field to the health response when AgentCore runner is active
    - _Requirements: 8.1, 8.2_

  - [ ]* 4.3 Write property test: Runner Selection Toggle
    - **Property 10: Runner Selection Toggle**
    - Generate random boolean combinations for `AGENTCORE_RUNNER_ENABLED` and `ECS_RUNNER_ENABLED`; verify correct runner is selected and warning logged when both true
    - Minimum 100 iterations
    - **Validates: Requirements 4.1, 4.6**

  - [ ]* 4.4 Write unit test: Runner toggle logic — verify correct runner selected for each env var combination (AGENTCORE only, ECS only, both, neither)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6_

  - [ ]* 4.5 Write property test: Health Endpoint AgentCore Info
    - **Property 14: Health Endpoint AgentCore Info**
    - Generate random session states with AgentCore runner info; verify health response includes `agentCoreRuntimeArn`, `agentCoreContainerState`, and startup latency
    - Minimum 100 iterations
    - **Validates: Requirements 8.1, 8.2**

- [ ] 5. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Implement Credential Adapter (`scripts/agentcore-entrypoint.sh`)
  - [ ] 6.1 Create `scripts/agentcore-entrypoint.sh` that fetches credentials from Token Vault REST endpoint (`KIRO_TOKEN_VAULT_ENDPOINT`) and writes them to kiro-cli's `auth_kv` SQLite table
    - Call `GET $KIRO_TOKEN_VAULT_ENDPOINT/credentials/kirocli-oidc` using curl with workload identity auth
    - Extract `device_registration` JSON from response
    - Write to `~/.local/share/kiro-cli/data.sqlite3` as `INSERT OR REPLACE INTO auth_kv (key, value) VALUES ('kirocli:oidc:device-registration', '<JSON>')`
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ] 6.2 Implement fallback logic — if Token Vault credentials are absent or fetch fails, fall back to existing `bootstrap-auth.sh` logic
    - Check if `KIRO_TOKEN_VAULT_ENDPOINT` is set
    - If curl fails or returns empty/malformed response, source `bootstrap-auth.sh`
    - Log which credential source was used
    - _Requirements: 3.5_

  - [ ] 6.3 After credential injection, start the A2A adapter (`node /home/kiro/a2a-adapter.js`) via `exec`
    - The entrypoint replaces itself with the A2A adapter process
    - _Requirements: 3.4, 6.1_

  - [ ]* 6.4 Write property test: Credential Round-Trip
    - **Property 8: Credential Round-Trip**
    - Generate random OIDC credentials (client_id, client_secret, refresh_token) with fast-check; simulate seed → Token Vault → adapter → SQLite round-trip; verify values preserved
    - Minimum 100 iterations
    - **Validates: Requirements 3.2, 9.2**

  - [ ]* 6.5 Write unit test: Credential adapter — verify Token Vault JSON → SQLite row transformation for known credential shapes
    - _Requirements: 3.2, 3.3_

  - [ ]* 6.6 Write unit test: Credential adapter fallback — verify fallback triggers when Token Vault env vars are absent
    - _Requirements: 3.5_

- [ ] 7. Implement Token Vault Seeder (`scripts/seed-token-vault.sh`)
  - [ ] 7.1 Create `scripts/seed-token-vault.sh` that extracts `kirocli:oidc:device-registration` from local `data.sqlite3` and uploads to Token Vault
    - Read from `~/.local/share/kiro-cli/data.sqlite3` using `sqlite3` CLI
    - Format as Token Vault credential payload
    - Upload via `PUT $KIRO_TOKEN_VAULT_ENDPOINT/credentials/kirocli-oidc`
    - Verify by reading back with `GET $KIRO_TOKEN_VAULT_ENDPOINT/credentials/kirocli-oidc`
    - Require `AGENTCORE_AGENT_ID` environment variable
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [ ] 7.2 Add error handling — display descriptive error messages if Token Vault API rejects the upload or prerequisites are missing
    - Check for `sqlite3` binary, `data.sqlite3` file, and valid credentials before upload
    - Display troubleshooting guidance on failure
    - _Requirements: 9.5_

  - [ ]* 7.3 Write unit test: Seeder script — verify extraction from SQLite and formatting for Token Vault API
    - _Requirements: 9.1, 9.2_

- [ ] 8. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Update Dockerfile for dual-mode and ARM64 support
  - [ ] 9.1 Update `Dockerfile.kiro-cli` to support dual-mode entrypoint: if `AGENTCORE_RUNTIME=true`, use `agentcore-entrypoint.sh`; otherwise use existing `bootstrap-auth.sh` + `acp-bridge.js`
    - Ensure `a2a-adapter.js` and `agentcore-entrypoint.sh` are already COPYed (verify existing lines)
    - Add documentation comments for ARM64 build requirement (`docker buildx build --platform linux/arm64`)
    - Container image must remain compatible with both ECS Fargate and AgentCore Runtime
    - _Requirements: 1.3, 1.6, 6.1, 10.3_

  - [ ]* 9.2 Write property test: Dual-Mode Container Compatibility
    - **Property 15: Dual-Mode Container Compatibility**
    - Generate random env var configurations with fast-check; verify correct process started based on `AGENTCORE_RUNTIME` flag
    - Minimum 100 iterations
    - **Validates: Requirements 10.3**

- [ ] 10. Wire no-automatic-fallback guarantee
  - [ ] 10.1 Verify that `RunnerManager.spawn` does NOT fall back to ECS runner when AgentCore runner fails — failure is reported to client for explicit retry
    - Confirm the three-way toggle selects exactly one runner per call
    - Confirm AgentCore runner failure does not trigger ECS runner creation within the same `spawn` call
    - _Requirements: 10.1, 10.4_

  - [ ]* 10.2 Write property test: No Automatic Fallback to ECS
    - **Property 16: No Automatic Fallback to ECS**
    - Generate random failure scenarios for AgentCore runner; verify ECS runner is never invoked after AgentCore failure
    - Minimum 100 iterations
    - **Validates: Requirements 10.4**

- [ ] 11. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using fast-check (minimum 100 iterations each)
- Unit tests validate specific examples and edge cases
- The A2A adapter (`scripts/a2a-adapter.js`) already exists from the cowboy's spike and is not reimplemented — tasks reference it as-is
- The existing `runner-manager.ts` and `agentcore-runner.ts` already have partial implementations; tasks refine and complete them
- Integration tests (7 manual tests from design) require actual AgentCore Runtime access and are not included as coding tasks
