# AgentCore Runtime — Field Notes

Operational learnings from the kiro-cli sub-agent spike. Updated as we go.

---

## Protocol & Ports

- **A2A runs on port 9000** — hardcoded by AgentCore Runtime. Not configurable. (HTTP=8080, MCP=8000, A2A=9000)
- **Payload is a true pass-through** — AgentCore proxies the `InvokeAgentRuntime` payload body directly to the container with no wrapping or modification. What you send is what the container receives.
- **Session ID minimum 33 chars** — the SDK validates this. UUIDs (36 chars) work fine. Short strings fail with a parameter validation error before the request even leaves the client.

---

## The Binary Payload Problem (AWS CLI vs SDK)

**Symptom:** Container receives binary garbage instead of JSON.

**Cause:** The AWS CLI treats `--payload` as a `blob` type. When you pass `file:///tmp/payload.json`, it reads the file as raw bytes and sends it as a binary stream. The container receives it as binary, not UTF-8 JSON.

**Fix:** Use the SDK with `Buffer.from(JSON.stringify(payload))`. The SDK sends it as a proper byte stream that arrives as UTF-8 JSON on the other end.

```typescript
// WRONG (CLI) — binary-encodes the file
aws bedrock-agentcore invoke-agent-runtime --payload file:///tmp/payload.json ...

// RIGHT (SDK)
const cmd = new InvokeAgentRuntimeCommand({
  agentRuntimeArn: "...",
  runtimeSessionId: uuid(),
  payload: Buffer.from(JSON.stringify(payload)),
});
```

This is already correct in `agentcore-runner.ts`. Anyone testing manually should use the Node SDK, not the CLI.

---

## CDK / Deployment

- **`AgentRuntimeArtifact.fromAsset()` builds locally** — runs `docker build` on your machine during `cdk deploy`. Useless for ARM64 on an x86 dev box. Use `fromEcrRepository` + CodeBuild with `LinuxArmBuildImage` instead.

- **Runtime doesn't auto-pull `:latest`** — updating the ECR image doesn't trigger a new container. You must change something in the `AWS::BedrockAgentCore::Runtime` CloudFormation resource to force an update. We use `IMAGE_VERSION: source.assetHash.slice(0, 8)` as an env var — CDK detects the change and updates the runtime, which pulls the new image.

- **`fromAsset` path must exclude `cdk.out`** — if you point `fromAsset` at the repo root, CDK copies the entire directory into `cdk.out` as a staging asset. If `cdk.out` is inside the repo root, it recurses infinitely and hits `ENAMETOOLONG`. Add a `.dockerignore` and use the `exclude` option.

- **Docker Hub rate limits in CodeBuild** — `FROM ubuntu:24.04` will hit 429 Too Many Requests on a fresh CodeBuild run. Use the ECR Public mirror: `FROM public.ecr.aws/ubuntu/ubuntu:24.04`.

---

## Container

- **kiro-cli `acp` mode uses plain pipes** — no PTY needed. `stdio: ['pipe', 'pipe', 'pipe']` works fine. The PTY/`script` wrapper is only needed for the ECS TCP bridge path.

- **ES module syntax requires `package.json`** — `a2a-adapter.js` uses `import` statements. Node 18 (Ubuntu 24.04 default) needs `{"type":"module"}` in `package.json` in the same directory, or the file renamed to `.mjs`. We add it via Dockerfile: `RUN echo '{"type":"module"}' > /home/kiro/package.json`.

- **`awscli` must be explicitly installed** — the bootstrap script calls `aws secretsmanager get-secret-value`. If `awscli` isn't in the image, the call silently fails and the JSON parse errors out. Add `python3-pip` + `pip3 install awscli` to the Dockerfile.

---

## Debugging

- **Container logs are per-instance** — each container gets its own CloudWatch log stream under `/aws/bedrock-agentcore/runtimes/<runtime-id>-DEFAULT`. If you're hitting a warm container, your new logs won't appear in the stream you're watching. Use a new session ID to force a new log stream.

