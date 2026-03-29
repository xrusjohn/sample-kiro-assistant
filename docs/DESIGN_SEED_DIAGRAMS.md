# Design Seed: Diagram-as-Code Tool & Skill

## Problem

The agent needs to create architecture diagrams. Today this is done by writing
Python scripts using the `diagrams` library and running them locally. This
needs to work in sandboxed environments too, and ideally as an MCP tool the
agent can call directly.

## Current Pattern (from eum-otp scripts)

Uses the Python `diagrams` library (mingrammer/diagrams):

```python
from diagrams import Diagram, Cluster, Edge
from diagrams.aws.compute import Lambda
from diagrams.custom import Custom  # for custom icons

with Diagram("My Architecture", show=False, direction="LR", filename="output"):
    # nodes, clusters, edges...
```

### What makes it powerful:
- **Built-in icon sets**: AWS, GCP, Azure, on-prem, generic
- **Custom icons**: `Custom("Aviatrix", "./aviatrix.png")` for anything not built-in
- **Clusters**: nested groupings (VPCs, accounts, logical boundaries)
- **Colored edges**: different flows (green=outbound, red=inbound, blue=opt-out)
- **Graph attributes**: layout control (`splines`, `nodesep`, `ranksep`, `direction`)
- **Output formats**: PNG, SVG, PDF, DOT

### System dependency: graphviz
The `diagrams` library generates DOT files and shells out to `graphviz` to render.
This is a system package (`apt install graphviz`), not a pip package.
**This is the key constraint for sandbox environments.**

## Approach: Build Local First, Then Promote

### Phase 1: Local MCP Tool

A stdio MCP tool that:
1. Accepts Python diagram code + optional custom icon files
2. Writes to a temp directory
3. Runs the script (`python script.py`)
4. Returns the generated image (path or base64)

```json
{
  "name": "diagram-renderer",
  "command": "node",
  "args": ["scripts/diagram-mcp-tool.cjs"]
}
```

Tool schema:
```
render_diagram:
  code: string        # Python script using diagrams library
  icons: object       # {"name.png": "<base64>"} for custom icons
  format: string      # "png" | "svg" | "pdf" (default: png)
  → returns: { path: string, base64: string }
```

Prerequisites on the host:
- `pip install diagrams`
- `apt install graphviz`

### Phase 2: Lambda Behind Gateway

Package graphviz + diagrams in a Lambda container image:

```dockerfile
FROM public.ecr.aws/lambda/python:3.13
RUN dnf install -y graphviz
RUN pip install diagrams
COPY handler.py .
```

Register as a gateway target. Agent calls it via the gateway MCP proxy.
Works from anywhere — no local dependencies.

### Phase 3: Code Interpreter (if graphviz available)

If AgentCore Code Interpreter has graphviz in its container:
- No tool needed — agent just writes the script and executes it
- Skill teaches the pattern
- Most flexible (agent can iterate on the diagram code)

If not, fall back to Phase 2 (Lambda).

## Alternative: Mermaid/D2 (No Graphviz Needed)

If graphviz is a persistent blocker:
- **Mermaid**: JavaScript-based, renders in browser or via `mmdc` CLI
- **D2**: Go-based, modern syntax, good for architecture diagrams
- Both avoid the graphviz dependency
- But: no built-in AWS icons, less visual polish than `diagrams`

Could support multiple backends:
```
render_diagram:
  engine: "diagrams" | "mermaid" | "d2"
  code: string
```

## Diagram Skill

Teaches the agent how to create diagrams using the patterns from the
existing eum-otp scripts:

```markdown
---
name: architecture-diagrams
description: Create AWS architecture diagrams using Python diagrams library.
  Use when asked to create, draw, or visualize architecture, infrastructure,
  or system designs.
---

## How to Create Architecture Diagrams

Use the Python `diagrams` library. Key patterns:

### Basic structure
- `Diagram()` with title, direction (LR/TB), filename
- `Cluster()` for groupings (VPCs, accounts, services)
- `Edge()` with labels and colors for data flows

### AWS icons
- `from diagrams.aws.compute import Lambda`
- `from diagrams.aws.database import Dynamodb`
- `from diagrams.aws.integration import SimpleNotificationServiceSns`
- Full list: https://diagrams.mingrammer.com/docs/nodes/aws

### Custom icons
- `from diagrams.custom import Custom`
- `Custom("Service Name", "./icon.png")`
- Place icon files in the working directory

### Flow conventions
- Green edges: primary/outbound flow
- Red edges: error/inbound flow
- Blue edges: secondary/async flow
- Purple edges: audit/logging

### Layout tips
- `graph_attr={"nodesep": "0.8", "ranksep": "1.5", "splines": "ortho"}`
- `direction="LR"` for wide diagrams, `"TB"` for tall
- `constraint="false"` on edges to prevent layout distortion

### Rendering
Use the `render_diagram` tool to execute the script and get the image.
```

## Custom Icon Library

Build a shared icon library (S3 bucket or local directory) with commonly
used custom icons:
- Aviatrix, PingFederate, Okta, etc.
- Company logos
- Custom service icons

The diagram tool fetches icons by name from the library.

## Open Questions

1. Should the tool return base64 or write to a file? (Both — let caller decide)
2. How to handle iterative refinement? (Agent runs, sees output, adjusts code)
3. Should we pre-generate icon catalogs so the agent knows what's available?
4. Can we embed diagrams directly in Quip docs? (Quip supports inline images)

## Next Steps

- [ ] Build local MCP tool (Phase 1)
- [ ] Test with existing eum-otp scripts
- [ ] Write the diagram skill
- [ ] Verify graphviz in AgentCore Code Interpreter
- [ ] Build Lambda container image (Phase 2) if needed
- [ ] Create custom icon library

---

*Seed planted: 2026-03-29*
*Reference scripts: /home/xrusjohn/projects/uhg/simple-sms-otp/eum-otp*.py*
