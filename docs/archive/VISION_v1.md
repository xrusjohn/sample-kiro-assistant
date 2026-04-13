# Kiro Assistant — Vision

## What Is It

Kiro Assistant is a general-purpose AI assistant with 500+ capabilities, built as a browser UI over `kiro-cli`. It combines coding assistance with personal productivity workflows — and is designed for everyone, not just developers.

The core idea: give a powerful model the right tools and trust it to figure things out. Skills and MCPs are the extension points. The system loads them dynamically based on context.

## Why It Exists

- **Amazon Q / Quick** serves all Amazonians for general productivity (email, calendar, HR)
- **Kiro CLI** provides powerful AI-assisted development in the terminal
- **Kiro Assistant** bridges the gap — a conversational UI with full system access, for people who need to context-switch between code, comms, and artifacts seamlessly

## The Killer Workflow

"Read an email, write some code, create a diagram, email the diagram" — a multi-step, cross-domain task that currently requires bouncing between 5 different apps. Kiro Assistant orchestrates it from one place.

## Audience

- **Primary (now):** Individual SA or builder working in CDM or AgentSpaces — fully empowered with filesystem, CLI, AWS, and internal tool access
- **Next:** Other SAs and technical builders on the team
- **Future:** Non-technical team members, every profession — via AgentSpaces with curated capabilities and shared context

The vision is that Kiro Assistant is useful to every member of the family and every profession. Sales, Marketing, HR, Legal, FSI, Telco — as long as you have the right tools (MCPs) and skills, it can help.

## Kiro Powers

**Kiro Powers** are bundles of skills + tools tailored to a specific domain or profession. A Power might include:
- A set of `.md` skill files that teach the agent how to do domain-specific tasks
- A curated set of MCP servers that give it access to the right tools

Powers are shareable. The goal is a hub ([kirohub.dev](https://kirohub.dev/)) where teams and individuals can publish and consume Powers — similar to how VS Code extensions work.

Organizations can define Powers and share them across teams.

## Architecture Philosophy

- **Give the model tools and trust it** — inspired by the "bitter lesson." Powerful models + right tools > elaborate orchestration logic.
- **Curated core skills** — a set of well-built capabilities that cover the 80% use case
- **Plugin-friendly** — power users can add their own tools and data sources (MCP servers, custom integrations)
- **Give back** — tools that work well here get shared back to QuickSuite; don't rebuild what already works there
- **Backend access** — we have more direct access to systems than Q/Quick, which is our advantage

## Current Capabilities

- Conversational AI (Claude via kiro-cli)
- Full filesystem access (read, write, navigate)
- Shell command execution
- AWS CLI integration
- Internal website reading (code.amazon.com, phonetool, wikis, SIMs, etc.)
- Internal search (ISK)
- Code search (internal repos)
- AWS documentation search
- 500+ SaaS integrations via Composio (ElevenLabs, HeyGen, Gmail, X, etc.)
- Browser automation via Playwright
- Excel, PDF, image manipulation
- Architecture diagram generation
- Email and calendar via Outlook MCP
- File routing (send-to: email, Quip, S3, clipboard, other sessions)
- Multi-runner deployment (local, ECS Fargate, AWS Bedrock AgentCore)

## Deployment Modes

| Mode | Where It Runs | Best For |
|------|--------------|---------|
| Electron desktop | macOS / Windows | Local development, personal use |
| Web server (CDM/AgentSpaces) | Remote Linux VM | SA daily workflow, team access |
| ECS Fargate | AWS cloud | Always-on, multi-user, no SSH tunnels |
| AgentCore | AWS Bedrock | Serverless, managed infra, Token Vault auth |

## Roadmap Themes

- **Voice interface** — Nova Sonic integration via ACP Gateway
- **ACP Gateway** — REST/SSE endpoint so any HTTP client can talk to kiro-cli
- **Artifact Bus** — S3-based file handles for efficient tool chaining
- **Multi-agent orchestration** — dispatch to specialized sub-agents in parallel
- **CDM reverse-tunnel** — CDM dials out to ECS orchestrator for internal-access sessions
- **Kiro Powers Hub** — publish and consume domain-specific skill+tool bundles

---

*Started: 2025-03-28 — conversation between xrusjohn and Kiro Assistant*
*Updated: 2026-04-06 — reflects current state and expanded vision*
