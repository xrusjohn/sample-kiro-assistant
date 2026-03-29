# Requirements: AgentCore Identity OBO Experiment

## Overview

Experiment with AgentCore Identity's On-Behalf-Of (OBO) authentication to give AI agents properly-scoped, auditable tokens for accessing internal Amazon services. The goal is to replace fragile cookie forwarding with proper OAuth token exchange, and understand the credential lifecycle for graceful degradation.

## Background

Today, agents on CDM/CDD access internal tools using the user's raw Midway cookie. This is fragile (cookie expires, no audit trail of agent vs human actions, security concerns around cookie forwarding). AgentCore Identity + Federate A5 OBO provides a proper delegation model: human authenticates once, agent gets a scoped token that says "agent X acting on behalf of user Y."

## Requirements

### Requirement 1: Agent Identity Registration

**User Story:** As a developer, I want to register an agent identity with AgentCore so that the agent has its own workload identity (ARN) separate from my personal credentials.

**Acceptance Criteria:**
- [ ] An AgentCore agent identity is created in an Isengard-managed AWS account
- [ ] The agent has its own IAM execution role
- [ ] The agent identity is visible in the AgentCore console
- [ ] Document the registration steps for reproducibility

### Requirement 2: Federate OBO Token Exchange

**User Story:** As a developer, I want to exchange my Midway session for an OBO token scoped to the agent, so that the agent can call internal services on my behalf without holding my raw credentials.

**Acceptance Criteria:**
- [ ] A Federate service profile is created (OIDC) for the agent
- [ ] The token exchange flow works: Midway cookie → Federate ID token → OBO access token
- [ ] The OBO token's `sub` claim is the user, `act` claim is the agent
- [ ] Document the token exchange request/response for reproducibility

### Requirement 3: Internal Service Access via OBO Token

**User Story:** As a developer, I want the agent to call at least one Midway-protected internal service using the OBO token, proving the delegation model works end-to-end.

**Acceptance Criteria:**
- [ ] The agent successfully calls a Midway-protected API using the OBO token (test target: Outlook/Exchange API or an internal wiki endpoint)
- [ ] The request is authenticated as "user via agent" (not just "user")
- [ ] Access is equivalent to what the user would have directly

### Requirement 4: Token Lifecycle Observation

**User Story:** As a developer, I want to understand the OBO token's lifecycle so that I can design graceful degradation around it.

**Acceptance Criteria:**
- [ ] Document: OBO token TTL (how long before it expires?)
- [ ] Document: Can the OBO token be refreshed without user re-authentication?
- [ ] Document: What happens when the underlying Midway session expires — does the OBO token survive?
- [ ] Document: What error does the internal service return when the OBO token expires?
- [ ] Implement a simple token health check that reports time-to-expiry

### Requirement 5: Integration with Kiro Assistant

**User Story:** As a developer, I want to wire the OBO token into the Kiro Assistant session manager so that ACP agents use it instead of raw cookies.

**Acceptance Criteria:**
- [ ] The session manager can initiate the OBO token exchange when a user starts a session
- [ ] The OBO token is passed to the ACP agent's environment (or available via a local token endpoint)
- [ ] When the token expires, the session shows a clear "re-authenticate" message (graceful degradation)
- [ ] When the user re-authenticates, the token refreshes and the session resumes

## Correctness Properties

- CP-1: The agent must never hold or transmit the user's raw Midway cookie.
- CP-2: The OBO token must be scoped — it should not grant broader access than the user has.
- CP-3: Token expiry must result in clear, actionable feedback to the user, not silent failures.
- CP-4: The experiment must work on CDM (primary) and should be portable to AgentSpaces/ECS later.

## Out of Scope (for this experiment)

- Multi-user support
- ECS deployment
- Agent-to-agent delegation
- Autonomous (2LO) agent operations without human session
- Production hardening
