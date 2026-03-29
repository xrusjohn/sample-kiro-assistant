# AgentCore Identity OBO Experiment — Tasks

## Phase 1: Setup & Manual Proof-of-Concept

- [ ] 1a. Identify/create an Isengard AWS account for the experiment
- [ ] 1b. Create IAM role `KiroAssistantAgentRole` with permissions for Federate token exchange and AgentCore APIs
- [ ] 1c. Create Federate service profile (OIDC) — follow onboarding guide, note client ID
- [ ] 1d. Register agent identity with AgentCore (via CLI or console)
- [ ] 1e. Write standalone `scripts/obo-exchange-test.js` that:
  - Reads `~/.midway/cookie`
  - Exchanges for Federate ID token
  - Performs OBO token exchange using agent's IAM role
  - Logs token claims, TTL, `act` and `sub` fields
- [ ] 1f. Test: call one Midway-protected internal API with the OBO token
- [ ] 1g. Document findings: token TTL, refresh capability, error on expiry

## Phase 2: Token Manager Module

- [ ] 2a. Create `src/server/token-manager.ts` with `TokenManager` class
  - `exchange()`: Midway cookie → OBO token
  - `refresh()`: attempt token refresh without user re-auth
  - `getHealth()`: status + seconds until expiry
  - `getToken()`: current valid token or null
- [ ] 2b. Add token health to `GET /api/sessions/health` endpoint
- [ ] 2c. Emit token status in `session.metadata` events (alongside context usage and credits)

## Phase 3: Integration with Session Manager

- [ ] 3a. On session start: detect Midway session, perform token exchange
- [ ] 3b. Pass OBO token to ACP agent environment (env var or local token endpoint)
- [ ] 3c. Periodic token health check (every 60s) — refresh if expiring, emit degradation event if expired
- [ ] 3d. Test: agent calls internal service via MCP using OBO token instead of raw cookie

## Phase 4: Graceful Degradation UI

- [ ] 4a. Add token status to the prompt status bar (🔑 OBO Xm remaining)
- [ ] 4b. Show warning when token is expiring (< 5 min)
- [ ] 4c. Show "re-authenticate" message when token is expired
- [ ] 4d. On re-authentication: refresh token and resume session transparently

## Phase 5: Documentation

- [ ] 5a. Document the full setup process (account, Federate, AgentCore registration)
- [ ] 5b. Document token lifecycle findings (TTL, refresh, Midway dependency)
- [ ] 5c. Document which internal services accept OBO tokens today
- [ ] 5d. Write up portability notes for AgentSpaces and ECS
