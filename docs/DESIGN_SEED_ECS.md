# Design Seed: ECS Session Manager

## Problem

The current architecture runs the web server and kiro-cli ACP processes on a CDM, accessed via SSH tunnel + port forwarding. This has reliability issues:
- SSH tunnels drop hourly (axe connect --tunnel limit)
- Midway re-auth interrupts the connection
- Port forwarding through VS Code/Kiro IDE is flaky across reconnects
- The browser loses its WebSocket and has to reconnect

## Idea

Move the web server to ECS. Run ACP processes in two tiers based on what they need access to.

```
Browser ──HTTPS──► ECS (web server + session manager)
                      │
                      ├── ECS-local ACP processes (no corp network needed)
                      │     └── general coding, AWS, web search, public repos
                      │
                      └── CDM-bridged ACP processes (corp network needed)
                            └── Outlook, code.amazon.com, phonetool, internal wikis
                            └── connected via SSH to CDM, Midway cookie for auth
```

## Two-Tier Session Model

### Tier 1: ECS-Local Sessions
- kiro-cli runs directly on ECS container
- No CDM dependency, no tunnel, no Midway issues
- Tools: filesystem, shell, AWS CLI, web search, web fetch, knowledge bases
- MCPs: playwright, excel, any public MCP
- Fast, always available

### Tier 2: CDM-Bridged Sessions
- kiro-cli runs on CDM, stdin/stdout piped over SSH from ECS
- OR: kiro-cli runs on ECS but uses CDM as a tool execution backend
- Needed for: Outlook MCP, builder MCP, internal search, code.amazon.com, phonetool
- Requires: SSH connection to CDM + valid Midway cookie
- Cookie management: SCP from user's machine, or MCS Session Forwarding from ECS

## Smart Routing

The session manager could auto-detect which tier is needed:
- User requests email → CDM-bridged
- User requests general coding → ECS-local
- Session starts ECS-local, escalates to CDM-bridged if internal tools are invoked
- Could also be explicit: user picks "internal" vs "public" session type

## Benefits
- Browser connects to ECS over HTTPS — stable, no port forwarding
- ECS is always-on — no tmux, proper container lifecycle
- ECS-local sessions have zero CDM dependency
- Could serve multiple users (team deployment)
- CDM becomes optional compute backend, not the whole stack

## Open Questions
- How to manage Midway cookie lifecycle for CDM-bridged sessions?
- Can MCS Session Forwarding work from ECS → CDM?
- Should CDM-bridged sessions run kiro-cli on CDM or on ECS with remote tool execution?
- ECS task sizing — how much memory/CPU per ACP process?
- Auth for the web UI itself (ALB + Midway? Cognito?)
- Cost model — ECS Fargate per-session vs shared container

## Related
- Roadmap item #5: "24*7 running agents in the cloud"
- Multi-session spec (.kiro/specs/multi-session/) — RunnerManager would need a "remote runner" variant

---

*Seed planted: 2026-03-29*
