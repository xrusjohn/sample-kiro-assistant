# Kiro Assistant Web Server — Enhancements / TODO

## Streaming & Display
- [ ] Reduce flicker/delay between streaming and final message render
- [ ] Show a loading/spinner indicator while ACP initializes and MCP servers load
- [ ] Better formatting for tool calls (show params, status, duration)

## Prompt & Input
- [ ] Customizable prompt display — show timestamp, current working directory, session info
- [ ] Interactive vs non-interactive toggle per session (trust-all-tools vs ask-before-running)
- [ ] Per-session settings (model, MCP config) vs global settings

## MCP Servers
- [ ] Hot-reload MCP config mid-session (investigate ACP `session/set_mode` or restart ACP process)
- [ ] Show MCP server initialization status in the UI during session startup
- [ ] Per-session MCP server config — pass mcpServers to session/new instead of relying on agent_config.json
- [ ] Agent self-service MCP config — let the agent add/disable/remove MCP servers via natural language
  - Option A: Expose MCP management as REST API tools the agent can call
  - Option B: System prompt instructing agent to edit agent_config.json directly
  - Option C: Custom ACP extension for MCP management

## ACP Protocol
- [ ] Handle `tool_call` and `tool_call_update` events for richer tool use display
- [ ] Support `session/cancel` properly in the UI stop button
- [ ] Support `session/load` to resume previous ACP sessions
- [ ] Explore passing MCP servers via `session/new` params instead of relying on agent_config.json

## Session Management
- [ ] Persist sessions across server restarts (currently sessions DB works but ACP process is gone)
- [ ] Multi-session support — keep multiple ACP processes alive
- [ ] Session continuation — use ACP `session/load` to resume previous sessions after restart
- [ ] ACP process restart with session resume — for applying config changes (MCP, model) mid-conversation
- [ ] Expose session/load on server restart to reconnect to previous kiro-cli sessions
- [x] Session rename — REST endpoint added (`POST /api/rename-session`), needs UI (double-click or context menu on sidebar)
- [ ] Session export — download conversation as markdown
- [ ] Session search — find sessions by content or title
- [ ] Session pinning/favorites

## UI Polish
- [ ] Add favicon
- [ ] Remove Electron-specific UI elements (traffic light positioning, window drag region)
- [ ] Adapt title bar for browser (show connection status, server info)
- [ ] Mobile-responsive layout

## File Operations
- [ ] File upload via drag-and-drop (not just paperclip button)
- [ ] Server-side file browser for `selectDirectory` (currently returns null)
- [ ] Serve workspace files with proper MIME types for inline preview

## Security
- [ ] Add optional authentication (basic auth or token) for the web server
- [ ] Restrict file serving to workspace directories only
- [ ] HTTPS support (or document reverse proxy setup)

## Developer Experience
- [ ] Hot-reload dev mode (Vite dev server proxying to Express for API/WS)
- [ ] Docker/container packaging for easy deployment
- [ ] Configurable kiro-cli agent name (currently hardcoded `kiro-assistant`)

## Remote Access
- [ ] Investigate reverse tunneling for local MCP servers (Windows → remote VM)
- [ ] Document VS Code port forwarding setup
- [ ] Explore Tailscale/ngrok for direct access without VS Code
