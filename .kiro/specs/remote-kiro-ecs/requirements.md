# Requirements Document

## Introduction

The "Remote Kiro ECS" feature moves the Kiro Assistant orchestration layer from a local CDM to AWS ECS, enabling a stable, always-on deployment accessible from any machine. A thin CLI client (`kiro-remote`) running on Windows connects via WebSocket to a remote Orchestrator running as an ECS task. The Orchestrator manages sessions and dispatches work to ephemeral kiro-cli sub-agent containers (also on ECS) that communicate via the ACP protocol. Authentication credentials for kiro-cli (OIDC tokens stored in `~/.local/share/kiro-cli/data.sqlite3`) are bootstrapped into sub-agent containers using AgentCore Identity token vault, with AWS Secrets Manager as a fallback. The POC scope proves the full chain: thin CLI → Orchestrator → single sub-agent on ECS.

## Glossary

- **Kiro_Remote_CLI**: The thin Node.js CLI client that runs on the user's local machine (Windows/Mac/Linux), connects to the Orchestrator via WebSocket, and provides a REPL interface for interacting with remote agents.
- **Orchestrator**: The Express + WebSocket server running as a long-lived ECS task that accepts client connections, manages sessions, and dispatches work to Sub_Agent containers via ECS RunTask.
- **Sub_Agent**: An ephemeral ECS task running kiro-cli in ACP server mode (`kiro-cli acp --agent kiro-assistant --trust-all-tools`) that processes a single session's work and terminates when idle.
- **ECS_Runner**: A new runner implementation (replacing the local process-spawning `createAcpRunner`) that launches Sub_Agent containers via the ECS RunTask API and communicates with them over a network transport.
- **ACP_Protocol**: The Agent Communication Protocol — a JSON-RPC-based stdio protocol used between the Orchestrator and kiro-cli for session management, prompts, and streaming responses.
- **Auth_Bootstrap**: The process of injecting kiro-cli OIDC credentials (client registration, refresh token, access token) into a Sub_Agent container at startup so kiro-cli can authenticate without interactive device flow.
- **Token_Vault**: AgentCore Identity's secure storage for OAuth tokens, bound to a workload identity, used as the primary credential source for Sub_Agent containers.
- **Secrets_Manager**: AWS Secrets Manager, used as a fallback credential source when AgentCore Identity Token_Vault is unavailable.
- **Auth_KV_Table**: The `auth_kv` table inside kiro-cli's SQLite database (`data.sqlite3`) that stores OIDC tokens including `kirocli:oidc:device-registration` (client registration, ~90-day expiry) and short-lived access/refresh tokens.
- **Base_Container_Image**: The Docker image built from `Dockerfile.kiro-cli` that includes kiro-cli and an auth bootstrap script, pushed to ECR and used by both the Orchestrator and Sub_Agent tasks.
- **Midway_Cookie**: An internal authentication cookie used for accessing corp-network services; injection into Sub_Agent containers is a nice-to-have for internal-access use cases.
- **RunnerManager**: The existing class (`src/server/runner-manager.ts`) that manages runner lifecycle, concurrency limits, and idle sweeping — to be extended with ECS_Runner support.
- **Session_Handler**: The existing module (`src/server/session-handler.ts`) that routes client events to runners and manages session state.

## Requirements

### Requirement 1: Base Container Image with Auth Bootstrap

**User Story:** As a platform operator, I want a Docker container image that includes kiro-cli and an auth bootstrap script, so that Sub_Agent containers can start with valid credentials without interactive login.

#### Acceptance Criteria

1. THE Base_Container_Image SHALL include kiro-cli installed and available on the PATH.
2. THE Base_Container_Image SHALL include an auth bootstrap shell script (`bootstrap-auth.sh`) that populates the Auth_KV_Table in kiro-cli's `data.sqlite3` before kiro-cli starts.
3. WHEN the auth bootstrap script runs, THE Auth_Bootstrap process SHALL attempt to retrieve OIDC credentials from the AgentCore Identity Token_Vault first.
4. IF the Token_Vault is unavailable or returns an error, THEN THE Auth_Bootstrap process SHALL fall back to retrieving credentials from AWS Secrets_Manager using the IAM task role.
5. IF both the Token_Vault and Secrets_Manager fail to provide credentials, THEN THE Auth_Bootstrap process SHALL log a descriptive error message and exit with a non-zero exit code.
6. WHEN credentials are successfully retrieved, THE Auth_Bootstrap process SHALL write them into the `auth_kv` table of `~/.local/share/kiro-cli/data.sqlite3` using SQLite CLI commands.
7. THE Base_Container_Image SHALL be publishable to Amazon ECR and usable as the image for both Orchestrator and Sub_Agent ECS task definitions.

