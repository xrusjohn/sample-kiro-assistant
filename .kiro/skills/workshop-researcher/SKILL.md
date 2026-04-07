# Workshop Researcher

Crawl AWS Workshop Studio sites and index their content for instant Q&A.

## MCP Tool: workshop_export

Registered as the `workshop-export-mcp` server. Runs `scripts/workshop-export-tool.py`.

### Usage

```
workshop_export(
  url="https://catalog.workshops.aws/<workshop-slug>/en-US",
  bucket="<your-s3-bucket>",
  format="both",          # "html" | "md" | "both"
  variant="Healthcare",   # optional — selects industry tab before extracting
  max_depth=3             # nav depth limit
)
```

Returns:
```json
{
  "pages_exported": 37,
  "pages_failed": 0,
  "s3_location": "s3://bucket/workshop-exports/slug/20250406-1200/",
  "index_url": "https://presigned-url/index.html",
  "format": "both",
  "variant": "Healthcare"
}
```

## Workflow: Export → Index → Q&A

### 1. Export the workshop

Call `workshop_export` with the target URL and an S3 bucket you have write access to.
If the workshop has industry tabs, pass `variant` (e.g. `"Healthcare"`, `"Financial Services"`).

### 2. Index Markdown into knowledge

After export, the Markdown files are at `s3://<bucket>/<prefix>/*.md`.
Download them locally (or use the already-exported copy in `docs/`) and index with:

```
knowledge index <path-to-md-files>
```

Or, if the files are already local (e.g. `docs/connect-ai-agents-workshop/`):

```
knowledge index docs/connect-ai-agents-workshop/
```

### 3. Answer questions

Once indexed, use the `knowledge` tool to answer questions:

```
knowledge query "How do I configure a security profile for an AI agent?"
knowledge query "What are the steps to set up Nova Sonic voice?"
```

## Pre-indexed Workshop

The Amazon Connect AI Agents workshop (Healthcare path) is already exported to:
`docs/connect-ai-agents-workshop/` — 37 pages, ready to index.

Source: https://catalog.workshops.aws/amazon-connect-ai-agents/en-US
Variant: Healthcare

## MCP Server Config

Add to your `.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "workshop-export-mcp": {
      "command": "python3",
      "args": ["scripts/workshop-export-tool.py"],
      "env": {
        "AWS_REGION": "us-east-1"
      },
      "disabled": false
    }
  }
}
```

Requires: `pip install playwright boto3 bedrock-agentcore` and `playwright install chromium`.

## Routing Tags

Sessions mentioning `workshop`, `aws workshop`, `catalog.workshops.aws`, or `knowledge base` will
be routed to this agent via the tag-match routing in `session-handler.ts`.
