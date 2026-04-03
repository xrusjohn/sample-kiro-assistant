#!/bin/bash
# scripts/agentcore-entrypoint.sh
# AgentCore Runtime entrypoint: Token Vault → bootstrap fallback → start a2a-adapter
set -euo pipefail

# Token Vault is a REST endpoint, not env var injection.
# bootstrap-auth.sh already handles KIRO_TOKEN_VAULT_ENDPOINT.
# This entrypoint just ensures we start the a2a-adapter instead of acp-bridge.

# Run bootstrap (handles Token Vault, KIRO_AUTH_JSON, Secrets Manager, S3 fallbacks)
exec /home/kiro/bootstrap-auth.sh node /home/kiro/a2a-adapter.js
