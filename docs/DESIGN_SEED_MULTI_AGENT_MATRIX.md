# Design Seed: Multi-Agent Runner Matrix

## Vision

The orchestrator dispatches work to any combination of agents and runtimes. The agent (kiro-cli, claude-code, or future agents) is independent of the runtime (local, ECS, AgentCore, Windows reverse-tunnel). Any agent can run on any runtime, as long as the agent binary is available there.

## The Matrix

| | Local (in-container) | ECS Fargate | AgentCore Runtime | Windows (reverse-tunnel) | CDM (reverse-tunnel) |
|---|---|---|---|---|---|
| **kiro-cli** | ✅ works today | ✅ built (acp-bridge + PTY) | ✅ spec'd (a2a-adapter) | ❌ no Windows binary | ✅ design seed |
| **claude-code** | ✅ works today | 🔧 easy (IAM role) | 🔧 easy (IAM role) | ✅ runs natively | ✅ runs natively |
| **strands** | 🔧 Python agent | 🔧 Python container | 🔧 Python container | 🔧 Python agent | 🔧 Python agent |

## Why This Works

Everything is built on two abstractions:

1. **RunnerHandle** — the orchestrator's interface to any runner. Four methods: `sendPrompt`, `abort`, `ready`, `onClose`. Every runner implements this regardless of how it launches or connects to the agent.

2. **AgentDefinition** — the agent registry's description of an agent. Binary path, default args, availability. The runner spawns whatever the definition says.

The runner doesn't know or care what agent it's running. The agent doesn't know or care what runtime it's on. The orchestrator picks a (runner, agent) pair based on the session's requirements.

## Agent Profiles

### kiro-cli
- Binary: `kiro-cli`
- ACP mode: `kiro-cli acp --agent kiro-assistant --trust-all-tools`
- Auth: AWS Identity Center OIDC (sqlite bootstrap required)
- Platforms: Linux, macOS (no Windows)
- Special: needs PTY bridge for remote TCP, plain pipes for co-located spawn

### claude-code
- Binary: `claude-agent-acp`
- ACP mode: `claude-agent-acp` (no extra args)
- Auth: Bedrock via IAM role (ECS/AgentCore) or local AWS creds / API token (Windows)
- Platforms: Linux, macOS, Windows
- Special: no bootstrap script needed on ECS/AgentCore — IAM role just works

### strands (future)
- Binary: Python script
- Protocol: custom (needs adapter to RunnerHandle)
- Auth: Bedrock via IAM role or API keys
- Platforms: anywhere Python runs
- Special: would need its own adapter pattern

## Runtime Profiles

### Local (in-container)
- How: `child_process.spawn()` with stdio pipes
- Connect: direct stdio JSON-RPC
- Auth: whatever's in the container
- Runner: `createAcpRunner` (existing)

### ECS Fargate
- How: `ecs:RunTask` → poll DescribeTasks → get IP
- Connect: TCP :8080 via acp-bridge.js (PTY wrapper)
- Auth: bootstrap-auth.sh (Token Vault → Secrets Manager → S3)
- Runner: `createEcsRunner` (existing)

### AgentCore Runtime
- How: `InvokeAgentRuntime` (request-driven, Runtime proxies)
- Connect: A2A protocol via a2a-adapter.js (spawns agent with stdio pipes)
- Auth: Token Vault REST endpoint + IAM workload identity
- Runner: `createAgentCoreRunner` (existing)
- Requirement: ARM64 container image

