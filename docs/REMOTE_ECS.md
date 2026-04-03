# Remote Kiro ECS — Architecture & Deployment

## Overview

Run Kiro Assistant remotely on ECS Fargate, accessible via browser or CLI at
`https://relay.xrusjohn.people.aws.dev`. The orchestrator manages sessions and
dispatches work to ephemeral kiro-cli sub-agent containers.

## Architecture

```
Browser / CLI client
        │ HTTPS / WSS
        ▼
┌─────────────────────────────────────┐
│  CloudFront                          │
│  relay.xrusjohn.people.aws.dev       │
│  cert: *.xrusjohn.people.aws.dev     │
│  origin timeout: 60s                 │
└──────────────────┬──────────────────┘
                   │ HTTP :80 (CloudFront IPs only)
                   ▼
┌─────────────────────────────────────┐
│  ALB  relay-alb                      │
│  SG: CloudFront managed prefix list  │
│  (no direct public access)           │
└──────────────────┬──────────────────┘
                   │ :3001
                   ▼
┌─────────────────────────────────────┐
│  Orchestrator  (ECS Fargate service) │
│  relay-orchestrator                  │
│  Express + WebSocket                 │
│  sessions.db ←→ S3 checkpoint        │
└──────────────────┬──────────────────┘
                   │ ECS RunTask (per session)
                   ▼
┌─────────────────────────────────────┐
│  Sub-Agent  (ECS Fargate task)       │
│  kiro-subagent                       │
│  bootstrap-auth.sh → kiro-cli acp    │
│  TCP bridge on :8080                 │
└─────────────────────────────────────┘
```

## Security Model

- **CloudFront** terminates TLS with ACM cert `*.xrusjohn.people.aws.dev`
- **ALB** security group only allows the CloudFront managed prefix list
  (`com.amazonaws.global.cloudfront.origin-facing`) — no direct public access
- **Sub-agents** only reachable from orchestrator on port 8080 (private subnet)
- **Auth** injected via ECS native secrets injection from Secrets Manager
  (`kiro/auth-sqlite`) — no credentials in environment variables or image

## Key Components

| File | Description |
|------|-------------|
| `Dockerfile.kiro-cli` | Sub-agent image: Ubuntu + kiro-cli + bridge |
| `Dockerfile.server` | Orchestrator image: Node.js + server |
| `scripts/acp-bridge.js` | TCP bridge: `script -q -c 'stty -echo; kiro-cli acp'` |
| `scripts/bootstrap-auth.sh` | Writes `KIRO_AUTH_JSON` env var to sqlite on startup |
| `src/server/acp-tcp.ts` | ACP over TCP transport (JSON-RPC, handles agent requests) |
| `src/server/ecs-runner.ts` | Launches ECS tasks, runs ACP handshake, streams responses |
| `src/server/paths.ts` | S3 pull/push for sessions.db persistence |

## Why the PTY bridge?

`kiro-cli acp` calls `isatty(stdin)` and exits silently if stdin is a plain
pipe. The bridge uses `script -q -c '...' /dev/null` to give kiro-cli a PTY
on stdin while keeping the bridge's own stdin/stdout as clean pipes for the
TCP socket. `stty -echo` suppresses the PTY echoing input back as output.

## Auth Flow

1. `kiro-cli login` on your local machine (once per ~90 days)
2. Push sqlite to Secrets Manager:
   ```bash
   python3 -c "
   import sqlite3, json
   db = sqlite3.connect('$HOME/.local/share/kiro-cli/data.sqlite3')
   rows = [{'key': k, 'value': v} for k,v in db.execute('SELECT key, value FROM auth_kv')]
   print(json.dumps(rows))
   " | aws secretsmanager put-secret-value \
     --secret-id kiro/auth-sqlite \
     --region us-east-1 --profile workshop-new \
     --secret-string file:///dev/stdin
   ```
3. ECS injects `KIRO_AUTH_JSON` at task startup (native secrets injection)
4. Bootstrap writes rows to sqlite; kiro-cli auto-refreshes the access token
   using the refresh token (valid ~90 days, needs outbound internet)

See `docs/AUTH_FLOW.md` for full details.

## Session Persistence

The orchestrator stores session history in `~/.kiro-assistant/sessions.db`
(SQLite). On each turn completion the DB is pushed to S3:

```
s3://kiro-logs-441262788356/orchestrator/sessions.db
```

On startup, if no local DB exists, it's pulled from S3. RPO ≈ one turn.

## Environment Variables

### Orchestrator

| Variable | Value | Description |
|----------|-------|-------------|
| `ECS_RUNNER_ENABLED` | `true` | Use ECS runner |
| `ECS_CLUSTER` | `relay` | ECS cluster |
| `ECS_SUBAGENT_TASK_FAMILY` | `kiro-subagent:14` | Sub-agent task def |
| `ECS_SUBAGENT_SUBNETS` | subnet IDs | Subnets for sub-agent tasks |
| `ECS_SUBAGENT_SECURITY_GROUP` | sg ID | SG for sub-agent tasks |
| `SESSIONS_S3_URI` | `s3://kiro-logs-441262788356/orchestrator/sessions.db` | S3 checkpoint |
| `PORT` | `3001` | Server port |

### Sub-Agent

| Variable | Source | Description |
|----------|--------|-------------|
| `KIRO_AUTH_JSON` | Secrets Manager (native injection) | Auth rows JSON array |
| `AWS_REGION` | env | AWS region |

## Deployed Resources

| Resource | ID / Name |
|----------|-----------|
| CloudFront distribution | `E24FG97RNBIWE6` |
| CloudFront domain | `d2je3ke9qxkat0.cloudfront.net` |
| Custom domain | `relay.xrusjohn.people.aws.dev` |
| ALB | `relay-alb-699132099.us-east-1.elb.amazonaws.com` |
| ECS cluster | `relay` |
| Orchestrator service | `relay-orchestrator` |
| ECR (subagent) | `441262788356.dkr.ecr.us-east-1.amazonaws.com/relay` |
| ECR (orchestrator) | `441262788356.dkr.ecr.us-east-1.amazonaws.com/relay-server` |
| Secrets Manager | `kiro/auth-sqlite` |
| S3 checkpoint | `s3://kiro-logs-441262788356/orchestrator/sessions.db` |
