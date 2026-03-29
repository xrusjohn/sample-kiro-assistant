# Kiro Assistant — Vision

## What Is It

Kiro Assistant is a builder-first personal assistant that runs as a browser UI over kiro-cli. It combines coding assistance with personal productivity workflows, purpose-built for Solutions Architects and builders who live in a terminal on a Cloud Desktop or AgentSpaces.

## Why It Exists

- **Amazon Q / Quick** serves all Amazonians for general productivity (email, calendar, HR)
- **Kiro CLI** provides powerful AI-assisted development in the terminal
- **Kiro Assistant** bridges the gap — a conversational UI with full system access, for people who need to context-switch between code, comms, and artifacts seamlessly

## The Killer Workflow

"Read an email, write some code, create a diagram, email the diagram" — a multi-step, cross-domain task that currently requires bouncing between 5 different apps. Kiro Assistant orchestrates it from one place.

## Audience

- **Primary (now):** Individual SA working in CDM or AgentSpaces — fully empowered with filesystem, CLI, AWS, and internal tool access
- **Next:** Other SAs and technical builders on the team
- **Future:** Non-technical team members via AgentSpaces (curated capabilities, shared context)

## Architecture Philosophy

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
- Knowledge base indexing and search

## Gaps & Opportunities

_To be filled in as we discuss — what's missing, what's limited, what would make the biggest difference for a single SA's daily workflow._

---

*Started: 2025-03-28 — conversation between xrusjohn and Kiro Assistant (yes, the assistant helped write its own vision doc)*
