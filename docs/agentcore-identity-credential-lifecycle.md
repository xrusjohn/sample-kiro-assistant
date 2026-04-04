# AgentCore Identity Token Vault — kiro-cli Credential Lifecycle

## Overview

kiro-cli sub-agent containers running in ECS retrieve their OIDC device-registration
credentials through AgentCore Identity's Token Vault, using the API Key credential
provider as a transport for a JSON-encoded credential bundle.

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│  ECS Task Role   │────▶│  AgentCore Identity   │────▶│  Token Vault (SM)   │
│  (IAM)           │     │  get-workload-access  │     │  API Key Provider   │
│                  │     │  -token               │     │  "kiro-cli-creds"   │
└─────────────────┘     │  get-resource-api-key  │     └─────────────────────┘
                        └──────────────────────┘
                                  │
                                  ▼
                        ┌──────────────────────┐
                        │  ~/.kiro/auth/        │
                        │  device-registration  │
                        │  .json                │
                        └──────────────────────┘
```

## Credential Shape

The API key stores a JSON string:

```json
{
  "client_id": "...",
  "client_secret": "...",
  "refresh_token": "...",
  "issuer_url": "https://auth.kiro.dev",
  "expires_at": "2026-07-03T00:00:00Z"
}
```

## 90-Day Credential Lifecycle

kiro-cli device registrations have a ~90-day refresh token lifetime.

### Timeline

| Day | Event |
|-----|-------|
| 0 | Seed credentials via `seed-kiro-credentials.sh` |
| 1–76 | Normal operation. bootstrap-auth.sh retrieves and writes creds on each container start |
| 77 | bootstrap-auth.sh prints WARNING: "Credentials expire in 14 days" |
| 90 | bootstrap-auth.sh prints ERROR and exits non-zero. Containers fail to start |

### Renewal Process

1. On your local machine, re-authenticate kiro-cli:
   ```
   kiro-cli auth login
   ```
   This refreshes `~/.kiro/auth/device-registration.json` with a new 90-day token.

2. Re-run the seed script to update the Token Vault:
   ```
   ./scripts/seed-kiro-credentials.sh --region us-east-1
   ```
   This calls `update-api-key-credential-provider` with the fresh credentials.

3. New ECS tasks will pick up the updated credentials on next container start.
   Running containers continue using their existing auth until restarted.

### Automation Options

- **CloudWatch alarm**: Monitor for the WARNING log pattern `"Credentials expire in"` in ECS container logs
- **EventBridge scheduled rule**: Run the seed script on a Lambda every 60 days
- **Manual calendar reminder**: Set a recurring 60-day reminder to re-seed

## Setup (One-Time)

### 1. Authenticate kiro-cli locally

```bash
kiro-cli auth login
```

### 2. Run the seed script

```bash
./scripts/seed-kiro-credentials.sh \
  --region us-east-1 \
  --provider-name kiro-cli-creds \
  --workload-name kiro-subagent
```

### 3. Configure ECS task definition

Add these environment variables:
```
KIRO_CREDENTIAL_PROVIDER=kiro-cli-creds
KIRO_WORKLOAD_NAME=kiro-subagent
```

### 4. Attach IAM policy to ECS task role

The seed script prints the exact policy. Key permissions:
- `bedrock-agentcore:GetWorkloadAccessToken`
- `bedrock-agentcore:GetResourceApiKey`
- `secretsmanager:GetSecretValue` (Token Vault uses SM under the hood)

### 5. Call bootstrap-auth.sh from entrypoint

In your container's entrypoint, before launching kiro-cli:
```bash
if [ -n "$KIRO_CREDENTIAL_PROVIDER" ]; then
  ./bootstrap-auth.sh
fi
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `get-workload-access-token failed` | Missing IAM permissions or workload doesn't exist | Check task role policy; re-run seed script |
| `get-resource-api-key failed` | Provider doesn't exist or token vault permissions | Re-run seed script; check IAM policy |
| `apiKey is not valid JSON` | Provider was created with non-JSON value | Re-run seed script with correct auth file |
| `Credentials expired` | 90-day refresh token expired | Re-authenticate locally and re-seed |
| `WARNING: Credentials expire in N days` | Approaching expiry | Schedule renewal within N days |

## Why AgentCore Identity Instead of Direct Secrets Manager?

- **Workload identity binding**: Credentials are accessed through a workload identity token, not just IAM role assumption
- **Token Vault access control**: AgentCore Identity mediates access with its own authorization layer
- **Audit trail**: AgentCore Identity logs credential access separately from raw SM access
- **Future-proof**: When AgentCore adds structured credential types, migration is minimal
