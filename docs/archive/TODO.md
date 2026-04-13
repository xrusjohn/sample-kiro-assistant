# Kiro Assistant — TODO / Backlog

Items marked ✅ are shipped. Items marked [ ] are open.

## Streaming & Display
- [ ] Reduce flicker/delay between streaming and final message render
- [ ] Show a loading/spinner indicator while ACP initializes and MCP servers load
- [ ] Better formatting for tool calls (show params, status, duration)

## Prompt & Input
- [ ] Customizable prompt display — show timestamp, current working directory, session info
- [ ] Interactive vs non-interactive toggle per session (trust-all-tools vs ask-before-running)
- [ ] Per-session settings (model, MCP config) vs global settings
- [ ] `#` context picker — trigger MCP prompts/resources from the prompt bar (see `DESIGN_SEED_CONTEXT_PICKER.md`)

## MCP Servers
- [ ] Hot-reload MCP config mid-session (investigate ACP `session/set_mode` or restart ACP process)
- [ ] Show MCP server initialization status in the UI during session startup
- [ ] Per-session MCP server config — pass mcpServers to session/new instead of relying on agent_config.json
- [ ] Agent self-service MCP config — let the agent add/disable/remove MCP servers via natural language

## ACP Protocol
- [ ] Handle `tool_call` and `tool_call_update` events for richer tool use display
- [ ] Support `session/cancel` properly in the UI stop button
- [ ] Support `session/load` to resume previous ACP sessions
- [ ] Explore passing MCP servers via `session/new` params instead of relying on agent_config.json

## Session Management
- ✅ Session rename — `POST /api/rename-session`
- ✅ Multi-session support — RunnerManager with up to 5 concurrent ACP processes
- ✅ Hot-restart — kill ACP process and respawn with full history (`restartSession()`)
- ✅ Session history persistence — SQLite-backed, survives server restarts
- [ ] Session continuation — use ACP `session/load` to resume previous kiro-cli sessions after restart
- [ ] Session export — download conversation as markdown
- [ ] Session search — find sessions by content or title
- [ ] Session pinning/favorites

## Send-To
- ✅ Send-To system — route files to email, Quip, S3, clipboard, another session, memory
- [ ] Memory store backend — `MemoryProvider` is wired but `shared-memories` store not yet implemented
- [ ] Email provider — MCP tool bridge not yet wired (returns success stub)
- [ ] Quip provider — verify attachment flow end-to-end

## UI Polish
- [ ] Add favicon
- [ ] File upload via drag-and-drop (not just paperclip button)
- [ ] Server-side file browser for `selectDirectory` (currently returns null)
- [ ] Mobile-responsive layout
- [ ] Session rename via double-click or context menu in sidebar (endpoint exists, UI not wired)

## Widgets
- [ ] Auto-render widgets from tool results (e.g., time tool → clock widget)
- [ ] More widgets: chart, mermaid diagram, diff viewer, image gallery, calendar grid
- [ ] Widget gallery/playground for testing

## File Operations
- [ ] Serve workspace files with proper MIME types for inline preview

## Security
- [ ] Add optional authentication (basic auth or token) for the web server
- [ ] Restrict file serving to workspace directories only
- [ ] HTTPS support (or document reverse proxy setup)

## Remote Access & Runners
- ✅ ECS runner — launch Fargate tasks per session, ACP-over-TCP
- ✅ AgentCore runner — invoke Bedrock AgentCore Runtime
- [ ] CDM reverse-tunnel runner — CDM dials out to ECS orchestrator (see `DESIGN_SEED_CDM_RUNNER.md`)
- [ ] Windows reverse-tunnel runner — Windows machine registers as remote runner
- [ ] ACP Gateway — REST/SSE endpoint for any HTTP client (see `DESIGN_SEED_ACP_GATEWAY.md`)

## Diagrams & Artifacts
- ✅ Diagram MCP tool — `scripts/diagram-mcp-tool.cjs` (Phase 1 local tool)
- [ ] Artifact Bus — S3-based file handles, thumbnail generation (see `DESIGN_SEED_ARTIFACT_BUS.md`)
- [ ] Diagram Lambda — package graphviz in Lambda container for sandbox environments

## Multi-Agent
- [ ] Multi-agent matrix — dispatch to specialized sub-agents in parallel (see `DESIGN_SEED_MULTI_AGENT_MATRIX.md`)
- [ ] `Dockerfile.claude-code` — claude-code container image for ECS/AgentCore

## Developer Experience
- [ ] Hot-reload dev mode (Vite dev server proxying to Express for API/WS)
- [ ] Configurable kiro-cli agent name (currently hardcoded `kiro-assistant`)
