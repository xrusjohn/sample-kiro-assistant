# Code Interpreter as a kiro-cli Agent Platform

## Summary

We proved that kiro-cli can run inside AgentCore Code Interpreter — a serverless sandbox with no containers, no Dockerfiles, no ECR, and no CDK stacks. This opens a fourth deployment platform alongside local docker, ECS Fargate, and AgentCore Runtime.

## What We Proved

| Step | Result |
|---|---|
| Download kiro-cli binary (288MB) | ✅ Public mode has internet |
| `kiro-cli --version` | ✅ `1.29.3` runs on aarch64 |
| IAM role on Code Interpreter | ✅ `relay-code-interpreter-role` |
| Token Vault auth (GetWorkloadAccessToken + GetResourceApiKey) | ✅ 2 auth rows retrieved |
| kiro-cli DB schema init | ✅ Let kiro-cli create its own DB, then inject auth rows |
| `kiro-cli chat --no-interactive "What is 2+2?"` | ✅ Answered "4" in 2s |

### Pre-installed tools available in the sandbox

- `graphviz` (dot) at `/usr/bin/dot`
- `diagrams` 0.24.4 (Python architecture diagram library)
- `matplotlib`, `plotly`, `networkx`, `pillow`, `igraph`
- `boto3` for AWS API calls
- `pip install` for adding packages at runtime

## Architecture

```
Orchestrator
  │
  ├─ start_code_interpreter_session(identifier="relay_code_interpreter_public_iam-...")
  │
  ├─ execute_code: bootstrap script
  │   1. curl kiro-cli from S3 (or public URL)
  │   2. boto3 → Token Vault → auth rows
  │   3. Let kiro-cli init DB, inject auth
  │
  ├─ execute_code: kiro-cli chat --no-interactive "user prompt"
  │   └─ returns response
  │
  ├─ (session persists for follow-up calls)
  │
  └─ stop_code_interpreter_session (or idle timeout)
```

### Comparison with other platforms

| | Local Docker | ECS Fargate | AgentCore Runtime | Code Interpreter |
|---|---|---|---|---|
| Infra to manage | Dockerfile | CDK stack + ECR | CDK stack + ECR + CodeBuild | **Nothing** |
| Cold start | ~5s (cached) | 30-60s | ~10s | 2s + 30s bootstrap |
| Protocols | ACP + A2A + MCP | ACP + A2A + MCP | A2A | Python subprocess |
| Arch | x86_64 | x86_64 | ARM64 | ARM64 |
| Internet | Yes | VPC-dependent | VPC-dependent | Public or VPC mode |
| Pre-installed tools | None (you build it) | None | None | graphviz, diagrams, matplotlib, boto3, etc. |
| Session persistence | Container lifetime | Task lifetime | Session timeout | Session timeout (up to 8h) |
| Auth | Token Vault | Token Vault | Token Vault | Token Vault (needs IAM role) |

## Cold Start Optimization

The 30s bootstrap (downloading 288MB) is the main cost. Strategies:

### 1. Session pool (recommended)
Orchestrator pre-bootstraps 2-3 sessions on startup. Incoming requests get a warm session instantly. Replacement sessions spin up in the background.

### 2. S3 binary cache
Daily job copies kiro-cli to `s3://relay-artifacts/kiro-cli/kirocli-aarch64-linux.zip`. Bootstrap pulls from same-region S3 instead of public internet. Faster, versioned, works in VPC/private mode.

### 3. Custom Code Interpreter image
If AgentCore supports custom base images for Code Interpreter, pre-bake kiro-cli into it. Zero download, instant bootstrap. (Not yet confirmed if this is supported.)

## VPC / Air-Gapped Mode

With the S3 cache approach, Code Interpreter can run in VPC mode with no internet:

| Dependency | How it's reached |
|---|---|
| kiro-cli binary | S3 VPC endpoint |
| Token Vault auth | AgentCore API (VPC endpoint) |
| Bedrock models | Bedrock API (VPC endpoint) |

IAM role needs: `s3:GetObject`, `bedrock-agentcore:GetWorkloadAccessToken`, `bedrock-agentcore:GetResourceApiKey`, `secretsmanager:GetSecretValue`, `bedrock:InvokeModel`.

## Open Questions

1. **Is this useful?** Code Interpreter adds a fourth platform with zero infra. But it's a different consumption model — no persistent server, no A2A/MCP endpoints, just subprocess calls. Best for ephemeral tasks, not long-running agents.

2. **Session pool management** — who manages the pool? The orchestrator? A separate Lambda? How do we handle scaling?

3. **Custom Code Interpreter images** — can we pre-bake kiro-cli into the base image? This would eliminate the cold start entirely.

4. **Cost model** — Code Interpreter sessions are billed by duration. How does this compare to ECS Fargate or AgentCore Runtime for equivalent workloads?

5. **Multi-turn conversations** — kiro-cli sessions persist within a Code Interpreter session. But if the session dies, context is lost. Do we need to persist conversation state externally?

6. **Tool access** — kiro-cli in Code Interpreter has access to the sandbox filesystem but not to external systems (no SSH, no git clone in VPC mode). Is that sufficient for the use cases we care about?

7. **Diagram generation** — Code Interpreter has graphviz + diagrams pre-installed. Could this be the dedicated "diagrammer" agent, separate from the general coding agent?

## Resources Created

- Code Interpreter: `relay_code_interpreter_public_iam-VmHRsPn29j` (public + IAM)
- IAM Role: `relay-code-interpreter-role` (trusts `bedrock-agentcore.amazonaws.com`)
- Token Vault: reuses existing `kiro-cli-creds` provider + `kiro-subagent` workload identity

## Bootstrap Script

The bootstrap sequence that works:

```python
import subprocess, os, platform, sqlite3, json, boto3

# 1. Download kiro-cli
arch = "aarch64" if platform.machine() == "aarch64" else "x86_64"
subprocess.run(["curl", "-sSf", "-o", "/tmp/kirocli.zip",
    f"https://desktop-release.q.us-east-1.amazonaws.com/latest/kirocli-{arch}-linux.zip"],
    check=True, capture_output=True, timeout=120)
subprocess.run(["unzip", "-qo", "/tmp/kirocli.zip", "-d", "/tmp/kirocli"], check=True, capture_output=True)
os.chmod("/tmp/kirocli/kirocli/bin/kiro-cli", 0o755)
os.environ["PATH"] = "/tmp/kirocli/kirocli/bin:" + os.environ["PATH"]

# 2. Let kiro-cli create its DB schema
subprocess.run(["kiro-cli", "chat", "--no-interactive", "hi"],
    capture_output=True, text=True, timeout=15)

# 3. Inject auth from Token Vault
ac = boto3.client("bedrock-agentcore", region_name="us-east-1")
wit = ac.get_workload_access_token(workloadName="kiro-subagent")["workloadAccessToken"]
api_key = ac.get_resource_api_key(
    resourceCredentialProviderName="kiro-cli-creds",
    workloadIdentityToken=wit)["apiKey"]

DB_PATH = os.path.expanduser("~/.local/share/kiro-cli/data.sqlite3")
conn = sqlite3.connect(DB_PATH)
for row in json.loads(api_key):
    conn.execute("INSERT OR REPLACE INTO auth_kv (key, value) VALUES (?, ?)",
        (row["key"], row["value"]))
conn.commit()
conn.close()

# 4. Ready to chat
subprocess.run(["kiro-cli", "chat", "--no-interactive", "your prompt here"],
    capture_output=True, text=True, timeout=90)
```
