# Relay — The Protocol Bridge for Agents

## One sentence

Relay is a protocol bridge that connects humans, agents, and tools through open standards — translating between AG-UI, Matrix, A2A, ACP, and MCP so every participant speaks its native protocol.

## The problem

The agent ecosystem is fragmenting into incompatible protocols. Frontends speak one language, agents speak another, tools speak a third. Every integration is bespoke. Every new protocol means rewriting glue code. Agents behind firewalls can't talk to agents in the cloud. There's no federation, no standard way for agents across organizations to collaborate.

## The insight

You don't need one protocol to rule them all. You need a bridge that translates between them. Each protocol is good at its layer — let it stay there. The bridge handles the seams.

## The protocol stack

```
┌─────────────────────────────────────────────────┐
│  Humans                                         │
│  Browser, CLI, mobile, Slack, etc.              │
├─────────────────────────────────────────────────┤
│  AG-UI          Agent ↔ Frontend protocol       │
│                 Standardized streaming events    │
│                 for rendering agent responses    │
├─────────────────────────────────────────────────┤
│  Relay          The protocol bridge             │
│                 Routing, health, sessions,       │
│                 translation between all layers   │
├──────────┬──────────┬──────────┬────────────────┤
│  Matrix  │  A2A     │  ACP     │  WS            │
│  Feder-  │  Agent   │  Local   │  Firewall-     │
│  ated    │  to      │  stdio   │  friendly      │
│  rooms   │  agent   │  JSON-   │  outbound      │
│          │  (HTTP)  │  RPC     │  connect       │
├──────────┴──────────┴──────────┴────────────────┤
│  MCP            Agent ↔ Tools protocol          │
│                 Browser, AWS, email, diagrams,   │
│                 code interpreter, etc.           │
├─────────────────────────────────────────────────┤
│  Tools                                          │
│  APIs, databases, file systems, SaaS            │
└─────────────────────────────────────────────────┘
```

## Each protocol, explained

### AG-UI — Agent ↔ Frontend
Open protocol by CopilotKit. Standardizes how agent backends stream responses to user-facing apps. 16 event types: `RUN_STARTED`, `TEXT_MESSAGE_CONTENT`, `TOOL_CALL_START`, `STATE_SNAPSHOT`, etc. Transport-agnostic (SSE, WebSocket, webhooks). Replaces our custom WS event format with an industry standard.

### Matrix — Federated Agent Transport
Open protocol for decentralized communication. Agents join rooms, exchange events, federate across servers. Gives us: multi-agent conversations as rooms, presence as health monitoring, E2E encryption, cross-org federation without a central broker. The intern is deploying Synapse on the relay cluster now.

### A2A — Agent to Agent
Google's protocol for agent-to-agent communication over HTTP. Agent cards describe capabilities. Tasks are sent via POST, responses stream via SSE. We use this for cloud agents on ECS and AgentCore.

### ACP — Agent Communication Protocol
JSON-RPC over stdio. The orchestrator spawns `kiro-cli acp` or `claude-agent-acp` as a child process and talks to it over stdin/stdout. Persistent sessions, streaming updates, tool call notifications. The local-machine protocol.

### WS — WebSocket Remote Agents
Our custom protocol for agents behind firewalls. The agent connects outbound to the orchestrator (firewall-friendly), registers with a profile and tags, receives tasks, streams results back. Heartbeat-monitored, auto-reconnect. The simple option when you don't want to run a Matrix homeserver.

### MCP — Model Context Protocol
Anthropic's protocol for connecting agents to tools. Agents discover and invoke tools through MCP servers. Browser automation, AWS operations, email, diagrams, code execution — all exposed as MCP tools.

## What Relay does

Relay sits in the middle and translates:

1. **Human sends a message** → AG-UI event arrives at Relay
2. **Relay routes to an agent** → picks the best transport:
   - Same machine? → ACP (spawn local process)
   - Cloud agent? → A2A (HTTP POST + SSE)
   - Behind firewall? → WS (push over existing connection)
   - Federated? → Matrix (post to room)
3. **Agent responds** → streaming updates in the agent's native protocol
4. **Relay translates back** → AG-UI events streamed to the frontend
5. **Agent uses tools** → MCP calls happen agent-side, transparent to Relay

The routing layer is protocol-aware: tag-based matching, explicit profile routing, health monitoring with degraded detection, automatic fallback. If a remote agent goes down, Relay falls back to local.

## What exists today

- ✅ ACP transport — kiro-cli and claude-code via JSON-RPC stdio
- ✅ A2A transport — HTTP with SSE streaming to cloud agents
- ✅ WS transport — remote agents behind firewalls, tested end-to-end
- ✅ MCP tools — browser, diagrams, AWS, email, knowledge bases
- ✅ Routing engine — tag matching, profile routing, health probes, fallback
- ✅ Web UI — React, chat bubbles, streaming, session management
- ✅ CLI — relay-cli for terminal access, supervisor mode
- ✅ ECS deployment — orchestrator at relay.xrusjohn.people.aws.dev
- 🔲 AG-UI adoption — replace custom WS events with standard AG-UI events
- 🔲 Matrix transport — federated agent rooms (deployment in progress)

## Design principles

1. **Open protocols over custom ones.** If a standard exists, use it. Only invent when nothing fits.
2. **Bridge, don't replace.** Each protocol is good at its layer. Relay translates at the seams.
3. **Agents are portable.** An agent shouldn't know or care how it's being reached. ACP, A2A, WS, Matrix — same agent, different transport.
4. **Degrade gracefully.** If the preferred transport fails, fall back. Remote → local. Cloud → on-prem. Always have a path.
5. **Minimal orchestrator.** Relay routes and translates. It doesn't think. The intelligence lives in the agents.
