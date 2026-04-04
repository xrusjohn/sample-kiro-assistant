#!/bin/bash
#
# run-local-subagent.sh — Build and run a sub-agent container locally
#
# Usage:
#   ./scripts/run-local-subagent.sh kiro      # kiro-cli sub-agent on :8080
#   ./scripts/run-local-subagent.sh claude     # claude-code sub-agent on :8080
#
set -euo pipefail

AGENT="${1:-}"
PORT="${PORT:-8080}"

if [ -z "$AGENT" ] || { [ "$AGENT" != "kiro" ] && [ "$AGENT" != "claude" ]; }; then
  echo "Usage: $0 <kiro|claude>"
  exit 1
fi

cd "$(dirname "$0")/.."

if [ "$AGENT" = "kiro" ]; then
  IMAGE="kiro-subagent-local"
  DOCKERFILE="Dockerfile.kiro-cli"

  echo "=== Building $IMAGE ==="
  docker build -f "$DOCKERFILE" -t "$IMAGE" .

  # Determine auth flags
  AUTH_FLAGS=()
  if [ -n "${KIRO_CREDENTIAL_PROVIDER:-}" ]; then
    echo "Auth: AgentCore Identity (KIRO_CREDENTIAL_PROVIDER=$KIRO_CREDENTIAL_PROVIDER)"
    AUTH_FLAGS+=(-e "KIRO_CREDENTIAL_PROVIDER=$KIRO_CREDENTIAL_PROVIDER")
    AUTH_FLAGS+=(-e "KIRO_WORKLOAD_NAME=${KIRO_WORKLOAD_NAME:-kiro-subagent}")
    AUTH_FLAGS+=(-v "$HOME/.aws:/home/kiro/.aws:ro")
  elif [ -n "${KIRO_AUTH_SECRET_ARN:-}" ]; then
    echo "Auth: Secrets Manager (KIRO_AUTH_SECRET_ARN)"
    AUTH_FLAGS+=(-e "KIRO_AUTH_SECRET_ARN=$KIRO_AUTH_SECRET_ARN")
    AUTH_FLAGS+=(-v "$HOME/.aws:/home/kiro/.aws:ro")
  elif [ -f "$HOME/.local/share/kiro-cli/data.sqlite3" ]; then
    echo "Auth: local kiro-cli auth DB (mounted read-only)"
    AUTH_FLAGS+=(-v "$HOME/.local/share/kiro-cli/data.sqlite3:/home/kiro/.local/share/kiro-cli/data.sqlite3:ro")
  else
    echo "WARNING: No auth source found. Container will fail at bootstrap."
    echo "  Options: set KIRO_CREDENTIAL_PROVIDER, KIRO_AUTH_SECRET_ARN, or authenticate kiro-cli locally."
  fi

  echo "=== Running $IMAGE on :$PORT ==="
  exec docker run --rm -it \
    -p "$PORT:8080" \
    -e "AWS_REGION=${AWS_REGION:-us-east-1}" \
    "${AUTH_FLAGS[@]}" \
    "$IMAGE"

else
  IMAGE="claude-subagent-local"
  DOCKERFILE="Dockerfile.claude-code"

  echo "=== Building $IMAGE ==="
  docker build -f "$DOCKERFILE" -t "$IMAGE" .

  echo "=== Running $IMAGE on :$PORT ==="
  exec docker run --rm -it \
    -p "$PORT:8080" \
    -e "AWS_REGION=${AWS_REGION:-us-east-1}" \
    -v "$HOME/.aws:/home/agent/.aws:ro" \
    "$IMAGE"
fi
