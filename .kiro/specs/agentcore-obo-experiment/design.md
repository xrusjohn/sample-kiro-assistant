# AgentCore Identity OBO Experiment — Design

## Token Exchange Flow

Based on the A5 OBO Authentication design and AgentCore Identity docs:

```
┌──────────┐     ┌───────────┐     ┌──────────────┐     ┌─────────────┐
│  User     │     │  Kiro     │     │  Federate    │     │  Internal   │
│  Browser  │     │  Assistant │     │  (IdP)       │     │  Service    │
└─────┬─────┘     └─────┬─────┘     └──────┬───────┘     └──────┬──────┘
      │                 │                   │                    │
      │ 1. Midway auth  │                   │                    │
      │ (already done)  │                   │                    │
      │                 │                   │                    │
      │ 2. Open session │                   │                    │
      ├────────────────►│                   │                    │
      │                 │                   │                    │
      │                 │ 3. Token exchange  │                    │
      │                 │ (SigV4 + ID token)│                    │
      │                 ├──────────────────►│                    │
      │                 │                   │                    │
      │                 │ 4. OBO access token│                    │
      │                 │◄──────────────────┤                    │
      │                 │                   │                    │
      │                 │ 5. Call with OBO token                 │
      │                 ├───────────────────────────────────────►│
      │                 │                   │                    │
      │                 │ 6. Response (authed as user-via-agent) │
      │                 │◄───────────────────────────────────────┤
```

### Step 3 Detail: Token Exchange Request

```http
POST https://idp.federate.amazon.com/token HTTP/1.1
Content-Type: application/x-www-form-urlencoded
Authorization: SigV4 (agent's IAM role)

grant_type=urn:ietf:params:oauth:grant-type:token-exchange
&subject_token=<user's Federate ID token>
&subject_token_type=urn:ietf:params:oauth:token-type:id_token
&requested_token_type=urn:ietf:params:oauth:token-type:jwt
&audience=<target service audience>
```

### Step 4 Detail: OBO Token Claims

```json
{
  "authn_provider": "MIDWAY",
  "sub": "xrusjohn",
  "act": {
    "sub": "arn:aws:iam::ACCOUNT:role/KiroAssistantAgentRole",
    "client_id": "kiro-assistant"
  },
  "aud": "<target service>",
  "exp": 1758010522,
  "iss": "https://idp.federate.amazon.com"
}
```

## Prerequisites

### 1. AWS Account (Isengard)

Need an Isengard-managed account with:
- IAM role for the agent (`KiroAssistantAgentRole`)
- Permissions to call AgentCore APIs and Federate token exchange

### 2. Federate Service Profile

- Create via Federate onboarding: https://w.amazon.com/bin/view/AmazonFederate/help/Onboarding
- Protocol: OIDC
- Note the client ID for token exchange

### 3. AgentCore Agent Registration

```bash
# Create agent runtime (via AWS CLI or CDK)
aws bedrock-agentcore create-agent-runtime \
  --agent-name kiro-assistant-obo-experiment \
  --execution-role-arn arn:aws:iam::ACCOUNT:role/KiroAssistantAgentRole
```

### 4. CDM Environment

- kiro-cli installed and authenticated
- Node.js 18+ for the session manager
- Access to internal services for testing (Outlook API as target)

## Implementation Plan

### Phase 1: Manual Token Exchange (prove the flow)

Write a standalone Node.js script that:
1. Reads the local Midway cookie (`~/.midway/cookie`)
2. Exchanges it for a Federate ID token
3. Performs OBO token exchange using the agent's IAM role
4. Calls an internal API with the OBO token
5. Logs the token claims, TTL, and response

This validates the flow before integrating into Kiro Assistant.

### Phase 2: Token Manager Module

Create `src/server/token-manager.ts`:

```typescript
interface TokenState {
  oboToken: string | null;
  expiresAt: number;          // unix timestamp
  userId: string;
  agentId: string;
  status: "valid" | "expiring" | "expired" | "error";
}

class TokenManager {
  // Exchange Midway session for OBO token
  async exchange(midwayCookie: string): Promise<TokenState>;

  // Refresh if possible (depends on Federate refresh token support)
  async refresh(): Promise<TokenState>;

  // Check health — time to expiry, status
  getHealth(): { status: string; expiresInSeconds: number | null };

  // Get current token for use in requests
  getToken(): string | null;
}
```

### Phase 3: Wire into Session Manager

- On session start: if user has active Midway session, perform token exchange
- Store token in TokenManager (in-memory, per-server-process)
- Pass token to ACP agent environment or expose via local endpoint
- Periodic health check → emit `session.metadata` with token status
- On expiry → emit degradation event to UI

### Phase 4: Graceful Degradation UI

Add to the status bar:
```
Kiro · Claude Opus 4.6 · ◔ 17% · 🔑 OBO 47m remaining · ~/projects/...
```

When expired:
```
Kiro · Claude Opus 4.6 · ◔ 17% · ⚠️ Re-authenticate to access internal tools · ~/projects/...
```

## Open Questions (to answer during experiment)

1. **Token TTL**: How long does the Federate OBO token last? (A5 docs suggest ~15 min for access tokens, but refresh tokens may extend this)
2. **Refresh flow**: Can we get a refresh token from Federate to extend the session without user interaction?
3. **Midway dependency**: When the underlying Midway session expires, can existing OBO tokens still be refreshed?
4. **Service compatibility**: Which internal services accept Federate OBO tokens today? (Outlook/Exchange? Internal wikis? Code.amazon.com?)
5. **AgentSpaces**: Does AgentSpaces provide any built-in token exchange that we could leverage instead of rolling our own?

## References

- [AgentCore Identity docs](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/identity.html)
- [AgentCore Inbound Authentication](https://w.amazon.com/bin/view/AmazonFederate/help/AgentCoreInboundAuthentication/)
- [A5 OBO Authentication Design](https://w.amazon.com/bin/view/A5/A5-human-on-behalf-of/)
- [Federate Onboarding](https://w.amazon.com/bin/view/AmazonFederate/help/Onboarding)
- [AgentCore Identity Broadcast](https://broadcast.amazon.com/videos/1859426)
- [OAuth 2.0 Token Exchange RFC 8693](https://datatracker.ietf.org/doc/html/rfc8693)
- [OAuth 2.0 OBO for AI Agents Draft](https://datatracker.ietf.org/doc/draft-oauth-ai-agents-on-behalf-of-user/01/)
