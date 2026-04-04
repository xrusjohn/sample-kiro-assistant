# Requirements Document

## Introduction

The "AgentCore Runtime Sub-Agent" feature is a spike/experiment to explore running the existing kiro-cli sub-agent container on AgentCore Runtime instead of raw ECS Fargate. The current system (specified in `.kiro/specs/remote-kiro-ecs/`) uses an Express orchestrator on ECS that dispatches work to ephemeral kiro-cli sub-agent containers via `ecs:RunTask`. The sub-agent container runs an ACP bridge (`scripts/acp-bridge.js`) that exposes a TCP socket on port 8080 and translates between TCP and kiro-cli's stdio via a fake PTY. Auth credentials are bootstrapped via Secrets Manager or Token Vault at container startup.

AgentCore Runtime would replace the raw ECS Fargate layer for sub-agent containers, providing automatic workload identity (no manual IAM role management), Token Vault credential injection (replacing `bootstrap-auth.sh` for auth), and managed container lifecycle/scaling/health. The orchestrator would call AgentCore Runtime's API instead of `ecs:RunTask` to launch sub-agents.

This is a proof-of-concept — the goal is to demonstrate the sub-agent running in AgentCore Runtime with workload identity, the orchestrator connecting to it via the same ACP TCP transport, and credentials managed by Token Vault instead of Secrets Manager.

## Glossary

- **AgentCore_Runtime**: AWS Bedrock AgentCore's managed runtime environment that deploys and manages agent containers, providing automatic workload identity, credential injection, scaling, and health management.
- **Workload_Identity**: An identity automatically created by AgentCore_Runtime for each deployed agent, used for IAM-based access control and Token Vault credential binding without manual IAM role management.
- **Token_Vault**: AgentCore Identity's secure credential storage that automatically delivers OAuth/OIDC tokens to agent containers based on their Workload_Identity, replacing manual credential bootstrapping.
- **AgentCore_Runner**: A new runner implementation (parallel to the existing ECS_Runner in `src/server/ecs-runner.ts`) that launches sub-agent containers via AgentCore Runtime's API instead of ECS RunTask.
- **ACP_Bridge**: The TCP-to-PTY bridge (`scripts/acp-bridge.js`) that exposes a TCP socket on port 8080, spawns kiro-cli in ACP mode with a fake PTY, and translates between TCP (JSON-RPC) and stdio.
- **ACP_Protocol**: The Agent Communication Protocol — a newline-delimited JSON-RPC protocol used between the Orchestrator and kiro-cli for session management, prompts, and streaming responses.
- **Orchestrator**: The Express + WebSocket server (`src/server/index.ts`) running on ECS that manages sessions and dispatches work to sub-agent containers.
- **Sub_Agent**: An ephemeral container running the ACP_Bridge and kiro-cli in ACP server mode, processing a single session's work.
- **RunnerManager**: The existing class (`src/server/runner-manager.ts`) that manages runner lifecycle, concurrency limits, and idle sweeping — to be extended with AgentCore_Runner support.
- **Runner_Config_Toggle**: The environment variable mechanism (`ECS_RUNNER_ENABLED`, and new `AGENTCORE_RUNNER_ENABLED`) that selects which runner backend the Orchestrator uses.
- **Auth_KV_Table**: The `auth_kv` table inside kiro-cli's SQLite database (`data.sqlite3`) that stores OIDC tokens including `kirocli:oidc:device-registration` and short-lived access/refresh tokens.
- **Identity_SDK**: The AgentCore Identity SDK (Python-based `bedrock_agentcore.services.identity.IdentityClient`) used to interact with workload identity and Token Vault APIs from within agent containers.
- **Credential_Adapter**: A wrapper script or module that translates Token Vault's credential delivery format into the Auth_KV_Table rows that kiro-cli expects.

## Requirements

### Requirement 1: AgentCore Runtime Agent Deployment

**User Story:** As a platform operator, I want to deploy the existing ACP bridge container as an AgentCore Runtime agent, so that I can leverage managed container lifecycle and automatic workload identity instead of managing raw ECS Fargate tasks.

#### Acceptance Criteria