### Requirement 2: ECS Runner for Sub-Agent Dispatch

**User Story:** As a developer, I want the Orchestrator to launch sub-agent containers on ECS instead of spawning local processes, so that agents run in isolated, scalable containers.

#### Acceptance Criteria

1. THE ECS_Runner SHALL implement the same `RunnerHandle` interface (`abort`, `sendPrompt`, `ready`, `onClose`) as the existing local `createAcpRunner` function.
2. WHEN the Orchestrator receives a new session request, THE ECS_Runner SHALL call the ECS RunTask API to launch a Sub_Agent task using the Base_Container_Image.
3. WHEN launching a Sub_Agent task, THE ECS_Runner SHALL pass the session ID, working directory, and model selection as environment variable overrides in the RunTask call.
4. THE ECS_Runner SHALL establish a network connection (TCP or WebSocket) to the Sub_Agent container's ACP_Protocol endpoint after the task reaches RUNNING state.
5. WHEN the network connection to the Sub_Agent is established, THE ECS_Runner SHALL perform the ACP_Protocol handshake (`initialize` → `session/new`) and resolve the `ready` promise.
6. WHEN `sendPrompt` is called, THE ECS_Runner SHALL forward the prompt to the Sub_Agent over the ACP_Protocol network connection and relay streaming `session/update` events back to the Orchestrator's event emitter.
7. WHEN `abort` is called, THE ECS_Runner SHALL send `session/cancel` over the ACP_Protocol connection and then call the ECS StopTask API to terminate the Sub_Agent task.
8. IF the Sub_Agent task fails to start or the ECS RunTask API returns an error, THEN THE ECS_Runner SHALL emit a `runner.error` event with a descriptive message and reject the `ready` promise.
9. IF the network connection to the Sub_Agent drops unexpectedly, THEN THE ECS_Runner SHALL emit a `session.status` event with status `error` and mark the runner as suspended for auto-recovery.

### Requirement 3: Orchestrator ECS Deployment

**User Story:** As a platform operator, I want the Orchestrator server to run as a long-lived ECS service behind an ALB, so that clients can connect over a stable HTTPS/WSS endpoint.

#### Acceptance Criteria

1. THE Orchestrator SHALL run as an ECS Fargate service with a minimum of 1 desired task.
2. THE Orchestrator ECS task definition SHALL use the Base_Container_Image with an entrypoint that starts the Express server (`node dist-server/server/index.js`).
3. THE Orchestrator SHALL be fronted by an Application Load Balancer (ALB) that terminates TLS and forwards HTTP/WebSocket traffic to the Orchestrator container on port 3001.
4. THE ALB SHALL configure WebSocket-compatible sticky sessions so that a client's WebSocket connection routes to the same Orchestrator task.
5. THE Orchestrator ECS task role SHALL have IAM permissions to call `ecs:RunTask`, `ecs:StopTask`, `ecs:DescribeTasks` for managing Sub_Agent tasks, and `ecr:GetAuthorizationToken` plus `ecr:BatchGetImage` for pulling container images.
6. THE Orchestrator ECS task role SHALL have IAM permissions to read from Secrets_Manager for the auth credential fallback path.
7. WHEN the Orchestrator starts, THE Orchestrator SHALL detect it is running in ECS mode (via `ECS_RUNNER_ENABLED` environment variable) and use the ECS_Runner instead of the local process runner.

### Requirement 4: Kiro Remote CLI Client

**User Story:** As a user on Windows, I want a polished thin CLI client that connects to the remote Orchestrator, so that I can interact with Kiro agents from my local machine without running kiro-cli locally.

#### Acceptance Criteria

