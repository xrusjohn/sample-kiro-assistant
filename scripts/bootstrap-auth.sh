#!/bin/bash
set -euo pipefail

DATA_DIR="$HOME/.local/share/kiro-cli"
DB_PATH="$DATA_DIR/data.sqlite3"

mkdir -p "$DATA_DIR"

# Skip if auth already present AND no external source is configured
# (If KIRO_AUTH_SECRET_ARN is set, always refresh to pick up rotated tokens)
if [ -z "${KIRO_AUTH_SECRET_ARN:-}" ] && [ -z "${KIRO_TOKEN_VAULT_ENDPOINT:-}" ] && [ -z "${KIRO_AUTH_S3_URI:-}" ] && [ -z "${KIRO_AUTH_JSON:-}" ] && [ -z "${KIRO_CREDENTIAL_PROVIDER:-}" ]; then
  if [ -f "$DB_PATH" ] && sqlite3 "$DB_PATH" "SELECT 1 FROM auth_kv LIMIT 1" 2>/dev/null; then
    echo "[bootstrap] Auth DB already exists and no external source configured, skipping."
    if [ -n "${MIDWAY_COOKIE:-}" ]; then
      mkdir -p "$HOME/.midway"
      echo "$MIDWAY_COOKIE" > "$HOME/.midway/cookie"
      echo "[bootstrap] Midway cookie written."
    fi
    exec "$@"
  fi
fi