1. THE ACP_Bridge container image SHALL be deployable to AgentCore_Runtime using the AgentCore Runtime agent registration API (`create-agent-runtime` or equivalent).
2. WHEN the ACP_Bridge container is deployed to AgentCore_Runtime, THE container SHALL start the ACP_Bridge process (`node acp-bridge.js`) that spawns kiro-cli in ACP mode and exposes a TCP socket on port 8080.
3. THE AgentCore_Runtime agent configuration SHALL specify the existing `Dockerfile.kiro-cli` image (or a minimally modified variant) as the container image source.
4. WHEN AgentCore_Runtime starts the container, THE container SHALL receive a Workload_Identity automatically without requiring manual IAM role creation or assignment.
5. THE AgentCore_Runtime agent registration SHALL specify resource limits (CPU and memory) appropriate for a single kiro-cli ACP session.
6. IF the ACP_Bridge container requires modifications to run on AgentCore_Runtime (e.g., different entrypoint, health check endpoint, or environment variable format), THEN THE modifications SHALL be documented as a separate Dockerfile layer or entrypoint wrapper to preserve compatibility with the existing ECS Fargate deployment.

### Requirement 2: AgentCore Runner Implementation

**User Story:** As a developer, I want the Orchestrator to launch sub-agent containers via AgentCore Runtime's API, so that I can compare the AgentCore Runtime approach with the existing ECS RunTask approach.

#### Acceptance Criteria

1. THE AgentCore_Runner SHALL implement the same `RunnerHandle` interface (`abort`, `sendPrompt`, `ready`, `onClose`) as the existing `createEcsRunner` and `createAcpRunner` functions.
2. WHEN the Orchestrator receives a new session request and AgentCore_Runner is enabled, THE AgentCore_Runner SHALL call AgentCore Runtime's invocation API to launch a Sub_Agent container.
3. WHEN launching a Sub_Agent, THE AgentCore_Runner SHALL pass the session ID, working directory, and model selection as parameters to the AgentCore Runtime invocation.
4. WHEN the AgentCore_Runtime container reaches a running state, THE AgentCore_Runner SHALL discover the container's network endpoint (IP address and port) for ACP TCP connection.
5. WHEN the network endpoint is discovered, THE AgentCore_Runner SHALL establish a TCP connection to the Sub_Agent's ACP_Bridge on port 8080 and perform the ACP_Protocol handshake (`initialize` → `session/new`), reusing the existing `AcpTcpTransport` class from `src/server/acp-tcp.ts`.
6. WHEN `sendPrompt` is called, THE AgentCore_Runner SHALL forward the prompt to the Sub_Agent over the ACP_Protocol connection and relay streaming `session/update` events back to the Orchestrator's event emitter.
7. WHEN `abort` is called, THE AgentCore_Runner SHALL send `session/cancel` over the ACP_Protocol connection and then call AgentCore Runtime's API to terminate the container.
8. IF the AgentCore Runtime invocation API returns an error, THEN THE AgentCore_Runner SHALL emit a `runner.error` event with a descriptive message and reject the `ready` promise.
9. IF the TCP connection to the Sub_Agent drops unexpectedly, THEN THE AgentCore_Runner SHALL emit a `session.status` event with status `error` and invoke close callbacks for auto-recovery.

### Requirement 3: Token Vault Credential Injection

**User Story:** As a platform operator, I want AgentCore Runtime's Token Vault to inject kiro-cli's OIDC credentials into the sub-agent container automatically, so that I can eliminate the `bootstrap-auth.sh` credential fetching logic for AgentCore-managed containers.

#### Acceptance Criteria

1. WHEN a Sub_Agent container starts on AgentCore_Runtime, THE Token_Vault SHALL deliver the `kirocli:oidc:device-registration` credentials (client_id, client_secret, refresh_token) to the container via the AgentCore Identity credential delivery mechanism.
2. THE Credential_Adapter SHALL translate Token_Vault's delivered credentials into the Auth_KV_Table row format that kiro-cli expects (`key='kirocli:oidc:device-registration'`, `value=<JSON>`).
3. WHEN Token_Vault credentials are delivered, THE Credential_Adapter SHALL write them into kiro-cli's SQLite database (`~/.local/share/kiro-cli/data.sqlite3`) before kiro-cli starts.
4. THE Credential_Adapter SHALL be implemented as a lightweight entrypoint wrapper script that runs before the ACP_Bridge process.
5. IF Token_Vault credential delivery fails or credentials are not present, THEN THE Credential_Adapter SHALL fall back to the existing `bootstrap-auth.sh` logic (Secrets Manager, S3, local file).
6. THE Token_Vault credential seeding process (initial one-time upload of kiro-cli OIDC credentials to Token Vault) SHALL be documented as a manual step with a helper script.