1. THE Kiro_Remote_CLI SHALL accept a `--server` argument specifying the Orchestrator's URL (e.g., `--server https://orchestrator.example.com`).
2. WHEN the Kiro_Remote_CLI starts, THE Kiro_Remote_CLI SHALL establish a WebSocket connection to the Orchestrator's `/ws` endpoint.
3. WHEN the WebSocket connection is established, THE Kiro_Remote_CLI SHALL create a new session via the `POST /api/sessions` REST endpoint and display the session ID.
4. WHEN the user enters a prompt in the REPL, THE Kiro_Remote_CLI SHALL send a `user_message` event over the WebSocket containing the session ID and prompt text.
5. WHEN the Kiro_Remote_CLI receives `assistant_message` or `content` events, THE Kiro_Remote_CLI SHALL stream the text content to stdout in real time.
6. WHEN the Kiro_Remote_CLI receives `tool_use` events, THE Kiro_Remote_CLI SHALL display the tool name with a visual indicator (e.g., `⚡ Tool: <name>`).
7. WHEN the Kiro_Remote_CLI receives `end`, `done`, or `turn_end` events, THE Kiro_Remote_CLI SHALL re-display the input prompt for the next user turn.
8. IF the WebSocket connection drops, THEN THE Kiro_Remote_CLI SHALL attempt to reconnect with exponential backoff (starting at 1 second, maximum 30 seconds) and display a reconnecting status message.
9. WHEN the user types `/quit` or `/exit`, THE Kiro_Remote_CLI SHALL close the WebSocket connection and exit cleanly.
10. THE Kiro_Remote_CLI SHALL run on Windows, macOS, and Linux without platform-specific dependencies beyond Node.js.

### Requirement 5: AgentCore Identity Integration

**User Story:** As a platform operator, I want Sub_Agent containers to retrieve kiro-cli OIDC tokens from AgentCore Identity's token vault, so that credentials are managed securely with workload identity binding.

#### Acceptance Criteria

1. WHEN the Auth_Bootstrap script runs inside a Sub_Agent container, THE Auth_Bootstrap process SHALL use the AgentCore Identity SDK to request OIDC credentials bound to the ECS task's workload identity.
2. THE Token_Vault integration SHALL retrieve the `kirocli:oidc:device-registration` entry (containing client_id, client_secret, and refresh_token) from the vault.
3. WHEN the Token_Vault returns valid credentials, THE Auth_Bootstrap process SHALL write the device registration and refresh token into the Auth_KV_Table.
4. IF the Token_Vault returns expired credentials (device registration older than 90 days), THEN THE Auth_Bootstrap process SHALL log a warning indicating credential renewal is needed and proceed to the Secrets_Manager fallback.
5. THE Auth_Bootstrap process SHALL complete the credential retrieval and database population within 10 seconds under normal network conditions.

### Requirement 6: Sub-Agent Container Lifecycle

**User Story:** As a platform operator, I want Sub_Agent containers to be ephemeral and self-terminating, so that ECS resources are released when a session is idle.

#### Acceptance Criteria

1. WHEN a Sub_Agent container starts, THE Sub_Agent SHALL run the Auth_Bootstrap script, then start kiro-cli in ACP server mode (`kiro-cli acp --agent kiro-assistant --trust-all-tools`).
2. THE Sub_Agent container SHALL expose the ACP_Protocol endpoint on a configurable port (default 8080) for the Orchestrator to connect to.
3. WHILE the Sub_Agent has an active ACP session with ongoing prompts, THE Sub_Agent SHALL remain running and process requests.
4. WHEN the Sub_Agent receives no new prompts for a configurable idle timeout (default 15 minutes), THE Sub_Agent SHALL gracefully shut down the ACP session and exit with code 0.
5. IF the Sub_Agent's kiro-cli process crashes or exits unexpectedly, THEN THE Sub_Agent container SHALL exit with a non-zero code so ECS marks the task as STOPPED with a failure reason.
6. THE Sub_Agent ECS task definition SHALL specify resource limits (CPU and memory) appropriate for a single kiro-cli ACP session.

### Requirement 7: End-to-End Integration Wiring

**User Story:** As a platform operator, I want all ECS infrastructure components (task definitions, ECR repository, ALB, security groups, IAM roles) defined and wired together, so that the full chain from CLI to sub-agent works in a single deployment.

#### Acceptance Criteria

