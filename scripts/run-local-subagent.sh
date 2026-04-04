#!/bin/bash
#
# run-local-subagent.sh — Build and run a sub-agent container locally
#
# Usage:
#   ./scripts/run-local-subagent.sh kiro      # kiro-cli sub-agent on :8080
#   ./scripts/run-local-subagent.sh claude     # claude-code sub-agent on :8080
#   PORT=9090 ./scripts/run-local-subagent.sh kiro
#
set -euo pipefail

AGENT="${1:-}"
PORT="${PORT:-8080}"

if [ -z "$AGENT" ] || { [ "$AGENT" != "kiro" ] && [ "$AGENT" != "claude" ]; }; then
  echo "Usage: $0 <kiro|claude>"
  exit 1
fi

cd "$(dirname "$0")/.."

# Resolve AWS credentials for docker — profiles/SSO/credential_process don't work inside containers
resolve_aws_creds() {
  if [ -n "${AWS_ACCESS_KEY_ID:-}" ] && [ -n "${AWS_SECRET_ACCESS_KEY:-}" ]; then
    return 0  # already exported
  fi
  echo "Resolving AWS credentials for docker..."
  eval "$(aws configure export-credentials --format env 2>/dev/null)" || {
    echo "ERROR: Could not resolve AWS credentials. Run 'ada credentials update' or 'aws sso login'." >&2
    exit 1
  }
}

aws_cred_flags() {
  echo "-e" "AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID"
  echo "-e" "AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY"
  [ -n "${AWS_SESSION_TOKEN:-}" ] && echo "-e" "AWS_SESSION_TOKEN=$AWS_SESSION_TOKEN"
}

if [ "$AGENT" = "kiro" ]; then
  IMAGE="kiro-subagent-local"
  echo "=== Building $IMAGE ==="
  docker build -f Dockerfile.kiro-cli -t "$IMAGE" .

  # Auth source
  AUTH_FLAGS=()
  if [ -n "${KIRO_CREDENTIAL_PROVIDER:-}" ]; then
    echo "Auth: AgentCore Identity ($KIRO_CREDENTIAL_PROVIDER)"
    AUTH_FLAGS+=(-e "KIRO_CREDENTIAL_PROVIDER=$KIRO_CREDENTIAL_PROVIDER")
    AUTH_FLAGS+=(-e "KIRO_WORKLOAD_NAME=${KIRO_WORKLOAD_NAME:-kiro-subagent}")
  elif [ -n "${KIRO_AUTH_SECRET_ARN:-}" ]; then
    echo "Auth: Secrets Manager"
    AUTH_FLAGS+=(-e "KIRO_AUTH_SECRET_ARN=$KIRO_AUTH_SECRET_ARN")
  elif [ -n "${KIRO_AUTH_JSON:-}" ]; then
    echo "Auth: inline KIRO_AUTH_JSON"
    AUTH_FLAGS+=(-e "KIRO_AUTH_JSON=$KIRO_AUTH_JSON")
  else
    echo "ERROR: No auth source. Set one of:"
    echo "  KIRO_CREDENTIAL_PROVIDER  (run seed-kiro-credentials.sh first)"
    echo "  KIRO_AUTH_SECRET_ARN"
    echo "  KIRO_AUTH_JSON"
    exit 1
  fi

  resolve_aws_creds

  echo "=== Running $IMAGE on :$PORT ==="
  exec docker run --rm -it \
    -p "$PORT:8080" \
    -e "AWS_REGION=${AWS_REGION:-us-east-1}" \
    $(aws_cred_flags) \
    "${AUTH_FLAGS[@]}" \
    "$IMAGE"

else
  IMAGE="claude-subagent-local"
  echo "=== Building $IMAGE ==="
  docker build -f Dockerfile.claude-code -t "$IMAGE" .

  resolve_aws_creds

  echo "=== Running $IMAGE on :$PORT ==="
  exec docker run --rm -it \
    -p "$PORT:8080" \
    -e "AWS_REGION=${AWS_REGION:-us-east-1}" \
    $(aws_cred_flags) \
    "$IMAGE"
fi