### Requirement 4: Runner Config Toggle

**User Story:** As a developer, I want the Orchestrator to support both ECS Fargate and AgentCore Runtime runner backends via a configuration toggle, so that I can switch between them without code changes.

#### Acceptance Criteria

1. THE RunnerManager SHALL support three runner backends: local process (`createAcpRunner`), ECS Fargate (`createEcsRunner`), and AgentCore Runtime (`createAgentCoreRunner`).
2. WHEN the `AGENTCORE_RUNNER_ENABLED` environment variable is set to `true`, THE RunnerManager SHALL use the AgentCore_Runner to launch Sub_Agent containers.
3. WHEN the `ECS_RUNNER_ENABLED` environment variable is set to `true` and `AGENTCORE_RUNNER_ENABLED` is not set, THE RunnerManager SHALL use the existing ECS_Runner.
4. WHEN neither `AGENTCORE_RUNNER_ENABLED` nor `ECS_RUNNER_ENABLED` is set to `true`, THE RunnerManager SHALL use the local process runner (`createAcpRunner`).
5. THE AgentCore_Runner SHALL read its configuration from environment variables: `AGENTCORE_AGENT_ID` (agent runtime identifier), `AGENTCORE_REGION` (AWS region), and `AGENTCORE_ENDPOINT` (optional custom endpoint URL).
6. IF both `AGENTCORE_RUNNER_ENABLED` and `ECS_RUNNER_ENABLED` are set to `true`, THEN THE RunnerManager SHALL prefer AgentCore_Runner and log a warning about conflicting configuration.

### Requirement 5: AgentCore Runtime Network Connectivity

**User Story:** As a developer, I want the Orchestrator to connect to AgentCore Runtime-managed sub-agent containers via the same ACP TCP transport, so that the existing protocol and message handling code is reused without changes.

#### Acceptance Criteria

1. THE AgentCore_Runner SHALL discover the Sub_Agent container's network address using AgentCore Runtime's API (e.g., describe-agent-runtime-endpoint or invocation response metadata).
2. WHEN the Sub_Agent's network address is discovered, THE AgentCore_Runner SHALL connect using the existing `AcpTcpTransport` class on port 8080.
3. IF AgentCore_Runtime does not expose the container's TCP port directly (e.g., uses a different networking model), THEN THE AgentCore_Runner SHALL document the networking gap and propose an adapter approach (e.g., AgentCore Gateway proxy, WebSocket tunnel, or port-forwarding sidecar).
4. THE AgentCore_Runner SHALL retry TCP connection attempts up to 10 times with 2-second intervals, matching the existing ECS_Runner retry behavior.
5. THE ACP_Protocol handshake, message framing, and notification handling SHALL be identical between the AgentCore_Runner and the existing ECS_Runner — no protocol changes are required.

### Requirement 6: AgentCore Runtime Container Lifecycle

**User Story:** As a platform operator, I want AgentCore Runtime to manage the sub-agent container lifecycle (startup, health, shutdown), so that I can rely on the platform for scaling and recovery instead of custom ECS task management.

#### Acceptance Criteria

1. WHEN AgentCore_Runtime starts a Sub_Agent container, THE container SHALL follow the same startup sequence as the ECS deployment: credential injection → kiro-cli ACP mode → TCP socket listening on port 8080.
2. WHILE the Sub_Agent has an active ACP session with ongoing prompts, THE AgentCore_Runtime SHALL keep the container running.
3. WHEN the Sub_Agent receives no new prompts for the configured idle timeout (default 15 minutes), THE Sub_Agent SHALL exit gracefully so AgentCore_Runtime can reclaim resources.
4. IF AgentCore_Runtime provides a health check mechanism, THEN THE ACP_Bridge SHALL respond to health probes (e.g., TCP connection check on port 8080 or an HTTP health endpoint).
5. IF AgentCore_Runtime terminates the container unexpectedly (e.g., scaling event, resource limit), THEN THE AgentCore_Runner SHALL detect the termination and emit a `session.status` event with status `error`.
6. THE AgentCore_Runtime deployment SHALL support running at least 5 concurrent Sub_Agent containers, matching the existing `KIRO_MAX_SESSIONS` default.

