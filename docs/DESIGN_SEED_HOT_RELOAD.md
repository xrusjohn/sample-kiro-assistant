# ✅ SHIPPED — Design Seed: Hot-Reload MCP Tools

> **Status: Implemented.** `restartSession()` in `src/server/session-handler.ts` destroys the
> existing runner and respawns it with full session history. The new process picks up the latest
> `agent_config.json` (MCP servers), model settings, and skills. Triggered via
> `POST /api/sessions/:id/restart` or the "Restart Agent" button in the UI.
>
> The open question about `/agent` swap and `/mcp add` remains uninvestigated — the hot-restart
> approach (kill + respawn with history) turned out to be sufficient.

---


## Problem

When an agent modifies its own config (e.g., adds a new MCP server to `agent_config.json`), the change doesn't take effect until a new session starts. This breaks the self-modification pattern where an agent should be able to expand its own toolbox mid-conversation.

## Current Behavior

- `agent_config.json` is read at ACP process spawn time
- MCP servers are connected during initialization
- No mechanism to add/remove MCP servers in a running session
- `/agent` swap reinitializes the agent — might reload MCP connections (needs testing)

## Prior Art

- **Kiro IDE**: hot-reloads tools when config is modified — the capability exists in the kiro-cli stack
- **`/agent` swap**: switching agents and switching back might reinitialize MCP connections
- **`/mcp add`**: adds MCP servers — unclear if this takes effect immediately or requires restart

## Approaches to Investigate

### 1. `/agent` swap trick
- Agent modifies config, then does `/agent kiro-assistant` (swap to self)
- If this reinitializes MCP connections, it's a zero-code workaround
- Test: add an MCP server to config, swap agents, check if new tools appear

### 2. `/mcp add` in-session
- kiro-cli has `kiro-cli mcp add` and `/mcp add` slash command
- If `/mcp add` works mid-session, the agent could use it directly
- No config file modification needed

### 3. File watcher on agent_config.json
- Session manager watches the config file for changes
- On change: diff the MCP servers, connect new ones, disconnect removed ones
- This is likely what Kiro IDE does

### 4. ACP protocol extension
- Add a `session/reload-tools` or `mcp/add` message to the ACP protocol
- Session manager handles it by spawning the new MCP server and injecting tools
- Most flexible but requires protocol changes

## Self-Modification Pattern

The ideal flow:
1. User: "Add the Outlook MCP to your toolbox"
2. Agent: edits `agent_config.json` to add the Outlook MCP server
3. Agent: triggers tool reload (via one of the approaches above)
4. Agent: "Done — I now have access to Outlook. Let me check your email."
5. Agent: calls `@outlook/get_inbox` in the same session

## Next Steps

- [ ] Test: does `/agent kiro-assistant` reload MCP connections?
- [ ] Test: does `/mcp add` work mid-session for stdio MCP servers?
- [ ] Investigate: how does Kiro IDE implement hot-reload? Is it via ACP or file watching?
- [ ] Decide: which approach to implement for Kiro Assistant

---

*Seed planted: 2026-03-29*
