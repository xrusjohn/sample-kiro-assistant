# Design Seed: ACP Gateway — Kiro as a Network Service

## Problem

kiro-cli is powerful but trapped on Linux, accessed only via stdio. We want:
- Windows browser → kiro-cli (today: SSH tunnel + web UI, works but fragile)
- Nova Sonic (voice) → kiro-cli (not possible today)
- Any HTTP client → kiro-cli (not possible today)
- Sub-agent calls → kiro-cli (not possible today)

We don't want: MCP wrapping ACP wrapping Strands wrapping HTTP. One protocol
translation, not three.

## Insight

We already built the hard part. `runner.ts` spawns kiro-cli, pipes ACP over
stdio, and exposes it via WebSocket. The web UI is just a thin client on top.

The missing piece: a REST/SSE endpoint that any caller can use — browser,
Sonic, Strands, curl, another agent.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Clients (any network, any OS)                          │
│                                                         │
│  Browser Chat ──┐                                       │
│  Nova Sonic ────┤── HTTP/SSE or WebSocket ──┐           │
│  Strands agent ─┤                           │           │
│  curl / API ────┘                           │           │
└─────────────────────────────────────────────┼───────────┘
                                              │
┌─────────────────────────────────────────────┼───────────┐
│  ACP Gateway (Linux — CDM, AgentSpaces, ECS)│           │
│                                              │           │
│  ┌───────────────────────────────────────────▼────────┐ │
│  │  Express server (port 3001)                        │ │
│  │                                                    │ │
│  │  POST /api/agent/prompt     ← new REST endpoint    │ │
│  │  GET  /api/agent/sessions   ← session management   │ │
│  │  WS   /ws                   ← existing WebSocket   │ │
│  │                                                    │ │
│  │  Auth: Cognito JWT (existing) or API key           │ │
│  └────────────────────┬───────────────────────────────┘ │
│                       │ stdio (ACP JSON-RPC)            │
│  ┌────────────────────▼───────────────────────────────┐ │
│  │  kiro-cli acp --agent kiro-assistant               │ │
│  │                                                    │ │
│  │  MCP servers:                                      │
│  │    diagram-renderer (graphviz, Pillow)             │
│  │    kiro-gateway (AgentCore proxy)                  │
│  │    composio (500+ SaaS tools)                      │
│  │    playwright (browser automation)                 │
│  │                                                    │ │
│  │  Skills: architecture-diagrams, remotion, etc.     │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## The New Endpoint

```
POST /api/agent/prompt
Authorization: Bearer <cognito-jwt or api-key>
Content-Type: application/json

{
  "sessionId": "optional — reuse existing session for context continuity",
  "message": "render a diagram of our AgentCore gateway",
  "images": ["base64..."],          // optional image attachments
  "stream": true                    // SSE stream vs wait-for-completion
}
```

### Streaming response (SSE):

```
event: chunk
data: {"type": "AgentMessageChunk", "text": "Let me create that diagram..."}

event: tool
data: {"type": "ToolCall", "name": "render_diagram", "status": "running"}

event: tool
data: {"type": "ToolCall", "name": "render_diagram", "status": "completed"}

event: chunk
data: {"type": "AgentMessageChunk", "text": "Here's your diagram..."}

event: done
data: {"type": "TurnEnd", "sessionId": "abc-123"}
```

### Non-streaming response:

```json
{
  "sessionId": "abc-123",
  "response": "Here's your diagram...",
  "artifacts": [
    {"name": "agentcore-gateway.png", "path": "/workspace/agentcore-gateway.png", "sizeKB": 61.5}
  ],
  "creditsUsed": 0.15,
  "durationMs": 8200
}
```

## Nova Sonic Integration

Sonic is a Strands agent with one tool:

```python
@tool
def ask_kiro(message: str) -> str:
    """Ask the Kiro assistant. It can render architecture diagrams,
    read/write files, query AWS, manage emails, use 500+ SaaS tools,
    and more. Use for any task that requires tools or file access."""
    resp = requests.post(
        f"{ACP_GATEWAY_URL}/api/agent/prompt",
        headers={"Authorization": f"Bearer {get_token()}"},
        json={"message": message, "sessionId": PERSISTENT_SESSION},
        stream=True,
    )
    # Collect SSE events, return final text
    result = ""
    for line in resp.iter_lines():
        if line.startswith(b"data: "):
            event = json.loads(line[6:])
            if event["type"] == "AgentMessageChunk":
                result += event.get("text", "")
    return result
```

