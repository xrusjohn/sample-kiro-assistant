# Runtime & Build Dependencies

This project bundles a macOS desktop app via Electron. The DMG produced by `bun run dist:mac` assumes the following environment on the target machine:

## Runtime (for end users)

| Dependency | Why it matters |
| --- | --- |
| **macOS 13 Ventura or newer** (Apple Silicon preferred) | Electron 39 builds here target modern macOS. Intel might work but isn’t tested. |
| **Kiro CLI** installed and on `$PATH` (or `/Applications/kiro-cli`) | Every task shells out to `kiro-cli chat …`. Without the CLI the assistant can’t do anything. |
| `~/.kiro/agents/agent_config.json` | Seeded automatically from our bundled template on first launch (unless `KIRO_SKIP_AGENT_TEMPLATE=1`). It stores MCP definitions, tool lists, etc. You still need to add your own API keys there. |
| `~/.kiro/skills/**` (optional) | Skills the UI surfaces under Settings → Skills. |
| `ffmpeg` (optional) | Some skills/tools expect it present for audio/video work. |

## Build-time (for contributors)

| Dependency | Version/example |
| --- | --- |
| **bun** | Used for scripts (`bun run dev`, `bun run dist:mac`). |
| **Node.js 18+** | Required by toolchains and electron-builder. |
| **Xcode Command Line Tools** | Needed for native modules like `better-sqlite3` during `electron-builder`. |
| **Homebrew (optional)** | Helpful for installing ffmpeg and other CLI utilities. |

## Notes on the DMG

- `bun run dist:mac` outputs two key artifacts:
  - `dist/mac-arm64/Kiro Assistant.app`: the actual app bundle we copy to `/Applications`.
  - `dist/Kiro Assistant-0.0.2-arm64.dmg`: the installer image containing the same `.app` plus DMG metadata.
- The DMG includes `Contents/Resources/agent_config.template.json`. On first run, the app copies it to `~/.kiro/agents/agent_config.json` (credentials remain blank).
- To preserve an existing config while testing local builds, set `launchctl setenv KIRO_SKIP_AGENT_TEMPLATE 1` before launching; unset with `launchctl unsetenv KIRO_SKIP_AGENT_TEMPLATE` when you want automatic provisioning again.
