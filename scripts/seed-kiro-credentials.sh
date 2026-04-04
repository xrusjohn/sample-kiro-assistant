#!/bin/bash
#
# seed-kiro-credentials.sh — One-time setup for AgentCore Identity Token Vault
#
# Creates the workload identity and API key credential provider, then stores
# kiro-cli's device-registration credentials as a JSON-encoded API key.
#
# Prerequisites:
#   - AWS CLI configured with admin-level permissions
#   - kiro-cli authenticated locally (has ~/.kiro/auth/device-registration.json)
#   - jq installed
#
# Usage:
#   ./seed-kiro-credentials.sh [--region us-east-1] [--provider-name kiro-cli-creds] [--workload-name kiro-subagent]
#

set -euo pipefail

# Defaults
REGION="${AWS_REGION:-us-east-1}"
PROVIDER_NAME="kiro-cli-creds"
WORKLOAD_NAME="kiro-subagent"
KIRO_AUTH_FILE="$HOME/.kiro/auth/device-registration.json"

# Parse args
while [ $# -gt 0 ]; do
  case "$1" in
    --region)       REGION="$2"; shift 2 ;;
    --provider-name) PROVIDER_NAME="$2"; shift 2 ;;
    --workload-name) WORKLOAD_NAME="$2"; shift 2 ;;
    --auth-file)    KIRO_AUTH_FILE="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

echo "=== AgentCore Identity Token Vault Seed ==="
echo "Region:        $REGION"
echo "Provider:      $PROVIDER_NAME"
echo "Workload:      $WORKLOAD_NAME"
echo "Auth file:     $KIRO_AUTH_FILE"
echo ""

# Validate auth file exists
if [ ! -f "$KIRO_AUTH_FILE" ]; then
  echo "ERROR: $KIRO_AUTH_FILE not found." >&2
  echo "Run 'kiro-cli' locally and authenticate first." >&2
  exit 1
fi

# Validate it has required fields
for field in client_id client_secret refresh_token; do
  val=$(jq -r ".$field // empty" "$KIRO_AUTH_FILE")
  if [ -z "$val" ]; then
    echo "ERROR: Missing '$field' in $KIRO_AUTH_FILE" >&2
    exit 1
  fi
done

# Build the API key payload — JSON-encode the credential bundle
# Add expires_at if not present (90 days from now)
API_KEY_JSON=$(jq -c '{
  client_id: .client_id,
  client_secret: .client_secret,
  refresh_token: .refresh_token,
  issuer_url: (.issuer_url // "https://auth.kiro.dev"),
  expires_at: (.expires_at // (now + 7776000 | strftime("%Y-%m-%dT%H:%M:%SZ")))
}' "$KIRO_AUTH_FILE")

echo "--- Step 1: Create workload identity '$WORKLOAD_NAME' ---"
aws bedrock-agentcore-control create-workload-identity \
  --name "$WORKLOAD_NAME" \
  --region "$REGION" \
  --output json 2>/dev/null && echo "Created." || echo "Already exists (OK)."

echo ""
echo "--- Step 2: Create API key credential provider '$PROVIDER_NAME' ---"
aws bedrock-agentcore-control create-api-key-credential-provider \
  --name "$PROVIDER_NAME" \
  --api-key "$API_KEY_JSON" \
  --region "$REGION" \
  --output json && echo "Created." || {
  echo "Provider may already exist. Updating..."
  aws bedrock-agentcore-control update-api-key-credential-provider \
    --name "$PROVIDER_NAME" \
    --api-key "$API_KEY_JSON" \
    --region "$REGION" \
    --output json
  echo "Updated."
}

echo ""
echo "--- Step 3: Verify retrieval ---"
echo "Getting workload access token..."
WIT=$(aws bedrock-agentcore get-workload-access-token \
  --workload-name "$WORKLOAD_NAME" \
  --region "$REGION" \
  --query 'token' --output text 2>/dev/null || \
  aws bedrock-agentcore get-workload-access-token \
  --workload-name "$WORKLOAD_NAME" \
  --region "$REGION" \
  --query 'workloadAccessToken' --output text)

echo "Retrieving API key..."
RETRIEVED=$(aws bedrock-agentcore get-resource-api-key \
  --resource-credential-provider-name "$PROVIDER_NAME" \
  --workload-identity-token "$WIT" \
  --region "$REGION" \
  --query 'apiKey' --output text)

# Validate round-trip
if echo "$RETRIEVED" | jq -e '.client_id' > /dev/null 2>&1; then
  echo "Round-trip verification PASSED"
else
  echo "ERROR: Retrieved value is not valid JSON" >&2
  exit 1
fi

echo ""
echo "=== Done ==="
echo ""
echo "Set these env vars on your ECS task definition:"
echo "  KIRO_CREDENTIAL_PROVIDER=$PROVIDER_NAME"
echo "  KIRO_WORKLOAD_NAME=$WORKLOAD_NAME"
echo ""
echo "IAM policy needed on ECS task role:"
cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock-agentcore:GetWorkloadAccessToken",
        "bedrock-agentcore:GetResourceApiKey",
        "secretsmanager:GetSecretValue"
      ],
      "Resource": [
        "arn:aws:bedrock-agentcore:${REGION}:*:workload-identity-directory/default/workload-identity/${WORKLOAD_NAME}",
        "arn:aws:bedrock-agentcore:${REGION}:*:workload-identity-directory/default",
        "arn:aws:bedrock-agentcore:${REGION}:*:token-vault/default/apikeycredentialprovider/${PROVIDER_NAME}",
        "arn:aws:bedrock-agentcore:${REGION}:*:token-vault/default",
        "arn:aws:secretsmanager:${REGION}:*:secret:bedrock-agentcore-identity!default/apikey/${PROVIDER_NAME}*"
      ]
    }
  ]
}
EOF
