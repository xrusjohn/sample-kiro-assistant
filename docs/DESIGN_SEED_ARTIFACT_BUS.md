# Design Seed: Artifact Bus (S3 File Handle Pattern)

## Insight

Tools shouldn't pass large artifacts through the conversation context.
Instead, they pass around S3 URIs as file handles. Tools read/write
directly to S3. The conversation only carries:
- URIs (pointers to artifacts)
- Thumbnails (small previews for the agent to "see")
- Metadata (dimensions, size, format, description)

## The Pattern

```
Tool A produces artifact → writes to S3 → returns URI
Tool B consumes artifact → reads from S3 via URI → processes → writes result to S3 → returns URI
Agent sees: URI + thumbnail + metadata (small context footprint)
User sees: pre-signed URL (full resolution in browser)
```

## Example: Diagram Workflow

```
1. render_diagram(code)
   → executes Python, produces PNG
   → uploads to s3://kiro-artifacts/{session}/arch.png
   → generates thumbnail (512px wide)
   → returns: { uri: "s3://...", thumbnail: "<small b64>", size: "201KB", dimensions: "1085x1113" }

2. Agent sees thumbnail, decides layout needs work
   → calls render_diagram again with adjusted code
   → same flow, overwrites the S3 object

3. User says "looks good, add it to the design doc"
   → embed_in_quip(quip_doc_id, s3_uri)
   → tool reads from S3, inserts into Quip
   → returns: { quip_url: "https://quip-amazon.com/..." }
```

## S3 Bucket Structure

```
s3://kiro-artifacts/
  ├── icons/                    # Shared icon library
  │   ├── pingfederate.png
  │   ├── aviatrix.png
  │   └── okta.png
  ├── sessions/
  │   └── {session-id}/        # Per-session working area
  │       ├── arch.png
  │       ├── arch-thumb.png
  │       ├── data-analysis.xlsx
  │       └── presentation.pptx
  └── published/               # Final artifacts (permanent)
      └── {date}/
          └── {name}.png
```

## Tools That Participate

| Tool | Reads from S3 | Writes to S3 | Notes |
|---|---|---|---|
| render_diagram | icons/ | sessions/ | Produces diagrams |
| make_thumbnail | sessions/ | sessions/ | Could be Lambda behind gateway |
| embed_in_quip | sessions/ | — | Inserts images into Quip docs |
| upload_artifact | local file | sessions/ | Bridge from local to S3 |
| publish_artifact | sessions/ | published/ | Promote to permanent storage |
| describe_image | sessions/ | — | Returns text description (for non-multimodal models) |

## Thumbnail Lambda

A simple Lambda behind the gateway that:
- Reads an S3 image
- Resizes to max 512px wide (keeps aspect ratio)
- Writes thumbnail back to S3
- Returns the thumbnail as base64 (small enough for context)

```python
from PIL import Image
import boto3, io, base64

def handler(event, context):
    s3 = boto3.client("s3")
    bucket, key = parse_uri(event["uri"])
    obj = s3.get_object(Bucket=bucket, Key=key)
    img = Image.open(io.BytesIO(obj["Body"].read()))
    img.thumbnail((512, 512))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    thumb_key = key.replace(".png", "-thumb.png")
    s3.put_object(Bucket=bucket, Key=thumb_key, Body=buf.getvalue())
    return {
        "uri": f"s3://{bucket}/{thumb_key}",
        "base64": base64.b64encode(buf.getvalue()).decode(),
        "width": img.width,
        "height": img.height,
    }
```

## Why This Matters

1. **Context efficiency** — 200KB PNG = 270KB base64 in context. Thumbnail = ~20KB. 13x savings.
2. **Tool composability** — tools chain via URIs, not by passing data through the agent
3. **Environment agnostic** — works local (file paths), sandbox (S3), hybrid (both)
4. **Audit trail** — S3 versioning gives you history of every iteration
5. **Sharing** — pre-signed URLs for users, S3 URIs for tools, Quip embeds for docs
6. **Icon library** — shared across sessions, grows over time as agent finds new icons

## Local Fallback

When S3 isn't available (pure local mode), the same pattern works with file paths:
```
render_diagram → /workspace/diagrams/arch.png (returns path)
make_thumbnail → reads path, writes arch-thumb.png (returns path)
```

The tool interface is the same — just the URI scheme changes:
- `s3://kiro-artifacts/sessions/123/arch.png`
- `file:///workspace/diagrams/arch.png`

## Open Questions

1. Who creates the S3 bucket? (Setup script / CDK)
2. Lifecycle policy? (Auto-delete session artifacts after 30 days?)
3. Should thumbnails be generated eagerly (every render) or lazily (on demand)?
4. Can we use S3 Object Lambda for on-the-fly thumbnailing?
5. How does the agent reference artifacts in conversation? ("the diagram I just made" → needs session state)

## MCP-Native Approach (Preferred)

MCP already has the building blocks — we don't need to invent a claim check pattern.

### Resources with URIs
MCP resources are identified by URI. `s3://` or `https://` (pre-signed) URIs
work natively. The tool returns a resource reference, not the bytes.

### Audience annotations
MCP supports `annotations.audience` on content blocks:
- `["user"]` — show to the user (full-res image via pre-signed URL)
- `["assistant"]` — include in agent context (thumbnail, small)
- `["user", "assistant"]` — both see it

This IS the thumbnail pattern, built into the protocol:

```json
{
  "content": [
    {"type": "text", "text": "✓ Diagram rendered: arch.png (201KB)"},
    {
      "type": "resource",
      "resource": {
        "uri": "https://kiro-artifacts.s3.amazonaws.com/session/arch.png?X-Amz-...",
        "mimeType": "image/png",
        "annotations": {"audience": ["user"]}
      }
    },
    {
      "type": "image",
      "data": "<20KB thumbnail base64>",
      "mimeType": "image/png",
      "annotations": {"audience": ["assistant"]}
    }
  ]
}
```

### Resource subscriptions
Client can subscribe to a resource URI and get notified on change.
The UI auto-refreshes when the agent re-renders a diagram.

### What this means
- No custom claim check pattern needed
- No external dependency beyond S3 (which we need anyway for persistence)
- Protocol handles routing: user sees full res, agent sees thumbnail
- Tools return URIs + thumbnails, not giant base64 blobs
- Fully spec-compliant, will work with any MCP client

### Caveat
ACP/kiro-cli may not implement all MCP resource features yet.
Need to verify: does kiro-cli honor audience annotations?
Does it render resource URIs in the UI? If not, we fall back to
the simpler approach (tool returns thumbnail + saves full res to disk).

## Next Steps

- [ ] Create the S3 bucket (kiro-artifacts)
- [ ] Update render_diagram to upload to S3 + generate thumbnail
- [ ] Build thumbnail Lambda behind gateway
- [ ] Build icon library management (upload, list, search)
- [ ] Test: full diagram workflow with S3 artifact bus
- [ ] Add pre-signed URL generation for user-facing links

---

*Seed planted: 2026-03-29*
*Inspired by: brainstorming session on artifact management and context efficiency*
