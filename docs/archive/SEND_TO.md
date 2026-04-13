# Send-To: File Routing System

Send-To lets you route files from a session workspace to external destinations — email, Quip, S3, clipboard, another session, or shared memory — directly from the UI.

## How It Works

1. A file appears in the **FileBar** (chips above the prompt input)
2. Click the chip → **SendToMenu** opens with available destinations
3. Select a destination → **SendToConfigPanel** shows required fields
4. Submit → server routes the file via the appropriate provider
5. **SendToStatusIndicator** shows success/error inline

## Providers

| ID | Label | Icon | Supported Files | Description |
|----|-------|------|----------------|-------------|
| `email` | Email (Outlook) | 📧 | All | Sends file as attachment via Outlook MCP |
| `quip` | Quip | 📄 | Text | Creates or appends to a Quip document |
| `s3` | S3 | ☁️ | All | Uploads to an S3 bucket |
| `clipboard` | Clipboard | 📋 | Text | Copies file content to clipboard |
| `session` | Another Session | 🔗 | All | Sends file reference to another active session |
| `memory` | Memory | 🧠 | Text | Saves content to shared cross-session memory |

## API

```
GET  /api/files/send-to/destinations
→ Returns list of available destinations with config fields

POST /api/files/send-to
Body: { filePath: string, destination: string, params: Record<string, string> }
→ Returns: { success: boolean, message: string, data?: object }
```

### Example: send a file via email

```bash
curl -X POST http://localhost:3001/api/files/send-to \
  -H "Content-Type: application/json" \
  -d '{
    "filePath": "/home/xrusjohn/Documents/workspace-kiro-assistant/task-20260406/arch.png",
    "destination": "email",
    "params": {
      "to": "colleague@example.com",
      "subject": "Architecture diagram",
      "body": "Here is the diagram we discussed."
    }
  }'
```

## Provider Details

### Email (`email`)
Reads the file, base64-encodes it, and sends via the Outlook MCP `email_send` tool.

Config fields:
- `to` (required) — recipient email address
- `subject` (required) — email subject
- `body` (optional) — message body

### Quip (`quip`)
Creates a new Quip document or appends to an existing one.

Config fields:
- `documentId` (optional) — existing Quip doc ID to append to; leave blank to create new
- `title` (optional) — title for new document

### S3 (`s3`)
Uploads the file to an S3 bucket.

Config fields:
- `bucket` (required) — S3 bucket name
- `key` (optional) — S3 key; defaults to `kiro-assistant/<filename>`

### Clipboard (`clipboard`)
Copies text file content to the system clipboard.

No config fields required.

### Another Session (`session`)
Sends a file reference as a prompt to another active session. The target session receives a message like:

> `[File shared from another session] The file "arch.png" is available at: /path/to/arch.png`

Config fields:
- `sessionId` (required) — target session (populated dynamically from active sessions)

### Memory (`memory`)
Saves text content to shared cross-session memory for future retrieval.

Config fields:
- `category` (optional) — `preferences`, `project-context`, `decisions`, `people`, `general`
- `content` (optional) — override content (defaults to file content, truncated to 2000 chars)

> Note: The memory store backend (`shared-memories`) is not yet fully implemented. The provider is wired but will return an error until the store is connected.

## Source Files

| File | Purpose |
|------|---------|
| `src/server/send-to/index.ts` | Registry factory — registers all providers |
| `src/server/send-to/destination-registry.ts` | Provider registry |
| `src/server/send-to/destination-provider.ts` | Provider interface |
| `src/server/send-to/send-to-routes.ts` | Express router |
| `src/server/send-to/providers/email-provider.ts` | Email via Outlook MCP |
| `src/server/send-to/providers/quip-provider.ts` | Quip document |
| `src/server/send-to/providers/s3-provider.ts` | S3 upload |
| `src/server/send-to/providers/clipboard-provider.ts` | System clipboard |
| `src/server/send-to/providers/session-provider.ts` | Cross-session routing |
| `src/server/send-to/providers/memory-provider.ts` | Shared memory |
| `src/shared/send-to-types.ts` | Shared types (`ConfigField`, `SendToResponse`, etc.) |
| `src/ui/components/SendToMenu.tsx` | Destination picker UI |
| `src/ui/components/SendToConfigPanel.tsx` | Parameter form UI |
| `src/ui/components/SendToStatusIndicator.tsx` | Status display |
| `src/ui/store/useSendToStore.ts` | Zustand store for send-to state |

## Adding a New Provider

1. Create `src/server/send-to/providers/my-provider.ts` implementing `DestinationProvider`:

```typescript
export class MyProvider implements DestinationProvider {
  readonly id = "my-destination";
  readonly label = "My Destination";
  readonly icon = "🎯";
  readonly supportedFileTypes = "all" as const;

  getConfigFields(): ConfigField[] {
    return [
      { name: "target", label: "Target", type: "text", required: true }
    ];
  }

  validateParams(params: Record<string, string>): string | null {
    if (!params.target) return "Target is required";
    return null;
  }

  async send(filePath: string, params: Record<string, string>): Promise<SendToResponse> {
    // ... your logic
    return { success: true, message: "Sent!" };
  }
}
```

2. Register it in `src/server/send-to/index.ts`:

```typescript
registry.register(new MyProvider());
```

That's it — the UI picks it up automatically from `GET /api/files/send-to/destinations`.