write_auth_rows() {
  # Expects JSON array of {key, value} on stdin
  sqlite3 "$DB_PATH" "CREATE TABLE IF NOT EXISTS auth_kv (key TEXT PRIMARY KEY, value TEXT);"
  python3 -c "
import json, sys, subprocess, os
rows = json.load(sys.stdin)
db = os.environ.get('DB_PATH', '$DB_PATH')
for row in rows:
    key = row['key'].replace(\"'\", \"''\")
    val = row['value'].replace(\"'\", \"''\")
    subprocess.run(['sqlite3', db, f\"INSERT OR REPLACE INTO auth_kv (key, value) VALUES ('{key}', '{val}');\"])
" DB_PATH="$DB_PATH"
}

# --- Source 1: AgentCore Identity Token Vault ---
if [ -n "${KIRO_TOKEN_VAULT_ENDPOINT:-}" ]; then
  echo "[bootstrap] Trying AgentCore Identity Token Vault: $KIRO_TOKEN_VAULT_ENDPOINT"

  # Get workload access token from ECS task metadata (container credentials)
  VAULT_RESPONSE=""
  if VAULT_RESPONSE=$(timeout 10 curl -sf \
    -H "Content-Type: application/json" \
    "${KIRO_TOKEN_VAULT_ENDPOINT}/credentials/kirocli-oidc" 2>/dev/null); then

    # Check if credentials are expired (device registration > 90 days)
    EXPIRED=$(echo "$VAULT_RESPONSE" | python3 -c "
import json, sys, time
try:
    data = json.load(sys.stdin)
    created = data.get('created_at', 0)
    if created and (time.time() - created) > 90 * 86400:
        print('true')
    else:
        print('false')
except:
    print('error')
" 2>/dev/null || echo "error")

    if [ "$EXPIRED" = "true" ]; then
      echo "[bootstrap] WARNING: Token Vault credentials expired (>90 days). Falling through to next source."
    elif [ "$EXPIRED" = "error" ]; then
      echo "[bootstrap] WARNING: Could not parse Token Vault response. Falling through."
    else
      # Transform vault response to auth_kv format and write
      echo "$VAULT_RESPONSE" | python3 -c "
import json, sys
data = json.load(sys.stdin)
rows = []
if 'device_registration' in data:
    rows.append({'key': 'kirocli:oidc:device-registration', 'value': json.dumps(data['device_registration'])})
if 'token' in data:
    rows.append({'key': 'kirocli:oidc:token', 'value': json.dumps(data['token'])})
json.dump(rows, sys.stdout)
" | write_auth_rows

      echo "[bootstrap] Auth loaded from Token Vault."
      # Write Midway cookie if provided
      if [ -n "${MIDWAY_COOKIE:-}" ]; then
        mkdir -p "$HOME/.midway"
        echo "$MIDWAY_COOKIE" > "$HOME/.midway/cookie"
        echo "[bootstrap] Midway cookie written."
      fi
      exec "$@"
    fi
  else
    echo "[bootstrap] Token Vault fetch failed (timeout or error). Trying next source."
  fi
fi

# --- Source 1b: AgentCore Identity API Key Credential Provider ---
# Uses workload identity token to retrieve a JSON-encoded credential bundle
# stored as an API key in AgentCore Identity Token Vault.
if [ -n "${KIRO_CREDENTIAL_PROVIDER:-}" ] && [ -n "${KIRO_WORKLOAD_NAME:-}" ]; then
  echo "[bootstrap] Trying AgentCore Identity API Key Provider: $KIRO_CREDENTIAL_PROVIDER"
  REGION="${AWS_REGION:-us-east-1}"

  # Step 1: Get workload access token
  WIT=$(aws bedrock-agentcore get-workload-access-token \
    --workload-name "$KIRO_WORKLOAD_NAME" \
    --region "$REGION" \
    --output json 2>/dev/null | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('token', d.get('workloadAccessToken', '')))" 2>/dev/null || true)

  if [ -n "$WIT" ]; then
    # Step 2: Get API key (JSON-encoded credential bundle)
    API_KEY=$(aws bedrock-agentcore get-resource-api-key \
      --resource-credential-provider-name "$KIRO_CREDENTIAL_PROVIDER" \
      --workload-identity-token "$WIT" \
      --region "$REGION" \
      --query 'apiKey' --output text 2>/dev/null || true)

    if [ -n "$API_KEY" ] && echo "$API_KEY" | python3 -c "import json,sys; json.load(sys.stdin)" 2>/dev/null; then
      # Check expiry
      DAYS_LEFT=$(echo "$API_KEY" | python3 -c "
import json, sys, time
data = json.load(sys.stdin)
# Handle both array-of-rows format and single-object format
if isinstance(data, list):
    for row in data:
        v = json.loads(row.get('value','{}'))
        exp = v.get('client_secret_expires_at', v.get('expires_at', ''))
        if exp:
            try:
                ts = int(exp) if str(exp).isdigit() else 0
                if ts > 0:
                    print(int((ts - time.time()) / 86400)); sys.exit()
            except: pass
    print(999)
else:
    print(999)" 2>/dev/null || echo 999)

      if [ "$DAYS_LEFT" -le 0 ] 2>/dev/null; then
        echo "[bootstrap] WARNING: AgentCore Identity credentials expired. Falling through."
      else
        [ "$DAYS_LEFT" -le 14 ] 2>/dev/null && echo "[bootstrap] WARNING: Credentials expire in ${DAYS_LEFT} days."
        # Pipe directly to write_auth_rows — seed script stores in [{key,value},...] format
        echo "$API_KEY" | python3 -c "
import json, sys
data = json.load(sys.stdin)
# If already array-of-rows, pass through. If single object, wrap it.
if isinstance(data, list):
    json.dump(data, sys.stdout)
else:
    json.dump([{'key': 'kirocli:oidc:device-registration', 'value': json.dumps(data)}], sys.stdout)
" | write_auth_rows

        echo "[bootstrap] Auth loaded from AgentCore Identity API Key Provider."
        if [ -n "${MIDWAY_COOKIE:-}" ]; then
          mkdir -p "$HOME/.midway"
          echo "$MIDWAY_COOKIE" > "$HOME/.midway/cookie"
          echo "[bootstrap] Midway cookie written."
        fi
        exec "$@"
      fi
    else
      echo "[bootstrap] AgentCore Identity API key fetch failed or invalid JSON. Falling through."
    fi
  else
    echo "[bootstrap] Workload access token fetch failed. Falling through."
  fi
fi

# --- Source 2: ECS native secrets injection (KIRO_AUTH_JSON env var) ---
if [ -n "${KIRO_AUTH_JSON:-}" ]; then
  echo "[bootstrap] Loading auth from KIRO_AUTH_JSON (ECS native injection)."
  echo "$KIRO_AUTH_JSON" | write_auth_rows
  echo "[bootstrap] Auth loaded."
  exec "$@"
fi

# --- Source 3: Secrets Manager (legacy fallback) ---
if [ -n "${KIRO_AUTH_SECRET_ARN:-}" ]; then
  echo "[bootstrap] Fetching auth from Secrets Manager: $KIRO_AUTH_SECRET_ARN"
  SECRET=$(aws secretsmanager get-secret-value --secret-id "$KIRO_AUTH_SECRET_ARN" --region "${AWS_REGION:-us-east-1}" --query SecretString --output text 2>&1 || true)
  if echo "$SECRET" | grep -q "error\|Error\|Exception" 2>/dev/null; then
    echo "[bootstrap] Secrets Manager error: ${SECRET:0:200}"
    SECRET=""
  fi
  if [ -n "$SECRET" ]; then
    echo "$SECRET" | write_auth_rows
    echo "[bootstrap] Auth loaded from Secrets Manager."
    if [ -n "${MIDWAY_COOKIE:-}" ]; then
      mkdir -p "$HOME/.midway"
      echo "$MIDWAY_COOKIE" > "$HOME/.midway/cookie"
      echo "[bootstrap] Midway cookie written."
    fi
    exec "$@"
  fi
  echo "[bootstrap] Secrets Manager fetch failed, trying next source."
fi

# --- Source 3: S3 ---
if [ -n "${KIRO_AUTH_S3_URI:-}" ]; then
  echo "[bootstrap] Fetching auth from S3: $KIRO_AUTH_S3_URI"
  if aws s3 cp "$KIRO_AUTH_S3_URI" "$DB_PATH"; then
    echo "[bootstrap] Auth loaded from S3."
    if [ -n "${MIDWAY_COOKIE:-}" ]; then
      mkdir -p "$HOME/.midway"
      echo "$MIDWAY_COOKIE" > "$HOME/.midway/cookie"
      echo "[bootstrap] Midway cookie written."
    fi
    exec "$@"
  fi
  echo "[bootstrap] S3 fetch failed, trying next source."
fi

# --- Source 4: Local file ---
if [ -n "${KIRO_AUTH_FILE:-}" ]; then
  echo "[bootstrap] Copying auth from local file: $KIRO_AUTH_FILE"
  if cp "$KIRO_AUTH_FILE" "$DB_PATH"; then
    echo "[bootstrap] Auth loaded from local file."
    if [ -n "${MIDWAY_COOKIE:-}" ]; then
      mkdir -p "$HOME/.midway"
      echo "$MIDWAY_COOKIE" > "$HOME/.midway/cookie"
      echo "[bootstrap] Midway cookie written."
    fi
    exec "$@"
  fi
  echo "[bootstrap] Local file copy failed."
fi

echo "[bootstrap] ERROR: No auth source available."
echo "[bootstrap] Set one of: KIRO_TOKEN_VAULT_ENDPOINT, KIRO_CREDENTIAL_PROVIDER+KIRO_WORKLOAD_NAME, KIRO_AUTH_SECRET_ARN, KIRO_AUTH_S3_URI, KIRO_AUTH_FILE"
exit 1
