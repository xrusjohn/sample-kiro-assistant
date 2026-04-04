# Why AgentCore?

A case for building our multi-agent orchestration platform on Amazon Bedrock AgentCore instead of raw ECS + custom glue.

---

## The Problem

We're building a system where an orchestrator dispatches tasks to ephemeral kiro-cli sub-agents. Today we're running on ECS Fargate, which works — but we're also building a lot of infrastructure ourselves: container lifecycle management, credential injection, session routing, and we have zero observability, no evaluation framework, and no policy controls. Every new capability means more custom code.

AgentCore is a purpose-built platform for exactly this pattern. Here's what each pillar gives us and what we'd have to build ourselves without it.

---

## Pillar 1: Runtime — Stop Managing Containers

**What we have today:** ECS Fargate tasks with custom `RunnerManager` code that calls `ecs:RunTask`, polls for task readiness, manages TCP connections, handles container lifecycle, and cleans up on failure. About 500 lines of orchestration code in `ecs-runner.ts` plus CDK for task definitions, security groups, ALB, and auto-scaling.

**What AgentCore Runtime gives us:**
- Serverless agent deployment — deploy with `agentcore deploy`, no task definitions or cluster config
- Built-in health checks (`/ping` with `Healthy` / `HealthyBusy` status)
- WebSocket support with SigV4 and OAuth authentication out of the box
- Presigned URLs for frontend clients to connect directly (no proxy needed)
- Container lifecycle managed by the platform — no polling for readiness
- A2A protocol support for future multi-agent discovery and communication

**What we'd build ourselves without it:** Everything we already have, plus auto-scaling logic, health check infrastructure, WebSocket auth, and eventually A2A discovery. That's weeks of infra work that doesn't differentiate our product.

**POC value:** Replace `ecs-runner.ts` with `agentcore-runner.ts`. The orchestrator calls Runtime's invocation API instead of `ecs:RunTask`. Sub-agents become AgentCore-managed agents instead of raw Fargate tasks.

---

## Pillar 2: Memory — Externalize State, Enable Cross-Agent Knowledge

**What we have today:** kiro-cli stores everything in a local SQLite database (`~/.local/share/kiro-cli/data.sqlite3`). Conversations, history, auth — all in one file. This works on a desktop but breaks in ephemeral containers. We've been working around it by treating containers as stateless and injecting auth at startup, but we have no way for sub-agents to share knowledge or for the orchestrator to persist learned context across sessions.

**What AgentCore Memory gives us:**
- Managed memory store decoupled from any container's lifecycle
- Short-term memory (events) — store conversation turns, retrieve recent context
- Long-term memory with extraction strategies:
  - Semantic memory — extract and retrieve facts by meaning
  - Summary memory — auto-summarize conversation threads
  - User preference memory — track user preferences across sessions
  - Episodic memory — remember sequences of events with reflections
  - Custom strategies — define your own extraction logic with custom prompts
- Namespace-based organization (`{actorId}/{sessionId}/`) for multi-tenant isolation
- Semantic search across memories (`retrieve_memory_records`)
- Conversation branching — fork conversations, explore alternatives
- `process_turn_with_llm` — a single call that retrieves context, calls your LLM, and saves the result

**What we'd build ourselves without it:** A custom memory service (probably DynamoDB + OpenSearch for semantic search), embedding pipeline, extraction logic, namespace management, and an API layer. That's a significant project on its own.

**The real win:** The orchestrator becomes the memory manager. Before dispatching to a sub-agent, it pulls relevant memories and injects them into the prompt. After the sub-agent returns, it decides what's worth remembering and writes it back. Sub-agents stay completely stateless — they don't even know the memory layer exists. This is the architecture we've been designing toward, and AgentCore Memory is the managed implementation of it.

---

## Pillar 3: Identity — Solve the Auth Bootstrap Problem

**What we have today:** A manual process. Login to kiro-cli interactively via device flow, extract the OIDC tokens from SQLite, store them in Secrets Manager, and inject them at container startup via an entrypoint script. The tokens last 90 days, then we repeat. For internal access (Midway), we'd need to copy cookies around. It works but it's fragile and doesn't scale.

**What AgentCore Identity gives us:**
- Workload identities — each agent gets its own identity, no shared credentials
- Token vault — store and retrieve OAuth tokens centrally
- OAuth2 credential providers — register external OAuth providers, get tokens programmatically
- API key credential providers — manage API keys for external services
- M2M and user federation auth flows — agents can authenticate as themselves or on behalf of users
- `@requires_access_token` decorator — automatic token injection into agent tool calls
- `get_workload_access_token` — agents prove their identity to access resources

**What we'd build ourselves without it:** The Secrets Manager approach we have now, plus a token refresh Lambda, plus per-agent IAM roles, plus a custom credential injection system. And we'd still have no concept of "agent identity" — just shared secrets.

**The identity story for our architecture:**
- Orchestrator gets a workload identity token from AgentCore
- Uses it to authenticate when invoking sub-agents via Runtime
- Sub-agents inherit identity context from the Runtime
- External tool access (APIs, OAuth services) goes through Identity's credential providers
- No more SQLite auth files, no more Secrets Manager scripts, no more 90-day manual rotation

---

## Pillar 4: Observability — See What Your Agents Are Doing

**What we have today:** Console logs. That's it. When a sub-agent fails or produces a bad response, we have no structured way to trace what happened, how long each step took, which tools were called, or what the token costs were.

**What AgentCore Observability gives us:**
- OpenTelemetry-based tracing — automatic span creation for agent invocations
- CloudWatch integration — traces, metrics, and logs in one place
- Third-party integrations — Dynatrace, Elastic, Weights & Biases, Arize AI
- Per-invocation attributes — `agentcore.invocation.user_prompt` and `agentcore.invocation.agent_response` automatically captured
- Framework-agnostic — works regardless of which agent SDK you use
- Cost and latency analytics out of the box

