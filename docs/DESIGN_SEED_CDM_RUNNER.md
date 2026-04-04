# Design Seed: CDM Reverse-Tunnel Runner

## Problem

The ECS orchestrator can dispatch sub-agents to ECS Fargate (public tools) and AgentCore Runtime (managed + Token Vault). But for internal-access tasks (wiki pages, code reviews, internal APIs), the sub-agent needs Midway auth and corp network access. ECS containers don't have either.

The CDM has both — you're logged in with Midway, on the corp network. But the ECS orchestrator can't reach the CDM (it's behind a corporate network boundary). The CDM can reach ECS though (outbound HTTPS).

## Idea: Reverse-Tunnel Runner

Flip the connection direction. Instead of the orchestrator launching a sub-agent on the CDM, the CDM dials out to the orchestrator and registers itself as an available runner.

```
┌─────────────────────┐
│  CDM (corp network)  │
│  - Midway auth ✓     │
│  - Internal access ✓ │
│  - kiro-cli ✓        │
│                      │
│  cdm-runner.js       │
│  (connects outbound) │
└──────────┬──────────┘
           │ WSS outbound (CDM → ECS)
           ▼
┌─────────────────────┐
│  ECS Orchestrator    │
│  (always-on)         │
│                      │
│  Sees CDM runner as  │
│  registered worker   │
│  with capabilities:  │
│  { midway: true,     │
│    internal: true }  │
└─────────────────────┘
```

## How It Works

### CDM Side: `cdm-runner.js`

A small script you run on the CDM (manually or via tmux). It:

1. Opens a WebSocket to the ECS orchestrator (`wss://kiro.xrusjohn.people.aws.dev/ws/runner`)
2. Sends a registration message: `{ type: "runner.register", capabilities: { midway: true, internal: true } }`
3. Waits for work assignments from the orchestrator
4. When assigned a session, spawns kiro-cli locally with stdio pipes
5. Relays ACP JSON-RPC messages between the WebSocket and kiro-cli's stdio
6. Reports session status (idle, running, error) back to the orchestrator
7. If disconnected, attempts to reconnect with exponential backoff

The CDM runner is essentially `relay.ts` in reverse — instead of a human typing prompts, the orchestrator sends them.

### Orchestrator Side: Runner Registry

The orchestrator's RunnerManager gains awareness of remote runners:

```
Runner selection priority:
1. If session needs internal access AND a CDM runner is registered → route to CDM
2. If AGENTCORE_RUNNER_ENABLED → route to AgentCore Runtime
3. If ECS_RUNNER_ENABLED → route to ECS Fargate
4. Else → local process (in-container)
```

The orchestrator tracks registered CDM runners:

```typescript
interface RegisteredRunner {
  id: string;
  ws: WebSocket;
  capabilities: { midway: boolean; internal: boolean };
  activeSessions: Set<string>;
  registeredAt: number;
  lastHeartbeat: number;
}
```

### Session Routing

When a client creates a session, they can tag it:
- `{ internal: false }` → ECS or AgentCore (default)
- `{ internal: true }` → CDM runner (if available), else error

Or the orchestrator auto-detects based on the prompt/tools needed.

### Protocol: WebSocket Relay

The CDM runner and orchestrator communicate over WebSocket with a simple envelope:

```typescript
// Orchestrator → CDM Runner
{ type: "session.assign", sessionId: string, model: string, cwd: string }
{ type: "session.prompt", sessionId: string, text: string }
{ type: "session.cancel", sessionId: string }

// CDM Runner → Orchestrator
{ type: "runner.register", capabilities: { midway: boolean, internal: boolean } }
{ type: "runner.heartbeat" }
{ type: "session.ready", sessionId: string }
{ type: "session.event", sessionId: string, event: ServerEvent }
{ type: "session.closed", sessionId: string, code: number }
```

This maps cleanly to the RunnerHandle interface — `session.assign` → constructor, `session.prompt` → `sendPrompt`, `session.cancel` → `abort`, `session.event` → `onEvent` callback.

## Architecture with All Four Runners

```
┌──────────────┐
│ kiro-remote   │ (Windows/Mac — your machine)
│ or browser    │
└──────┬───────┘
       │ WSS
       ▼
┌──────────────┐
│ CloudFront    │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────┐
│ ECS Orchestrator                          │
│                                           │
│ RunnerManager                             │
│ ├─ Local runner (in-container kiro-cli)   │
│ ├─ ECS runner (Fargate tasks)             │
│ ├─ AgentCore runner (Runtime API)         │
│ └─ CDM runner (reverse WebSocket)  ◄──────┼──── CDM dials in
│                                           │
│ Routes sessions based on:                 │
│ - internal access needed?                 │
│ - CDM runner available?                   │
│ - runner preference config                │
└──────────────────────────────────────────┘
```

## Midway Considerations

The CDM has your Midway cookie because you're logged in. Sub-agents running on the CDM get internal access for free — no cookie injection needed.

Open questions:
- How long does the Midway cookie last? If it expires while you're away, the CDM runner's internal access breaks silently.
- Can we detect Midway expiry and notify the orchestrator? The CDM runner could periodically test an internal URL.
- Could we scp the Midway cookie to ECS containers as a short-term impersonation? Unclear how far that gets us — Midway cookies may be IP-bound or have other restrictions.

## Startup Flow

```bash
# On CDM (manual or in tmux):
node scripts/cdm-runner.js --server wss://kiro.xrusjohn.people.aws.dev

# Output:
# ✓ Connected to orchestrator
# ✓ Registered as CDM runner (midway: true, internal: true)
# Waiting for work assignments...
```

Or automated:
```bash
# In your .bashrc or tmux startup on CDM:
nohup node scripts/cdm-runner.js --server wss://kiro.xrusjohn.people.aws.dev &
```

## Why This Is Interesting

1. No inbound firewall rules needed — CDM connects outbound
2. Midway auth comes for free — no token injection or impersonation
3. Internal tools (wiki, code search, phonetool) just work
4. The orchestrator doesn't care where the runner is — same RunnerHandle interface
5. Graceful degradation — if CDM disconnects, internal sessions suspend, public sessions continue on ECS
6. Could extend to multiple CDMs — different people register their CDMs, orchestrator has a pool of internal-access runners

## Open Questions

- Should the CDM runner support multiple concurrent sessions? (Probably yes, with a configurable limit)
- How do we handle the CDM runner going away mid-session? (Suspend + notify client, same as ECS task failure)
- Should the orchestrator queue internal-access requests if no CDM runner is available? (Probably yes, with a timeout)
- Security: should the CDM runner authenticate to the orchestrator? (Yes — probably a shared secret or the same Cognito auth the web UI uses)
