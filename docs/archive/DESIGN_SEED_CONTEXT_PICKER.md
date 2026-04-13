# Design Seed: Context Picker (# Menu) for Kiro Assistant UI

## What

A `#` trigger in the prompt bar that shows available MCP prompts and resources,
similar to Kiro IDE's context provider menu.

## How It Works

1. User types `#` in the prompt input
2. UI queries all active MCP servers: `prompts/list` + `resources/list`
3. Results shown in a dropdown/popover above the input
4. User selects an item
5. For prompts: call `prompts/get` with any required arguments, inject the
   resulting message into the prompt
6. For resources: call `resources/read`, inject content as context

## Implementation

### Prompt Bar Changes (PromptBar.tsx)
- Detect `#` keystroke
- Show popover with grouped results (by MCP server)
- Handle argument collection for prompts that need them (modal or inline)
- On selection: replace `#` trigger text with the prompt content

### Server API
- `GET /api/mcp/prompts` — aggregates `prompts/list` from all active MCP servers
- `GET /api/mcp/resources` — aggregates `resources/list` from all active MCP servers
- `POST /api/mcp/prompts/get` — calls `prompts/get` on the right server
- `POST /api/mcp/resources/read` — calls `resources/read` on the right server

### Challenge: ACP Owns MCP Connections
The MCP servers are connected by the ACP process (kiro-cli), not by our web server.
We can't query them directly from the server side.

Options:
a) **ACP passthrough** — send a special message to ACP asking it to list prompts
   (may not be supported in the ACP protocol)
b) **Parallel MCP connections** — our server connects to the same MCP servers
   independently (duplicates connections but gives us direct access)
c) **Static registry** — read the MCP config files and show prompts/resources
   based on what we know the servers provide (no runtime query)
d) **Hybrid** — static list from config for the menu, ACP handles execution

Option (c) is simplest for v1: we know diagram-renderer has 4 prompts because
we wrote it. Hardcode the menu items, expand to dynamic later.

## UI Mockup

```
┌─────────────────────────────────────┐
│ # ▾                                 │
├─────────────────────────────────────┤
│ 📊 diagram-renderer                │
│   #diagram-3tier      3-tier web app│
│   #diagram-serverless Event-driven  │
│   #diagram-multi-account Multi-acct │
│   #diagram-custom     Custom...     │
│ 🔑 kiro-gateway                     │
│   (no prompts)                      │
│ 📁 Recent Resources                 │
│   diagram://rendered/gateway-test   │
└─────────────────────────────────────┘
```

## Next Steps

- [ ] Add `#` detection to PromptBar
- [ ] Build static prompt registry from MCP config
- [ ] Popover component with search/filter
- [ ] Argument collection for parameterized prompts
- [ ] Inject prompt content into the message
- [ ] Later: dynamic querying via parallel MCP connections

---

*Seed planted: 2026-03-29*