Conversation flow:
```
User (voice): "Hey, draw me our gateway architecture"
Sonic: "Let me have Kiro create that for you."
Sonic → ask_kiro("render a diagram of our AgentCore gateway with Midway auth")
  → ACP Gateway → kiro-cli → reads skill → generates code → render_diagram
  → PNG saved, thumbnail returned
Sonic: "Done! I've saved the diagram to your workspace. It shows the auth
        flow from Midway through Cognito to the AgentCore gateway with
        your joke-teller and whoami Lambda targets."
```

## Session Management

Sessions are the key to making this stateful:

| Pattern | Session Strategy |
|---------|-----------------|
| Browser chat | One session per tab (existing) |
| Sonic voice | One persistent session per user — context carries across turns |
| API / automation | Caller manages session IDs, can create or reuse |
| Sub-agent | Parent passes session ID, child inherits context |

ACP already persists sessions to `~/.kiro/sessions/cli/`. The gateway just
needs to map external session IDs to ACP session IDs.

```
GET  /api/agent/sessions              → list active sessions
POST /api/agent/sessions              → create new session, return ID
GET  /api/agent/sessions/:id          → session metadata + history
DEL  /api/agent/sessions/:id          → terminate session
```

## Auth Options

| Client | Auth Method |
|--------|-------------|
| Browser (existing) | Cognito JWT via Midway (existing flow) |
| Sonic (server-side) | API key or IAM SigV4 |
| Strands (server-side) | API key or IAM SigV4 |
| curl / dev | API key |

API key is simplest for server-to-server. Store in Secrets Manager,
pass as `X-API-Key` header. Gateway validates before proxying to ACP.

## Where It Runs

| Environment | Graphviz | CDK | Midway | Status |
|-------------|----------|-----|--------|--------|
| CDM (today) | ✅ | ✅ | ✅ | Working |
| AgentSpaces + custom image | ✅ | ✅ | ✅ | Blocked on custom images |
| ECS Fargate + Dockerfile | ✅ | via CodeBuild | needs auth proxy | Buildable now |
| EC2 | ✅ | ✅ | ✅ | Overkill |

### Dockerfile sketch (for ECS or AgentSpaces custom image):

```dockerfile
FROM public.ecr.aws/amazonlinux/amazonlinux:2023
RUN yum install -y graphviz python3 python3-pip nodejs
RUN pip3 install diagrams Pillow
# Install kiro-cli (when available as standalone binary)
COPY scripts/ /app/scripts/
COPY dist-server/ /app/dist-server/
COPY dist-react/ /app/dist-react/
EXPOSE 3001
CMD ["node", "/app/dist-server/server/index.js"]
```

## What Changes in Our Codebase

Minimal. The WebSocket path already does everything. We add:

1. `POST /api/agent/prompt` — REST endpoint that creates/reuses a session,
   sends `session/prompt` via ACP, streams events back as SSE
2. `GET/POST/DEL /api/agent/sessions` — session CRUD
3. API key auth middleware (optional, alongside existing Cognito JWT)

The browser UI continues using WebSocket. Sonic/Strands use the REST endpoint.
Same ACP process underneath.

## What This Unlocks

- **Voice**: "Hey Sonic, draw me a diagram" → Kiro renders it
- **Windows**: Browser-only, no Linux dependencies on client
- **Automation**: CI/CD calls the API to generate diagrams, run checks
- **Multi-agent**: Strands orchestrator delegates to Kiro for tool-heavy work
- **Decoupled**: Swap kiro-cli for any ACP-compliant agent later

## Implementation Order

1. Add `POST /api/agent/prompt` with SSE streaming (reuse runner.ts logic)
2. Add session management endpoints
3. Test with curl
4. Write the Sonic `ask_kiro` tool
5. Test voice → diagram flow end to end
6. Add API key auth
7. Dockerfile for portable deployment

---

*Seed planted: 2025-07-27*
