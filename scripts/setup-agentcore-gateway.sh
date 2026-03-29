#!/usr/bin/env bash
set -euo pipefail

# === CONFIGURATION — fill these in ===
FEDERATE_CLIENT_ID="${FEDERATE_CLIENT_ID:?Set FEDERATE_CLIENT_ID to your Federate service profile client ID}"
REGION="${AWS_REGION:-us-west-2}"
GATEWAY_NAME="kiro-assistant-gateway"

# Integ Federate — switch to prod when ready
FEDERATE_DISCOVERY_URL="https://idp-integ.federate.amazon.com/.well-known/openid-configuration"
FEDERATE_AUTHORIZE_URL="https://idp-integ.federate.amazon.com/api/oauth2/v1/authorize"
FEDERATE_TOKEN_URL="https://idp-integ.federate.amazon.com/api/oauth2/v2/token"

echo "=== Creating AgentCore Gateway ==="
echo "  Name:       $GATEWAY_NAME"
echo "  Region:     $REGION"
echo "  Federate:   integ"
echo "  Client ID:  $FEDERATE_CLIENT_ID"
echo ""

# Check if gateway already exists
EXISTING=$(aws bedrock-agentcore-control list-gateways \
  --region "$REGION" \
  --query "items[?name=='$GATEWAY_NAME'].gatewayId" \
  --output text 2>/dev/null || echo "")

if [ -n "$EXISTING" ] && [ "$EXISTING" != "None" ]; then
  echo "Gateway already exists: $EXISTING"
  echo "Getting details..."
  aws bedrock-agentcore-control get-gateway \
    --gateway-identifier "$EXISTING" \
    --region "$REGION" \
    --output json | python3 -m json.tool
  exit 0
fi

# Create the gateway with Federate JWT auth
RESPONSE=$(aws bedrock-agentcore-control create-gateway \
  --name "$GATEWAY_NAME" \
  --description "Kiro Assistant gateway with Federate auth for internal tool access" \
  --protocol-type MCP \
  --authorizer-type CUSTOM_JWT \
  --authorizer-configuration "{
    \"customJWTAuthorizer\": {
      \"discoveryUrl\": \"$FEDERATE_DISCOVERY_URL\",
      \"allowedAudiences\": [\"$FEDERATE_CLIENT_ID\"]
    }
  }" \
  --region "$REGION" \
  --output json)

echo "$RESPONSE" | python3 -m json.tool

GATEWAY_ID=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['gatewayId'])")
echo ""
echo "=== Gateway created ==="
echo "  ID:  $GATEWAY_ID"
echo ""

# Wait for READY status
echo "Waiting for gateway to be READY..."
for i in $(seq 1 30); do
  STATUS=$(aws bedrock-agentcore-control get-gateway \
    --gateway-identifier "$GATEWAY_ID" \
    --region "$REGION" \
    --query "status" --output text 2>/dev/null || echo "UNKNOWN")
  if [ "$STATUS" = "READY" ]; then
    echo "✓ Gateway is READY"
    break
  fi
  echo "  Status: $STATUS (attempt $i/30)"
  sleep 5
done

# Get the gateway URL
GATEWAY_URL=$(aws bedrock-agentcore-control get-gateway \
  --gateway-identifier "$GATEWAY_ID" \
  --region "$REGION" \
  --query "gatewayUrl" --output text 2>/dev/null || echo "")

echo ""
echo "=== Next steps ==="
echo "  Gateway URL: $GATEWAY_URL"
echo ""
echo "  1. Add MCP targets (tools) to the gateway:"
echo "     aws bedrock-agentcore-control create-gateway-target \\"
echo "       --gateway-identifier $GATEWAY_ID \\"
echo "       --name outlook-mcp \\"
echo "       --region $REGION \\"
echo "       --target-configuration <config>"
echo ""
echo "  2. Test with a Federate token:"
echo "     FEDERATE_TOKEN=\$(scripts/get-federate-token.sh)"
echo "     curl -H \"Authorization: Bearer \$FEDERATE_TOKEN\" \\"
echo "       $GATEWAY_URL/mcp -d '{\"method\":\"tools/list\"}'"
echo ""
echo "  3. Federate OAuth URLs for clients:"
echo "     Authorize: $FEDERATE_AUTHORIZE_URL"
echo "     Token:     $FEDERATE_TOKEN_URL"
echo ""
echo "  Save these values:"
echo "    export GATEWAY_ID=$GATEWAY_ID"
echo "    export GATEWAY_URL=$GATEWAY_URL"
echo "    export FEDERATE_CLIENT_ID=$FEDERATE_CLIENT_ID"
