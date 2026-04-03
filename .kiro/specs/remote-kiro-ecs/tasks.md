# Implementation Tasks

## Task 1: ACP TCP Transport Module

- [x] 1. Create `src/server/acp-tcp.ts` with `AcpTcpTransport` class
  - [x] 1.1 Implement TCP socket connection with configurable timeout
  - [x] 1.2 Implement newline-delimited JSON-RPC framing (buffer, split on `\n`, parse JSON)
  - [x] 1.3 Implement `request()` method — send JSON-RPC request, return promise resolved by matching response ID
  - [x] 1.4 Implement `notify()` method — send JSON-RPC notification (no response expected)
  - [x] 1.5 Implement `onNotification()` handler registration for incoming server notifications
  - [x] 1.6 Implement `onClose()` handler and `close()` method for cleanup
  - [x] 1.7 Add error handling: connection refused, timeout, unexpected disconnect, malformed JSON
  - [x] 1.8 Write unit tests for AcpTcpTransport (mock TCP socket, verify framing and request/response matching)

## Task 2: ECS Runner Implementation

- [x] 2. Replace `src/server/ecs-runner.ts` stub with real ECS RunTask + ACP-over-TCP implementation
  - [x] 2.1 Implement `launchSubAgent()` — call ECS RunTask API with task family, subnets, security group, and env var overrides (session ID, model, CWD)
  - [x] 2.2 Implement task IP discovery — poll DescribeTasks until RUNNING, extract private IP from ENI attachment
  - [x] 2.3 Implement `createEcsRunner()` returning `RunnerHandle` interface (`abort`, `sendPrompt`, `ready`, `onClose`)
  - [x] 2.4 Wire AcpTcpTransport into ECS Runner — connect to `<privateIp>:8080`, perform ACP handshake (`initialize` → `session/new`)
  - [x] 2.5 Implement `sendPrompt()` — forward prompt via ACP `session/prompt`, relay `session/update` notifications back as ServerEvents
  - [x] 2.6 Implement `abort()` — send `session/cancel` over ACP, then call ECS StopTask API
  - [x] 2.7 Add startup timeout (default 120s) — if task doesn't reach RUNNING, emit `runner.error` and reject `ready`
  - [x] 2.8 Add connection drop handling — emit `session.status` error event, mark runner as suspended
  - [x] 2.9 Read ECS config from environment variables (`ECS_CLUSTER`, `ECS_SUBAGENT_TASK_FAMILY`, `ECS_SUBAGENT_SUBNETS`, `ECS_SUBAGENT_SECURITY_GROUP`, `ECS_SUBAGENT_CONTAINER_PORT`)
  - [x] 2.10 Log RunTask latency (time from API call to RUNNING state)

## Task 3: Auth Bootstrap Enhancement

- [x] 3. Enhance `scripts/bootstrap-auth.sh` with AgentCore Identity Token Vault as primary credential source
  - [x] 3.1 Add Token Vault retrieval — use AgentCore Identity SDK/HTTP API to fetch `kirocli:oidc:device-registration` credentials bound to ECS task workload identity
  - [x] 3.2 Add credential writing — use `sqlite3` CLI to insert/replace entries in `auth_kv` table of `~/.local/share/kiro-cli/data.sqlite3`
  - [x] 3.3 Implement fallback chain: Token Vault → Secrets Manager → S3 → local file → exit non-zero
  - [x] 3.4 Add expired credential detection — if device registration is older than 90 days, log warning and fall through to next source
  - [x] 3.5 Add descriptive error logging for each failure in the chain
  - [x] 3.6 Add 10-second timeout for Token Vault retrieval
  - [x] 3.7 Test: container starts, pulls auth from Secrets Manager (Token Vault integration tested separately in Task 6), kiro-cli responds to `chat --no-interactive`

## Task 4: Kiro Remote CLI Client