### Requirement 7: Workload Identity Verification

**User Story:** As a developer, I want to verify that AgentCore Runtime's automatic workload identity works for the sub-agent container, so that I can confirm the container has proper IAM-based access without manual role management.

#### Acceptance Criteria

1. WHEN a Sub_Agent container starts on AgentCore_Runtime, THE container SHALL have access to a Workload_Identity that provides AWS credentials via the standard credential chain (environment variables or instance metadata).
2. THE Workload_Identity SHALL have sufficient permissions for the Sub_Agent to call kiro-cli's required AWS APIs (Identity Center token refresh endpoint).
3. THE spike SHALL include a verification step that logs the Workload_Identity ARN and confirms credential availability inside the container at startup.
4. IF the Workload_Identity does not have sufficient permissions for kiro-cli operation, THEN THE spike SHALL document the missing permissions and the process to request additional permissions via AgentCore Runtime configuration.

### Requirement 8: Observability and Comparison

**User Story:** As a developer, I want to compare AgentCore Runtime's operational characteristics with the existing ECS Fargate deployment, so that I can make an informed decision about which approach to use for production.

#### Acceptance Criteria

1. THE AgentCore_Runner SHALL log the round-trip latency from invocation API call to container reaching a connectable state (TCP port 8080 accepting connections).
2. THE Orchestrator's `/api/sessions/health` endpoint SHALL include AgentCore-specific information when AgentCore_Runner is active: agent runtime ID, container state, and connection status.
3. WHEN a Sub_Agent container fails to start or exits unexpectedly, THE AgentCore_Runner SHALL log the AgentCore Runtime error response, container exit reason, and any available diagnostic information.
4. THE spike SHALL produce a comparison document recording: cold-start latency (AgentCore Runtime vs ECS Fargate), credential injection time (Token Vault vs bootstrap-auth.sh), and operational complexity (API calls, configuration steps, IAM setup).
5. IF AgentCore_Runtime's cold-start latency exceeds 120 seconds, THEN THE AgentCore_Runner SHALL emit a `runner.error` event indicating a timeout, matching the existing ECS_Runner timeout behavior.

### Requirement 9: Credential Seeding for Token Vault

**User Story:** As a platform operator, I want a documented process to seed kiro-cli's OIDC credentials into AgentCore Token Vault, so that the Token Vault has the initial credentials to deliver to sub-agent containers.

#### Acceptance Criteria

1. THE spike SHALL include a helper script (`scripts/seed-token-vault.sh` or equivalent) that extracts kiro-cli OIDC credentials from a local `data.sqlite3` and uploads them to Token Vault via the AgentCore Identity API.
2. THE seeding script SHALL extract the `kirocli:oidc:device-registration` row from the Auth_KV_Table and format it for Token Vault's credential storage API.
3. WHEN the seeding script runs, THE script SHALL verify the credentials were stored successfully by reading them back from Token Vault.
4. THE seeding script SHALL document the prerequisite: a valid kiro-cli login session (run `kiro-cli login` first) with a device registration that has not expired (less than 90 days old).
5. IF the Token Vault API rejects the credential upload (e.g., permission denied, invalid format), THEN THE seeding script SHALL display a descriptive error message with troubleshooting guidance.

### Requirement 10: Fallback and Rollback

**User Story:** As a developer, I want the ability to fall back to the existing ECS Fargate runner if AgentCore Runtime encounters issues, so that the spike does not block ongoing development.

#### Acceptance Criteria

1. THE AgentCore_Runner implementation SHALL be additive — the existing ECS_Runner and local runner code SHALL remain unchanged and fully functional.
2. WHEN switching from AgentCore_Runner back to ECS_Runner, THE only change required SHALL be setting `AGENTCORE_RUNNER_ENABLED=false` and `ECS_RUNNER_ENABLED=true` in the Orchestrator's environment.
3. THE Sub_Agent container image SHALL remain compatible with both AgentCore_Runtime and ECS Fargate deployments — any AgentCore-specific modifications SHALL be conditional on environment detection (e.g., presence of AgentCore-specific environment variables).
4. IF the AgentCore_Runner fails to launch a container, THEN THE AgentCore_Runner SHALL NOT automatically fall back to ECS_Runner within the same session — the failure SHALL be reported to the client for explicit retry.
