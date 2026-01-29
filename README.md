# Agent Cowork (Open Claude Cowork)

Agent Cowork is a desktop shell around **Kiro CLI** that turns Anthropic-compatible coding agents into a rich UX with session management, command history, and inline file viewing. It is built for engineers who want the raw power of Kiro’s terminal workflow with the ergonomics of a native macOS app.

- 🚀 **Native Electron desktop app** with React/Tailwind UI
- 🧠 **Powered by `kiro-cli`** for conversations while still honoring existing `~/.kiro` assets (MCP config, skills, env settings)
- 🧩 **Full MCP support (stdio + HTTP)** via the Settings dialog—no manual JSON edits required
- 📂 **Workspace aware**: every session runs against the working directory you select, with file viewers, upload support, and activity tracking

> The project still ships under the “Open Claude Cowork” name in the UI, but we refer to it as Agent Cowork inside the repo.

---

## Model & Provider Compatibility

Agent Cowork inherits the compatibility surface of **Kiro CLI** (which itself speaks the Anthropic-compatible protocol):

- **Claude on Amazon Bedrock** – configure Kiro for Bedrock’s Anthropic Runtime endpoint and authenticate with AWS credentials; Cowork will automatically tap into the same settings.
- **Anthropic public API** – use your Anthropic API key directly.
- **Any provider that implements the Anthropic-compatible surface**, including:
  - Kimi K2
  - MiniMax M2
  - DeepSeek 3.2
  - GLM 4.7

If the provider works in Kiro CLI (same payloads/endpoints), it works in Agent Cowork. Configure the endpoint and credentials once in `~/.claude/settings.json`; both Kiro and Cowork will respect it.

---

## Architecture Overview

| Layer | Responsibilities | Key Files |
| ----- | ---------------- | --------- |
| **Electron Main** | Boots the BrowserWindow, exposes IPC APIs (`read-file`, `run-kiro-command`, MCP helpers), spawns `kiro-cli chat`, and copies uploads into the workspace. | `src/electron/main.ts`, `src/electron/libs/runner.ts`, `src/electron/libs/mcp-config.ts` |
| **React Renderer** | Zustand store + UI components (sessions, prompt bar, MCP settings, file sidebar, file upload, slash commands). | `src/ui/*` |
| **Kiro CLI runtime** | The actual agent runtime that talks to Anthropic-compatible APIs, executes tools, runs MCP servers, and writes conversation history to its SQLite store. | `/Applications/Kiro CLI.app` or `kiro-cli` on PATH |
| **Claude Agent SDK (helper)** | Only used for `generateSessionTitle()` to keep the automatic title suggestion feature. | `src/electron/libs/util.ts` |
| **Persistence** | Cowork metadata/history via better-sqlite3; conversation bodies live in Kiro’s own DB. | `src/electron/libs/session-store.ts`, `~/Library/Application Support/kiro-cli/data.sqlite3` |

More detail (including mermaid diagrams and security notes) lives in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Key Capabilities

- **Session management** – start/resume/delete sessions per working directory with automatic title suggestions.
- **Conversation playback** – view Kiro’s reasoning, tool invocations, and status badges inline.
- **File insights** – FileSidebar previews text/code, renders PDFs, images, spreadsheets, and tracks accessed/created files independently.
- **Uploads** – drop extra files into the selected workspace via the paperclip icon; Cowork copies them into the directory so Kiro can read/edit them.
- **MCP integration** – stdio and HTTP servers can be configured entirely from the Settings modal (see below).
- **Slash & Kiro commands** – `/context`, `/compact`, `/mcp`, etc. run through the same CLI session for parity with the terminal experience.

---

## Installing & Running

### Prerequisites

1. **Kiro CLI** installed and authenticated for your provider (Anthropic, Bedrock, Kimi, etc.). Cowork shells out to `kiro-cli chat ...` for every prompt.
2. **Claude CLI (optional but recommended)** if you want the Settings modal helpers that still execute `claude mcp ...` or `/skills`.
3. **Bun (preferred) or Node.js 18+** for building.
4. macOS 13+ (Windows/Linux build targets exist but the shipping app currently focuses on macOS).

