#!/bin/bash
set -euo pipefail

# Claude Code sub-agent entrypoint
# No auth bootstrap needed — IAM task role handles Bedrock auth

if [ "${AGENTCORE_RUNTIME:-}" = "true" ]; then
  echo "[entrypoint] AgentCore mode — starting A2A adapter on port 9000"
  exec node /home/agent/a2a-adapter.js
else
  echo "[entrypoint] ECS mode — starting ACP bridge on port 8080"
  exec node /home/agent/acp-bridge.js
fi