- [x] 4. Polish `src/cli-client/kiro-remote.ts` for cross-platform use
  - [x] 4.1 Add `--server` argument parsing (e.g., `--server https://orchestrator.example.com`)
  - [x] 4.2 Implement WebSocket connection to Orchestrator's `/ws` endpoint
  - [x] 4.3 Implement session creation via `POST /api/sessions` REST call after WS connects
  - [x] 4.4 Implement prompt sending — `user_message` event with session ID and prompt text over WS
  - [x] 4.5 Implement streaming response rendering — handle `assistant_message`, `content` events, stream text to stdout
  - [x] 4.6 Implement tool use display — show `⚡ Tool: <name>` for `tool_use` events
  - [x] 4.7 Implement turn end detection — re-display input prompt on `end`, `done`, `turn_end` events
  - [x] 4.8 Implement exponential backoff reconnection (1s base, 30s max) with status messages
  - [x] 4.9 Implement `/quit` and `/exit` commands for clean shutdown
  - [x] 4.10 Handle Windows-specific concerns: line endings, terminal width, Ctrl+C
  - [x] 4.11 Add esbuild config to compile to a single JS file for easy distribution

## Task 5: Orchestrator Health Extension

- [x] 5. Extend health endpoints with ECS-specific information
  - [x] 5.1 Extend `/api/sessions/health` response to include `ecsTaskArn` and `ecsTaskState` per session when `ECS_RUNNER_ENABLED=true`
  - [x] 5.2 Log ECS task ARN, stop reason, and exit code when a Sub-Agent task fails or exits unexpectedly
  - [x] 5.3 Add 120-second startup timeout check — emit `runner.error` and cancel pending task if exceeded

## Task 6: AgentCore Identity Token Vault Integration

- [ ] 6. Implement AgentCore Identity Token Vault credential retrieval in bootstrap-auth.sh
  - [ ] 6.1 Research AgentCore Identity SDK/API for workload-identity-bound token retrieval from ECS tasks
  - [ ] 6.2 Implement Token Vault API call in bootstrap-auth.sh using `curl` or AgentCore CLI
  - [ ] 6.3 Parse Token Vault response and extract `kirocli:oidc:device-registration` fields (client_id, client_secret, refresh_token)
  - [ ] 6.4 Write one-time seed script — login interactively in a container, extract auth records, store in Token Vault via API
  - [ ] 6.5 Test: Sub-Agent container starts, fetches auth from Token Vault, kiro-cli works
  - [ ] 6.6 Document the 90-day credential lifecycle and renewal process

## Task 7: Infrastructure Wiring

- [x] 7. Create ECS infrastructure definitions for full deployment
  - [x] 7.1 Create ECR repository for Base_Container_Image
  - [x] 7.2 Create ECS cluster with Fargate capacity provider
  - [x] 7.3 Create ECS task definition for Orchestrator — image, port 3001, env vars, IAM task role (ecs:RunTask, ecs:StopTask, ecs:DescribeTasks, secretsmanager:GetSecretValue)
  - [x] 7.4 Create ECS task definition for Sub-Agent — image, port 8080, env vars, resource limits, IAM task role (secretsmanager:GetSecretValue, AgentCore Identity access)
  - [x] 7.5 Create ECS service for Orchestrator (desired count: 1)
  - [x] 7.6 Create ALB with HTTPS listener, target group on port 3001, WebSocket-compatible health check (`/healthz`)
  - [x] 7.7 Create security groups: ALB inbound 443, ALB→Orchestrator 3001, Orchestrator→Sub-Agent 8080, Sub-Agent outbound internet
  - [x] 7.8 Create IAM roles with least-privilege policies for both task types
  - [x] 7.9 Add CloudWatch log groups for Orchestrator and Sub-Agent tasks
  - [x] 7.10 Document environment variable configuration in README

## Task 8: Midway Cookie Injection (Nice-to-Have)

- [ ]* 8. Enable Midway cookie injection for internal-access Sub-Agents
  - [ ]* 8.1 Accept Midway cookie from CLI via secure header on session creation
  - [ ]* 8.2 Pass Midway cookie as env var override in ECS RunTask call
  - [ ]* 8.3 Write Midway cookie to `~/.midway/cookie` in bootstrap-auth.sh when `MIDWAY_COOKIE` env var is set
  - [ ]* 8.4 Test: Sub-Agent with Midway cookie can fetch content from an internal URL
