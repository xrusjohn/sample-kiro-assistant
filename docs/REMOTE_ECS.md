# Remote Kiro ECS — Architecture & Deployment

## Overview

Run Kiro Assistant remotely on ECS, accessible from any machine via a thin CLI client or web browser. The orchestrator manages sessions and dispatches work to ephemeral kiro-cli sub-agent containers.

## Architecture

```
┌─────────────────────┐
│  Your Machine        │
│  (Windows/Mac/Linux) │
│                      │
│  kiro-remote CLI     │
│  or Web Browser      │
└──────────┬──────────┘
           │ HTTPS / WSS
           ▼
┌─────────────────────┐
│  CloudFront          │
│  kiro.xrusjohn.      │
│  people.aws.dev      │
│  (TLS termination,   │
│   WebSocket support)  │
└──────────┬──────────┘
           │ HTTP (origin-restricted)
           ▼
┌─────────────────────┐     ┌─────────────────────┐
│  ALB (internal)      │     │  AgentCore Identity  │
│  (only accepts       │     │  Token Vault         │
│   CloudFront traffic)│     └──────────┬──────────┘
└──────────┬──────────┘                │
           │ :3001                     │
           ▼                           │
┌─────────────────────┐                │
│  Orchestrator        │                │
│  (ECS Fargate svc)   │                │
│  Express + WebSocket │                │
│  + RunnerManager     │                │
└──────────┬──────────┘                │
           │ ECS RunTask               │
           ▼                           │
┌─────────────────────┐                │
│  Sub-Agent           │◄───────────────┘
│  (ECS Fargate task)  │  fetch auth at startup
│  kiro-cli acp        │
│  :8080 ACP/TCP       │
└─────────────────────┘
```

## Security Model

1. **CloudFront** terminates TLS using ACM cert `*.xrusjohn.people.aws.dev`
2. **ALB** is restricted to CloudFront-only traffic via:
   - AWS-managed CloudFront prefix list in security group
   - Custom origin header (`X-Origin-Verify`) shared secret
3. **Orchestrator** runs in private subnets, no public IP
4. **Sub-Agents** run in private subnets, only reachable from orchestrator on port 8080
5. **Auth** bootstrapped from AgentCore Identity Token Vault (primary) or Secrets Manager (fallback)

## Components

| Component | Location | Description |
|-----------|----------|-------------|
| ACP TCP Transport | `src/server/acp-tcp.ts` | Newline-delimited JSON-RPC over TCP sockets |
| ECS Runner | `src/server/ecs-runner.ts` | Launches ECS tasks, connects via ACP/TCP |
| CLI Client | `src/cli-client/kiro-remote.ts` | Thin REPL client with reconnect |
| Auth Bootstrap | `scripts/bootstrap-auth.sh` | Token Vault → Secrets Manager → S3 fallback |
| Docker Image | `Dockerfile.kiro-cli` | kiro-cli + bootstrap script |
| Infra Setup | `infra/setup.sh` | ECR, ECS, ALB, CloudFront, security groups, IAM |

## Environment Variables

### Orchestrator (ECS task)

| Variable | Default | Description |
|----------|---------|-------------|
| `ECS_RUNNER_ENABLED` | `false` | Set `true` to use ECS runner instead of local process |
| `ECS_CLUSTER` | `relay` | ECS cluster name |
| `ECS_SUBAGENT_TASK_FAMILY` | `kiro-subagent` | Sub-Agent task definition family |
| `ECS_SUBAGENT_SUBNETS` | required | Comma-separated subnet IDs for sub-agent tasks |
| `ECS_SUBAGENT_SECURITY_GROUP` | required | Security group for sub-agent tasks |
| `ECS_SUBAGENT_CONTAINER_PORT` | `8080` | Port sub-agent listens on |
| `ECS_SUBAGENT_STARTUP_TIMEOUT_MS` | `120000` | Max wait for task to reach RUNNING |
| `KIRO_MAX_SESSIONS` | `5` | Max concurrent sessions |
| `KIRO_IDLE_TIMEOUT_MINUTES` | `15` | Idle timeout before sub-agent shutdown |

### Sub-Agent (ECS task)

| Variable | Default | Description |
|----------|---------|-------------|
| `KIRO_TOKEN_VAULT_ENDPOINT` | none | AgentCore Identity Token Vault URL |
| `KIRO_AUTH_SECRET_ARN` | none | Secrets Manager ARN for auth fallback |
| `KIRO_AUTH_S3_URI` | none | S3 URI for auth sqlite file |
| `KIRO_SESSION_ID` | required | Session ID from orchestrator |
| `KIRO_MODEL` | none | Model selection |
| `KIRO_CWD` | `/workspace` | Working directory |
| `MIDWAY_COOKIE` | none | Midway cookie for internal access (optional) |

## Deployment

### Prerequisites

- AWS CLI configured with appropriate permissions
- Docker installed
- VPC with public and private subnets

### Quick Start

```bash
# Set required variables
export VPC_ID=vpc-0eca3b0efc598dc16
export SUBNET_IDS="subnet-0b7746dac5b0a0764,subnet-0ecfa05a0c9302f9e"
export PRIVATE_SUBNET_IDS="subnet-0c023c99dd96bf3bb,subnet-06005c0716da0c590"
export CERTIFICATE_ARN="arn:aws:acm:us-east-1:441262788356:certificate/9612cb7f-9768-4c30-a2b9-7f6da4ee594e"

# Run infrastructure setup
./infra/setup.sh

# Build and push container image
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 441262788356.dkr.ecr.us-east-1.amazonaws.com
docker build -t kiro-remote-ecr -f Dockerfile.kiro-cli .
docker tag kiro-remote-ecr:latest 441262788356.dkr.ecr.us-east-1.amazonaws.com/kiro-remote-ecr:latest
docker push 441262788356.dkr.ecr.us-east-1.amazonaws.com/kiro-remote-ecr:latest

# Connect from your machine
npx tsx src/cli-client/kiro-remote.ts --server https://kiro.xrusjohn.people.aws.dev
```

## Design Documents

- Requirements: `.kiro/specs/remote-kiro-ecs/requirements.md`
- Design: `.kiro/specs/remote-kiro-ecs/design.md`
- Tasks: `.kiro/specs/remote-kiro-ecs/tasks.md`