1. THE deployment SHALL include an ECR repository for the Base_Container_Image.
2. THE deployment SHALL include an ECS cluster with Fargate capacity providers.
3. THE deployment SHALL include an ECS task definition for the Orchestrator with the correct image, port mappings (3001), environment variables, and IAM task role.
4. THE deployment SHALL include an ECS task definition for the Sub_Agent with the correct image, port mappings (8080), environment variables, resource limits, and IAM task role.
5. THE deployment SHALL include an ALB with an HTTPS listener, target group pointing to the Orchestrator service, and WebSocket-compatible health check configuration.
6. THE deployment SHALL include security groups that allow: ALB to receive inbound HTTPS (443), ALB to forward to Orchestrator on port 3001, Orchestrator to connect to Sub_Agent containers on port 8080, and Sub_Agent containers to access the internet for kiro-cli API calls.
7. THE Orchestrator's IAM task role SHALL follow least-privilege principles, granting only the permissions specified in Requirement 3 acceptance criteria 5 and 6.
8. THE Sub_Agent's IAM task role SHALL have permissions to read from Secrets_Manager (for auth fallback) and access AgentCore Identity APIs, with no ECS management permissions.

### Requirement 8: Midway Cookie Injection (Nice-to-Have)

**User Story:** As a user, I want Sub_Agent containers to have access to my Midway cookie, so that agents can access internal corporate services on my behalf.

#### Acceptance Criteria

1. WHERE Midway cookie injection is enabled, THE Orchestrator SHALL accept a Midway cookie value from the Kiro_Remote_CLI via a secure channel (e.g., encrypted header on session creation).
2. WHERE Midway cookie injection is enabled, WHEN the Orchestrator launches a Sub_Agent task, THE Orchestrator SHALL pass the Midway cookie as an environment variable override in the RunTask call.
3. WHERE Midway cookie injection is enabled, THE Sub_Agent's Auth_Bootstrap script SHALL write the Midway cookie to the expected filesystem location (`~/.midway/cookie`) so that internal tools can use it.
4. IF the Midway cookie is expired or invalid, THEN THE Sub_Agent SHALL log a warning but continue operating — internal-access tools will fail gracefully with authentication errors.

### Requirement 9: Orchestrator Session Routing

**User Story:** As a developer, I want the Orchestrator to correctly route WebSocket messages between clients and their assigned Sub_Agent containers, so that multiple concurrent sessions are isolated.

#### Acceptance Criteria

1. WHEN a client sends a `user_message` event with a session ID, THE Orchestrator SHALL route the message to the ECS_Runner associated with that session.
2. WHEN a Sub_Agent emits streaming events (content, tool_use, turn_end), THE Orchestrator SHALL forward those events only to the WebSocket client that owns the session.
3. IF a client sends a message for a session whose Sub_Agent has been terminated, THEN THE Orchestrator SHALL launch a new Sub_Agent via the ECS_Runner and queue the message until the Sub_Agent is ready.
4. THE Orchestrator SHALL support at least 5 concurrent sessions, each backed by a separate Sub_Agent ECS task, configurable via the `KIRO_MAX_SESSIONS` environment variable.
5. WHEN a client disconnects, THE Orchestrator SHALL keep the Sub_Agent running for the configured idle timeout period to allow reconnection.

### Requirement 10: Health and Observability

**User Story:** As a platform operator, I want health checks and observability for the Orchestrator and Sub_Agent containers, so that I can monitor system status and diagnose issues.

#### Acceptance Criteria

1. THE Orchestrator SHALL expose the existing `/healthz` endpoint that returns HTTP 200 with uptime and process information, usable as the ALB health check target.
2. THE Orchestrator's `/api/sessions/health` endpoint SHALL include ECS-specific information: the number of running Sub_Agent tasks, their ECS task ARNs, and their current states.
3. WHEN a Sub_Agent task fails to start or exits unexpectedly, THE Orchestrator SHALL log the ECS task ARN, stop reason, and exit code.
4. THE Orchestrator SHALL log the round-trip latency of ECS RunTask calls (time from API call to task reaching RUNNING state).
5. IF a Sub_Agent task takes longer than 120 seconds to reach RUNNING state, THEN THE Orchestrator SHALL emit a `runner.error` event indicating a timeout and cancel the pending task.
