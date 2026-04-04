#!/bin/bash
#
# run-local-subagent.sh — Build and run a sub-agent container locally
#
# Usage:
#   ./scripts/run-local-subagent.sh kiro      # kiro-cli sub-agent on :8080
#   ./scripts/run-local-subagent.sh claude     # claude-code sub-agent on :8080
#
set -euo pipefail

# Locate kiro-cli auth DB across platforms
find_kiro_db() {
  for p in \
    "$HOME/.local/share/kiro-cli/data.sqlite3" \
    "$HOME/Library/Application Support/kiro-cli/data.sqlite3" \
    "$HOME/.kiro-cli/data.sqlite3"; do
    [ -f "$p" ] && echo "$p" && return 0
  done
  return 1
}

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

  # Determine auth flags (same sources as ECS/AgentCore — no local sqlite mount)
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
  elif [ -n "${KIRO_AUTH_JSON:-}" ]; then
    echo "Auth: inline KIRO_AUTH_JSON"
    AUTH_FLAGS+=(-e "KIRO_AUTH_JSON=$KIRO_AUTH_JSON")
  else
    echo "ERROR: No auth source set."
    echo "  KIRO_CREDENTIAL_PROVIDER + KIRO_WORKLOAD_NAME  (AgentCore Identity)"
    echo "  KIRO_AUTH_SECRET_ARN                            (Secrets Manager)"
    echo "  KIRO_AUTH_JSON                                  (inline, for quick tests)"
    exit 1
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
