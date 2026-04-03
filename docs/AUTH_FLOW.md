# kiro-cli Auth Flow

## Overview

kiro-cli uses AWS Identity Center (SSO/OIDC) for authentication. There are two
token layers:

| Token | Lifetime | Stored in |
|-------|----------|-----------|
| SSO session (device registration) | 30–90 days | `auth_kv` → `kirocli:odic:device-registration` |
| Access token | ~8–12 hours | `auth_kv` → `kirocli:odic:token` |
| Refresh token | tied to SSO session | same row as access token |

## Login cadence

- **`kiro-cli login`** — only needed once per SSO session (every 30–90 days,
  depending on your Identity Center policy). This opens a browser and writes
  both the device registration and the initial token to the sqlite DB.
- **Token refresh** — kiro-cli refreshes the access token automatically using
  the refresh token. This happens transparently when the access token expires.
  It requires outbound internet access to the Identity Center endpoint.
  No user interaction needed.

## sqlite DB location

```
~/.local/share/kiro-cli/data.sqlite3
```

Tables used for auth:
- `auth_kv` — key/value store for tokens
  - `kirocli:odic:device-registration` — client_id, client_secret, SSO config
  - `kirocli:odic:token` — access_token, refresh_token, expires_at, region, start_url

## Container requirements

1. **Read-write sqlite** — kiro-cli must be able to write the refreshed access
   token back to the DB. A read-only mount will cause silent auth failure after
   the first token expiry.

2. **Internet access** — needed to call the Identity Center token endpoint for
   refresh. The ECS task runs in a public subnet with `assignPublicIp=ENABLED`,
   so this is satisfied.

3. **Fresh-enough sqlite** — the sqlite must contain a valid refresh token
   (i.e. the SSO session must not have expired). The access token itself can be
   expired — kiro-cli will refresh it on first use.

## Bootstrap flow (ECS container)

```
bootstrap-auth.sh
  ├── KIRO_AUTH_SECRET_ARN set?
  │     └── yes → pull sqlite bytes from Secrets Manager → write to DB_PATH
  ├── KIRO_TOKEN_VAULT_ENDPOINT set?
  │     └── yes → fetch OIDC credentials from AgentCore vault → write rows
  ├── KIRO_AUTH_S3_URI set?
  │     └── yes → aws s3 cp → write to DB_PATH
  └── none set → use existing DB_PATH (must be pre-mounted)
  
  → exec node /home/kiro/acp-bridge.js
       └── spawns kiro-cli acp (via Python PTY)
             └── kiro-cli auto-refreshes token on startup if expired
```

## Recommended ECS setup

Store the sqlite in Secrets Manager (binary secret) and set `KIRO_AUTH_SECRET_ARN`.
The bootstrap copies it to a writable path so kiro-cli can refresh the token.

```bash
# One-time: seed the secret after kiro-cli login
aws secretsmanager put-secret-value \
  --secret-id kiro/auth-sqlite \
  --secret-binary fileb://~/.local/share/kiro-cli/data.sqlite3
```

The secret only needs to be re-seeded when the SSO session expires (30–90 days).
Token refreshes happen in-container and don't require updating the secret.

## Local test procedure

```bash
# 1. Ensure kiro-cli is logged in locally
kiro-cli login   # only if session expired

# 2. Copy sqlite with rw permissions
cp ~/.local/share/kiro-cli/data.sqlite3 /tmp/kiro-auth.sqlite3
chmod 644 /tmp/kiro-auth.sqlite3

# 3. Run container bypassing bootstrap (for quick iteration)
docker run --rm --entrypoint bash \
  -v /tmp/kiro-auth.sqlite3:/home/kiro/.local/share/kiro-cli/data.sqlite3 \
  relay-test -c "
    node /home/kiro/acp-bridge.js &
    sleep 4
    node -e \"
      const net = require('net');
      const s = net.createConnection({host:'127.0.0.1', port:8080});
      s.on('connect', () => s.write(JSON.stringify({jsonrpc:'2.0',id:1,
        method:'initialize',params:{protocolVersion:1,
        clientInfo:{name:'t',version:'0.1'},clientCapabilities:{}}}) + '\n'));
      s.on('data', d => { console.log(d.toString().slice(0,200)); process.exit(0); });
      setTimeout(() => process.exit(1), 10000);
    \"
  "
```

## Known issues

- **Read-only mount** — if the sqlite is mounted `:ro`, kiro-cli cannot write
  the refreshed token and will fail with "not logged in" after the access token
  expires (~8–12h). Always mount read-write.
- **Expired access token at startup** — kiro-cli needs internet to refresh.
  If the container has no outbound internet, it will fail even with a valid
  refresh token.
- **PTY echo mangling JSON** — the Python PTY bridge must disable echo on the
  master fd before writing JSON-RPC messages, otherwise the PTY line discipline
  strips double-quotes from the echoed input.