> Each session gets its own isolated workspace under `~/Documents/workspace-kiro-cowork/<task-id>`. The app manages those folders automatically; use the Upload button to bring files into the task’s workspace instead of manually pointing Coworker at arbitrary directories.

### Steps

```bash
# Clone
git clone https://github.com/DevAgentForge/Claude-Cowork.git
cd Claude-Cowork

# Install dependencies
bun install

# Development mode
bun run dev            # launches Vite + Electron with hot reload

# Production build (macOS arm64)
bun run dist:mac
```

The macOS bundle is emitted to `dist/mac-arm64/Agent Cowork.app`. Copy it into `/Applications` (back up any previous version first).

> Cowork launches `kiro-cli chat --model claude-sonnet-4.5 --agent kiro-coworker` by default. Override with `KIRO_DEFAULT_MODEL` or `KIRO_AGENT` before starting the app if you need different defaults.

---

## MCP Integration & Settings Workflow

Agent Cowork now mirrors the configuration that Kiro CLI stores in `~/.kiro/agents/agent_config.json`. The Settings modal is a read-only dashboard with enable/disable toggles—any structural changes still happen via Kiro CLI or by editing the JSON file yourself.

1. **Open Settings.** The “Kiro MCP Servers” panel lists every entry from `~/.kiro/agents/agent_config.json`.
2. **Toggle availability.** Each server exposes a switch that flips the `disabled` flag inside the JSON file, letting you quickly enable or disable HTTP or stdio MCPs without touching the CLI.
3. **Edit via CLI when needed.** When you need to add/remove servers or change their commands, continue using `kiro-cli`/`claude mcp …` and then hit Refresh in the modal to pick up the changes.

The same modal also lists the directories found in `~/.kiro/skills/` so you can jump straight to each skill folder from Cowork. No SKILL.md parsing is required—each directory is treated as a skill.

---

## Working With Files

- **Accessed vs Created Lists** – the FileBar tracks accessed files separately from created files, preventing duplicates between the sections.
- **Inline Preview** – clicking supported extensions opens the file in the sidebar; unsupported ones open via the OS (using `shell.openExternal`).
- **Uploads** – use the paperclip icon beside the prompt. Selected files are copied into the CWD (with collision-safe renaming). Kiro can then use Bash or other tools to inspect them.

---

## Security & Permissions

- Tool calls that would affect your system (Bash, file edits, MCP actions) appear as cards where you can approve or deny.
- The working directory boundary is respected: Kiro CLI runs inside the directory you select, mirroring the CLI experience.
- External links clicked inside chat always open in your default browser via `shell.openExternal`, keeping the app sandboxed.

Refer to the “Security considerations” section in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for a deeper discussion, including current limitations (no kernel-level sandboxing, relies on Kiro CLI permissions, etc.).

---

## Troubleshooting Tips

- **Kiro CLI missing** – make sure `kiro-cli` is installed (set `KIRO_CLI_PATH`, keep `/Applications/Kiro CLI.app`, or add it to your PATH). Cowork cannot start sessions without it.
- **Claude CLI missing** – only impacts the MCP/skills helpers. Install `claude` if you want to run `claude mcp ...` or `/skills` from the Settings modal.
- **MCP servers not visible** – open `~/.kiro/agents/agent_config.json` and confirm the entry exists and isn’t marked `disabled: true`, then press Refresh in Settings.
- **HTTP MCP shows “Unknown command”** – update to the current build; the Settings UI now persists `type: "http"` servers exactly as written.
- **Slash commands do nothing** – ensure you start a session first; slash commands are routed to the active Kiro CLI session.

---

## Contributing

1. Fork the repository and branch from `main`.
2. Run `bun run dev` for iterative changes.
3. Add/adjust docs (`docs/ARCHITECTURE.md`, this `README`) when touching architecture or user-facing behavior.
4. Open a PR (GitHub) or MR (GitLab mirror) with a clear summary of the changes and testing steps.

If you build something neat—new MCP templates, better HTTP tooling, alternative providers—please share!

---

Made with ❤️ to bring Kiro CLI’s power to every desktop. Whether you’re on Anthropic’s Bedrock runtime, Kimi’s endpoints, MiniMax’s coding plan, DeepSeek 3.2, GLM 4.7, or the classic Anthropic API, Agent Cowork gives you the same workflows with a friendlier face. Happy hacking!
