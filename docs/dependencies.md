# Runtime & Build Dependencies

This project can run as an Electron desktop app (macOS/Windows) or as a web server (any platform). The web server mode is ideal for remote/headless environments like AgentSpaces, CDM, or AL2 instances.

## Runtime (for end users)

| Dependency | Why it matters |
| --- | --- |
| **Kiro CLI** installed and on `$PATH` | Every task shells out to `kiro-cli chat …`. Without the CLI the assistant can't do anything. |
| `~/.kiro/agents/agent_config.json` | Seeded automatically from our bundled template on first launch (unless `KIRO_SKIP_AGENT_TEMPLATE=1`). It stores MCP definitions, tool lists, etc. You still need to add your own API keys there. |
| `~/.kiro/skills/**` (optional) | Skills the UI surfaces under Settings → Skills. |
| `ffmpeg` (optional) | Some skills/tools expect it present for audio/video work. |

---

## Build-time: macOS (Electron desktop app)

| Dependency | Notes |
| --- | --- |
| **Node.js 18+** | Required by toolchains and electron-builder. |
| **npm** or **bun** | Used for scripts (`npm run dev`, `npm run dist:mac`). |
| **Xcode Command Line Tools** | Needed for native modules like `better-sqlite3` during `electron-builder`. |
| **Homebrew (optional)** | Helpful for installing ffmpeg and other CLI utilities. |

### Notes on the DMG

- `npm run dist:mac` outputs two key artifacts:
  - `dist/mac-arm64/Kiro Assistant.app`: the actual app bundle we copy to `/Applications`.
  - `dist/Kiro Assistant-0.0.2-arm64.dmg`: the installer image containing the same `.app` plus DMG metadata.
- The DMG includes `Contents/Resources/agent_config.template.json`. On first run, the app copies it to `~/.kiro/agents/agent_config.json` (credentials remain blank).
- To preserve an existing config while testing local builds, set `launchctl setenv KIRO_SKIP_AGENT_TEMPLATE 1` before launching; unset with `launchctl unsetenv KIRO_SKIP_AGENT_TEMPLATE` when you want automatic provisioning again.

---

## Build-time: AgentSpaces / CDM / AL2 (Web server mode)

This is the recommended setup for headless Linux environments where you run the web server and access the UI from a browser (locally or via port forwarding).

| Dependency | Notes |
| --- | --- |
| **Node.js 18+** | Runtime for the Express server and build toolchain. |
| **npm** | Package manager. All scripts use npm (no bun required). |
| **gcc / make / python3** | Needed to compile native modules like `better-sqlite3`. Usually pre-installed on AL2. |
| **Kiro CLI** | Must be installed and authenticated (`kiro auth login`). |

### Quick start on AL2 / CDM

```bash
# Clone and install
git clone https://github.com/aws-samples/sample-kiro-assistant.git
cd sample-kiro-assistant
npm install

# Build the web UI + server
npm run build:web

# Start the server (default port 3000, override with PORT env var)
PORT=3001 npm run server
```

Then open `http://localhost:3001` in your browser, or use VS Code / Kiro port forwarding if on a remote instance.

### Notes

- No Electron, Xcode, or Homebrew needed — this mode is pure Node.js + Express.
- The `npm run dev` and `npm run dist:*` scripts are for the Electron desktop app and won't work on headless Linux (no display server).
- Use `npm run build:web` + `npm run server` (or `npm run dev:web` for a one-liner).
- Set `PORT` to avoid conflicts if 3000 is already in use.
- See [WEB_SERVER.md](WEB_SERVER.md) for full architecture details and streaming info.
