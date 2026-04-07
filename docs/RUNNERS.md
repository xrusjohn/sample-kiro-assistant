# Runner Architecture

Kiro Assistant supports three interchangeable runner backends. All implement the same `RunnerHandle` interface, so the rest of the server is unaware of which one is active.

## The RunnerHandle Interface

```typescript
type RunnerHandle = {
  ready: Promise<void>;          // resolves when the runner is ready to accept prompts
  sendPrompt: (text: string) => void;
  abort: () => void;
  onClose?: (callback: (code: number | null) => void) => void;
};
```

## Runner Selection

`RunnerManager` picks a runner based on environment variables, checked in this order:

```
AGENTCORE_RUNNER_ENABLED=true  →  AgentCore runner
ECS_RUNNER_ENABLED=true        →  ECS runner
(neither)                      →  ACP runner (default)
```

If both are set, AgentCore wins with a warning.

---

## 1. ACP Runner (Default)

**File:** `src/server/runner.ts`

Spawns `kiro-cli acp` as a local child process and communicates via JSON-RPC over stdio.

```
Express server  →  child_process.spawn(kiro-cli acp)  →  stdio JSON-RPC
```

**Startup sequence:**
1. Spawn `kiro-cli acp --agent kiro-assistant --trust-all-tools`
2. Send `initialize` RPC → exchange capabilities
3. Send `session/new` with `cwd` and `model`
4. Ready — queue any pending prompt

**Env vars:**
- `KIRO_BINARY` — path to kiro-cli (default: `kiro-cli`)
- `CLAUDE_BINARY` — path to Claude Code CLI (default: `claude-agent-acp`)
- `DEFAULT_AGENT` — which agent to use (default: `kiro`)

**Best for:** Local development, CDM, AgentSpaces — anywhere kiro-cli is installed and authenticated.

---

## 2. ECS Runner

**File:** `src/server/ecs-runner.ts`  
**Enable:** `ECS_RUNNER_ENABLED=true`

Launches an ECS Fargate task per session, then connects to it via ACP-over-TCP.

```
Express server  →  ecs:RunTask  →  Fargate task (kiro-cli + acp-bridge.js)
                →  TCP :8080   →  AcpTcpTransport  →  JSON-RPC
```

**Startup sequence:**
1. Call `ecs:RunTask` with container overrides (`KIRO_SESSION_ID`, `KIRO_CWD`, `KIRO_MODEL`)
2. Poll `DescribeTasks` until status = `RUNNING` (up to 120s, configurable)
3. Extract private IP from ENI attachment
4. TCP connect to `privateIp:8080` (retries up to 10 times)
5. ACP handshake: `initialize` → `session/new`
6. Ready

**Why the PTY bridge?** `kiro-cli acp` calls `isatty(stdin)` and exits silently if stdin is a plain pipe. `scripts/acp-bridge.js` uses `script -q -c '...' /dev/null` to give kiro-cli a PTY while keeping the bridge's own stdio as clean pipes for the TCP socket.

**Env vars:**

| Variable | Required | Description |
|----------|----------|-------------|
| `ECS_CLUSTER` | No | ECS cluster name (default: `relay`) |
| `ECS_SUBAGENT_TASK_FAMILY` | No | Task definition family (default: `kiro-subagent`) |
| `ECS_SUBAGENT_SUBNETS` | Yes | Comma-separated subnet IDs |
| `ECS_SUBAGENT_SECURITY_GROUP` | Yes | Security group ID |
| `ECS_SUBAGENT_CONTAINER_PORT` | No | Container port (default: `8080`) |
| `ECS_SUBAGENT_STARTUP_TIMEOUT_MS` | No | Startup timeout (default: `120000`) |

Auth env vars are forwarded from orchestrator to sub-agent: `KIRO_TOKEN_VAULT_ENDPOINT`, `KIRO_AUTH_SECRET_ARN`, `KIRO_AUTH_S3_URI`, `MIDWAY_COOKIE`.

**Health info:** `GET /api/sessions/health` returns per-session ECS state: `taskArn`, `taskState`, `launchedAt`, `connectedAt`, `runTaskLatencyMs`.

**Best for:** Cloud-native deployments, multi-user, always-on. No SSH tunnels. See `docs/REMOTE_ECS.md` for the full deployed architecture.

---

## 3. AgentCore Runner

**File:** `src/server/agentcore-runner.ts`  
**Enable:** `AGENTCORE_RUNNER_ENABLED=true`

Invokes AWS Bedrock AgentCore Runtime via `InvokeAgentRuntimeCommand`. Unlike ECS, this is **request-driven** — no persistent connection, no container lifecycle management.

```
Express server  →  InvokeAgentRuntimeCommand  →  AgentCore Runtime  →  container (a2a-adapter.js)
                ←  SSE stream                 ←                     ←
```

**How it works:**
1. Ready immediately (no startup wait — AgentCore manages the container)
2. On each `sendPrompt`: call `InvokeAgentRuntimeCommand` with A2A JSON-RPC payload
3. Stream SSE response chunks, parse `agent_message_chunk` and `tool_call` events
4. Emit `stream.message` events to WebSocket clients
5. Finish turn on stream end

**Payload format (A2A):**
```json
{
  "jsonrpc": "2.0",
  "method": "message/stream",
  "params": {
    "message": {
      "role": "user",
      "parts": [{ "kind": "text", "text": "..." }],
      "messageId": "<uuid>"
    }
  }
}
```

**Env vars:**

| Variable | Required | Description |
|----------|----------|-------------|
| `AGENTCORE_AGENT_RUNTIME_ARN` | Yes | AgentCore Runtime ARN |
| `AGENTCORE_REGION` | No | AWS region (default: `us-east-1`) |

**Session ID:** The Kiro Assistant session ID is passed directly as `runtimeSessionId` — AgentCore uses it for conversation continuity.

**Health info:** `GET /api/sessions/health` returns per-session AgentCore state: `agentRuntimeArn`, `containerState`, `invocationId`, `launchedAt`, `connectedAt`.

**Best for:** Serverless deployments, managed infrastructure, Token Vault auth. See `docs/WHY_AGENTCORE.md` for the full rationale and `docs/AGENTCORE_JOURNAL.md` for operational learnings.

---

## RunnerManager

**File:** `src/server/runner-manager.ts`

Manages the lifecycle of all active runners:

- **Max concurrent sessions:** `KIRO_MAX_SESSIONS` (default: 5)
- **Idle timeout:** `KIRO_IDLE_TIMEOUT_MINUTES` (default: 30) — suspends idle runners
- **Sweep interval:** 60s — checks for idle/stale runners
- **Hot-restart:** `restartSession()` in `session-handler.ts` — destroys and respawns a runner with full history, picks up new MCP config and model settings

Runner states: `starting` → `active` → `idle` → `suspended`

---

## Agent Registry

**File:** `src/server/agent-registry.ts`

Two agents are registered by default:

| ID | Binary | Args | Env var |
|----|--------|------|---------|
| `kiro` | `kiro-cli` | `acp --agent kiro-assistant --trust-all-tools` | `KIRO_BINARY` |
| `claude-code` | `claude-agent-acp` | — | `CLAUDE_BINARY` |

Default agent: `DEFAULT_AGENT` env var (default: `kiro`).

The registry checks binary availability on WebSocket connect and reports it via `GET /api/agents`.