**What we'd build ourselves without it:** Custom OpenTelemetry instrumentation, a tracing backend, dashboards, and alerting. Probably a month of work to get something basic, and it still wouldn't have the agent-specific semantics (tool call tracing, token usage, etc.).

**Why this matters now:** We're about to run multiple ephemeral sub-agents in parallel. Without observability, debugging a failed multi-agent workflow means grepping through container logs across multiple Fargate tasks. With AgentCore Observability, we get a single trace that shows the orchestrator's dispatch, each sub-agent's execution, tool calls, and the final response — all correlated.

---

## Pillar 5: Evaluations & Policies — Quality Gates We Don't Have

**What we have today:** Nothing. No way to evaluate whether a sub-agent's response was good, no way to enforce policies on what agents can do, no way to measure quality over time.

**What AgentCore Evaluations gives us:**
- Managed evaluation service for assessing agent performance
- Multiple quality dimensions — accuracy, relevance, safety
- Development lifecycle integration — evaluate during dev, staging, and production
- Automated quality measurement across agent versions

**What AgentCore Policies gives us:**
- Policy controls for agent behavior
- Guardrails integration — content filtering, topic restrictions
- Deployment gates — prevent deploying agents that don't meet quality thresholds

**What we'd build ourselves without it:** A custom evaluation pipeline (probably involving a judge LLM, test datasets, and a scoring system), plus manual review processes. Policies would be ad-hoc prompt engineering with no enforcement mechanism.

**Why this matters for our use case:** We're building an orchestrator that dispatches to sub-agents autonomously. The user trusts the orchestrator to pick the right agent and produce good results. Without evaluations, we can't measure if that trust is warranted. Without policies, we can't enforce boundaries on what sub-agents do. These are table stakes for production multi-agent systems.

---

## Pillar 6: Built-in Tools — Code Interpreter & Browser

**What we have today:** Sub-agents use kiro-cli's built-in tools (file read/write, shell, web search). For code execution, they run commands in the container. For web browsing, they use web_fetch.

**What AgentCore gives us:**
- Code Interpreter — isolated Firecracker microVM sandboxes for running Python/JS/TS code safely. Supports file upload/download, package installation, persistent execution context within a session.
- Browser Tool — cloud-based browser sessions in Firecracker microVMs. Full Playwright-style interaction (navigate, click, type, screenshot, evaluate JS). Accessibility tree snapshots for structured page understanding.

**Why this matters:** Our sub-agents currently execute code directly in their container. That's a security risk — a malicious prompt could compromise the container. AgentCore's Code Interpreter runs code in an isolated sandbox. Similarly, the Browser tool gives agents real web interaction capabilities beyond simple HTTP fetches, which is useful for internal tools that require JavaScript rendering.

---

## The Compound Effect

Any single pillar is useful. The real value is using them together:

1. **Runtime** manages the sub-agent lifecycle — no ECS task definitions, no polling
2. **Identity** authenticates the sub-agent and provides access to external tools — no SQLite auth files
3. **Memory** gives the orchestrator persistent context — no per-container state
4. **Observability** traces the entire workflow — no log grepping across containers
5. **Evaluations** measure quality — no guessing if the system is working well
6. **Policies** enforce boundaries — no hoping the prompt engineering holds

Without AgentCore, we build each of these ourselves. With AgentCore, we get a coherent platform where these capabilities are integrated and managed.

---

## Migration Path

We don't have to adopt everything at once. The pillars are independent:

| Phase | Pillar | What Changes | Risk |
|-------|--------|-------------|------|
| 1 (POC) | Runtime | Replace `ecs-runner.ts` with `agentcore-runner.ts` | Low — fallback to ECS via env toggle |
| 1 (POC) | Identity | Token Vault for kiro-cli auth instead of Secrets Manager | Low — fallback to existing bootstrap |
| 2 | Memory | Orchestrator uses Memory API for context injection | Medium — new integration point |
| 2 | Observability | Enable tracing on Runtime agents | Low — mostly configuration |
| 3 | Evaluations | Add quality gates for sub-agent responses | Low — additive, no breaking changes |
| 3 | Policies | Enforce content/behavior policies | Low — additive |
| Future | Browser/Code Interpreter | Replace in-container code execution with sandboxed tools | Medium — changes tool availability |

Each phase can be rolled back independently. The dual-mode container image (ECS + AgentCore) ensures we always have a fallback.

---

## What We Lose

Being honest about tradeoffs:

- **Vendor lock-in** — AgentCore is AWS-specific. If we ever need to run on GCP/Azure, we'd need to abstract the platform layer. (Mitigated: the orchestrator code is ours, only the runner implementation changes.)
- **Black box scaling** — AgentCore Runtime manages scaling. We lose fine-grained control over container placement, instance types, and scaling policies. (Mitigated: for our use case, we want the platform to handle this.)
- **New API surface** — More AWS APIs to learn, more SDK versions to track, more potential breaking changes. (Mitigated: the AgentCore SDK is well-documented and the API is stable.)
- **Cost model** — AgentCore pricing vs. raw Fargate pricing. Need to benchmark. (Mitigated: the operational cost savings from not maintaining custom infra likely offset any premium.)

---

## Bottom Line

We're building a multi-agent orchestration system. AgentCore is a platform designed for exactly that. Every pillar addresses a real gap in our current architecture — not a hypothetical future need, but something we're actively working around today (auth injection scripts, stateless containers with no memory, zero observability, no quality measurement).

The question isn't "should we use AgentCore" — it's "how much custom infrastructure do we want to maintain instead."