- **Test locally before deploying** — run `./scripts/test-a2a-local.sh` for fast checks (~10s, no AWS). Use `--full` for the LLM round-trip. Things that can be caught locally: syntax errors, missing `awscli`, ES module issues, wrong port, bad JSON parsing.

- **Things that actually require a deploy:** ARM64 build (can't run on x86 without QEMU), AgentCore Runtime invocation path, Secrets Manager auth bootstrap.

---

## Auth

- **Token Vault is a REST endpoint, not env var injection** — the container calls `GET /credentials/kirocli-oidc` against the vault endpoint. The existing `bootstrap-auth.sh` already handles `KIRO_TOKEN_VAULT_ENDPOINT`. Pass `KIRO_AUTH_SECRET_ARN` as an env var and the bootstrap falls through to Secrets Manager.

### AgentCore Identity Token Vault Integration (2026-04-04)

Added a new auth source (Source 1b) to `bootstrap-auth.sh` that uses the AgentCore Identity API Key Credential Provider. This sits between the existing REST-based Token Vault endpoint (Source 1) and the ECS native injection path (Source 2). All existing sources are preserved — this is additive.

**How it works:**

1. ECS task role calls `get-workload-access-token` → gets a workload identity token
2. Workload token calls `get-resource-api-key` → retrieves JSON credential bundle from Token Vault
3. `bootstrap-auth.sh` parses the JSON and writes it to the `auth_kv` SQLite table as `kirocli:oidc:device-registration`

**The trick:** AgentCore Identity doesn't have a "structured credential bundle" type. We JSON-encode our 3-field bundle (`client_id`, `client_secret`, `refresh_token`) into a single API key string via `create-api-key-credential-provider`. Token Vault stores it in Secrets Manager under the hood, but access is mediated through the workload identity flow.

**Files:**
- `scripts/bootstrap-auth.sh` — Source 1b added (existing sources untouched)
- `scripts/seed-kiro-credentials.sh` — one-time setup (creates workload identity + API key provider, verifies round-trip)
- `docs/agentcore-identity-credential-lifecycle.md` — full lifecycle docs

**ECS env vars needed:**
```
KIRO_CREDENTIAL_PROVIDER=kiro-cli-creds
KIRO_WORKLOAD_NAME=kiro-subagent
```

**90-day lifecycle:** kiro-cli refresh tokens expire ~90 days. `bootstrap-auth.sh` warns at 14 days remaining, falls through to next source at expiry. Renewal = re-auth locally + re-run seed script.

**Why bother when we already have Secrets Manager?** Workload identity binding, Token Vault access control layer, audit trail. More importantly: this is the first step toward proper OIDC and Midway integration through AgentCore Identity. Getting the plumbing in place now means less rework later.

**Open questions:**
- Does `update-api-key-credential-provider` exist? The seed script assumes it does for renewal. Need to verify.
- Token Vault secret path for API keys — assumed `bedrock-agentcore-identity!default/apikey/<name>` but haven't confirmed the exact pattern.
- The `get-workload-access-token` response field name — docs show `token`, SDK shows `workloadAccessToken`. bootstrap-auth.sh tries both via python.

---

## A2A ↔ ACP Mapping

| A2A | ACP | Notes |
|-----|-----|-------|
| `message/send` | `session/prompt` + buffer | Works. Returns when turn ends. |
| `message/stream` | `session/prompt` + SSE chunks | Works. Chunks arrive in real-time. |
| `/.well-known/agent-card.json` | — | Served by adapter, not ACP. |
| `/ping` | — | Health check, no ACP involvement. |
| A2A artifacts | ACP text chunks | We return everything as a single text artifact. |
| A2A task states | ACP running/idle/error | Not surfaced in current adapter. |

Streaming is not a showstopper — `message/stream` works and chunks flow as kiro-cli generates them.