### Windows Reverse-Tunnel
- How: Windows machine runs `windows-runner.js`, connects outbound to orchestrator via WebSocket
- Connect: orchestrator sends prompts over WebSocket, runner spawns agent locally with stdio pipes
- Auth: local AWS creds or API token (user's machine)
- Runner: `createRemoteRunner` (new — WebSocket-based)

### CDM Reverse-Tunnel
- How: CDM runs `cdm-runner.js`, connects outbound to orchestrator via WebSocket
- Connect: same as Windows reverse-tunnel
- Auth: local kiro-cli login + Midway cookie (already authenticated)
- Runner: same `createRemoteRunner` (reused)
- Special: has Midway/internal access

## Runner Selection Logic

```typescript
// Expanded runner selection in RunnerManager.spawn():

// 1. Check for registered remote runners (Windows/CDM) that match the request
const remoteRunner = this.remoteRunners.find(r =>
  r.capabilities.agents.includes(agentId) &&
  (!opts.internal || r.capabilities.internal)
);
if (remoteRunner) return createRemoteRunner(remoteRunner, opts);

// 2. AgentCore Runtime (if enabled)
if (process.env.AGENTCORE_RUNNER_ENABLED === 'true')
  return createAgentCoreRunner(opts);

// 3. ECS Fargate (if enabled)
if (process.env.ECS_RUNNER_ENABLED === 'true')
  return createEcsRunner(opts);

// 4. Local (fallback)
return createAcpRunner(opts);
```

## Container Images

### kiro-cli container (`Dockerfile.kiro-cli`)
Already exists. Includes kiro-cli, acp-bridge.js, a2a-adapter.js, bootstrap-auth.sh.
- ECS mode: `bootstrap-auth.sh` → `acp-bridge.js` (TCP :8080)
- AgentCore mode: `agentcore-entrypoint.sh` → `a2a-adapter.js` (A2A :9000)

### claude-code container (`Dockerfile.claude-code`) — NEW
Much simpler than kiro-cli:
```dockerfile
FROM node:20-slim
# Install claude-code CLI
RUN npm install -g @anthropic-ai/claude-code
WORKDIR /workspace
# No bootstrap script needed — IAM role handles auth
# ECS mode: acp-bridge with claude-agent-acp
# AgentCore mode: a2a-adapter with claude-agent-acp
COPY scripts/acp-bridge.js /home/node/acp-bridge.js
COPY scripts/a2a-adapter.js /home/node/a2a-adapter.js
ENV KIRO_BINARY=claude-agent-acp
CMD ["node", "/home/node/acp-bridge.js"]
```

The bridge and adapter already read `KIRO_BINARY` env var to decide which binary to spawn. So the same scripts work for both agents — just change the env var.

## Auth Matrix

| Agent × Runtime | Auth Method | Bootstrap Needed? |
|----------------|-------------|-------------------|
| kiro-cli + Local | Local sqlite (already logged in) | No |
| kiro-cli + ECS | Token Vault → Secrets Manager → S3 | Yes (bootstrap-auth.sh) |
| kiro-cli + AgentCore | Token Vault REST + workload identity | Yes (agentcore-entrypoint.sh) |
| kiro-cli + CDM | Local sqlite + Midway | No |
| claude-code + Local | IAM role (container) | No |
| claude-code + ECS | IAM task role (bedrock:InvokeModel) | No |
| claude-code + AgentCore | IAM workload identity | No |
| claude-code + Windows | Local AWS creds or API token | No |
| claude-code + CDM | Local AWS creds | No |

Claude Code is dramatically simpler — IAM just works everywhere.

## Remote Runner Protocol (Windows + CDM)

Both Windows and CDM runners use the same reverse-tunnel protocol:

```typescript
// Runner → Orchestrator (registration)
{ type: "runner.register", capabilities: {
  agents: ["claude-code"],           // or ["kiro-cli"] or both
  internal: false,                    // true for CDM with Midway
  platform: "windows",               // or "linux"
  maxSessions: 3
}}

// Orchestrator → Runner (work assignment)
{ type: "session.assign", sessionId, agentId, model, cwd }
{ type: "session.prompt", sessionId, text }
{ type: "session.cancel", sessionId }

// Runner → Orchestrator (events)
{ type: "session.ready", sessionId }
{ type: "session.event", sessionId, event: ServerEvent }
{ type: "session.closed", sessionId, code }
{ type: "runner.heartbeat" }
```

## What Needs Building

### Already done:
- Local runner (kiro-cli, claude-code) — `createAcpRunner`
- ECS runner (kiro-cli) — `createEcsRunner`
- AgentCore runner (kiro-cli) — `createAgentCoreRunner`
- A2A adapter — `scripts/a2a-adapter.js`
- ACP bridge — `scripts/acp-bridge.js`
- Runner manager three-way toggle
- Agent registry with kiro + claude-code definitions

### New work:
1. `Dockerfile.claude-code` — claude-code container image (simple, no bootstrap)
2. `scripts/windows-runner.js` — reverse-tunnel runner for Windows
3. `scripts/cdm-runner.js` — reverse-tunnel runner for CDM (same protocol, different capabilities)
4. `src/server/remote-runner.ts` — WebSocket-based runner that accepts connections from remote runners
5. Runner manager extension — check registered remote runners before cloud runners
6. CDK stack update — add claude-code task definition alongside kiro-cli

### Nice-to-have:
- Agent auto-detection — orchestrator picks the best agent for the task
- Runner pool — multiple CDMs/Windows machines register, orchestrator load-balances
- Agent capability negotiation — "this task needs file system access" → route to runner with filesystem
