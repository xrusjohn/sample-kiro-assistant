#!/bin/bash
#
# seed-kiro-credentials.sh — One-time setup for AgentCore Identity Token Vault
#
# Reads kiro-cli auth from its local sqlite DB, creates the AgentCore Identity
# workload identity and API key credential provider, and stores the auth bundle.
#
# Prerequisites:
#   - AWS CLI configured with appropriate permissions
#   - kiro-cli authenticated locally (has data.sqlite3 with auth_kv)
#   - jq, sqlite3, python3 installed
#
# Usage:
#   ./scripts/seed-kiro-credentials.sh [--region us-east-1]
#
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
PROVIDER_NAME="kiro-cli-creds"
WORKLOAD_NAME="kiro-subagent"
KIRO_DB="$HOME/.local/share/kiro-cli/data.sqlite3"

while [ $# -gt 0 ]; do
  case "$1" in
    --region)        REGION="$2"; shift 2 ;;
    --provider-name) PROVIDER_NAME="$2"; shift 2 ;;
    --workload-name) WORKLOAD_NAME="$2"; shift 2 ;;
    --db)            KIRO_DB="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

echo "=== AgentCore Identity Token Vault Seed ==="
echo "Region:    $REGION"
echo "Provider:  $PROVIDER_NAME"
echo "Workload:  $WORKLOAD_NAME"
echo "DB:        $KIRO_DB"
echo ""

# Validate DB exists and has auth
if [ ! -f "$KIRO_DB" ]; then
  echo "ERROR: $KIRO_DB not found. Run 'kiro-cli' and authenticate first." >&2
  exit 1
fi

DEV_REG=$(sqlite3 "$KIRO_DB" "SELECT value FROM auth_kv WHERE key='kirocli:odic:device-registration';" 2>/dev/null || true)
TOKEN=$(sqlite3 "$KIRO_DB" "SELECT value FROM auth_kv WHERE key='kirocli:odic:token';" 2>/dev/null || true)

if [ -z "$DEV_REG" ]; then
  echo "ERROR: No device-registration found in DB. Authenticate kiro-cli first." >&2
  exit 1
fi
if [ -z "$TOKEN" ]; then
  echo "ERROR: No token found in DB. Authenticate kiro-cli first." >&2
  exit 1
fi

# Build the API key payload — both rows as a JSON array (same format bootstrap-auth.sh writes)
API_KEY_JSON=$(python3 -c "
import json
rows = [
    {'key': 'kirocli:odic:device-registration', 'value': '''$DEV_REG'''},
    {'key': 'kirocli:odic:token', 'value': '''$TOKEN'''},
]
print(json.dumps(rows))
")

echo "--- Step 1: Create workload identity '$WORKLOAD_NAME' ---"
aws bedrock-agentcore-control create-workload-identity \
  --name "$WORKLOAD_NAME" \
  --region "$REGION" \
  --no-cli-pager --output json 2>/dev/null && echo "Created." || echo "Already exists (OK)."

echo ""
echo "--- Step 2: Create/update API key credential provider '$PROVIDER_NAME' ---"
if aws bedrock-agentcore-control create-api-key-credential-provider \
  --name "$PROVIDER_NAME" \
  --api-key "$API_KEY_JSON" \
  --region "$REGION" \
  --no-cli-pager --output json 2>/dev/null; then
  echo "Created."
else
  echo "Provider exists. Updating..."
  aws bedrock-agentcore-control update-api-key-credential-provider \
    --name "$PROVIDER_NAME" \
    --api-key "$API_KEY_JSON" \
    --region "$REGION" \
    --no-cli-pager --output json 2>/dev/null
  echo "Updated."
fi

echo ""
echo "--- Step 3: Verify retrieval ---"
WIT=$(aws bedrock-agentcore get-workload-access-token \
  --workload-name "$WORKLOAD_NAME" \
  --region "$REGION" \
  --output json 2>/dev/null | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(d.get('token', d.get('workloadAccessToken', '')))")

if [ -z "$WIT" ]; then
  echo "ERROR: Could not get workload access token." >&2
  exit 1
fi

RETRIEVED=$(aws bedrock-agentcore get-resource-api-key \
  --resource-credential-provider-name "$PROVIDER_NAME" \
  --workload-identity-token "$WIT" \
  --region "$REGION" \
  --query 'apiKey' --output text 2>/dev/null || true)

if echo "$RETRIEVED" | python3 -c "import json,sys; d=json.load(sys.stdin); assert isinstance(d, list)" 2>/dev/null; then
  echo "Round-trip verification PASSED"
else
  echo "WARNING: Round-trip verification failed. Check API key format." >&2
fi

echo ""
echo "=== Done ==="
echo ""
echo "ECS task definition env vars:"
echo "  KIRO_CREDENTIAL_PROVIDER=$PROVIDER_NAME"
echo "  KIRO_WORKLOAD_NAME=$WORKLOAD_NAME"
