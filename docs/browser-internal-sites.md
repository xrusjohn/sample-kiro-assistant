# AgentCore Browser — Authenticated Internal Site Access

## Summary

We proved three patterns for agents to browse Midway-protected internal Amazon sites. Each has different tradeoffs around auth, infrastructure, and automation.

## Patterns

### 1. CDP Tunnel to Windows Chrome (zero-tap)

Agent drives your authenticated Windows Chrome via SSH tunnel + Chrome DevTools Protocol.

```
Agent (Linux) → CDP WebSocket → SSH tunnel → Windows Chrome (AEA authenticated)
```

- Auth: None needed — AEA extension handles everything
- Setup: `chrome.exe --remote-debugging-port=9222 --remote-allow-origins=*` + `ssh -N -R 9222:127.0.0.1:9222 cdm`
- Pros: Zero-tap, always authenticated, full AEA posture
- Cons: Requires Windows machine running, SSH tunnel, single user
- Script: `scripts/authenticated-browser.js` (MCP server wrapping CDP)

### 2. AgentCore Browser + Midway Auth (one-tap per day)

Managed serverless browser with persistent profile. Inject posture cookies from mwinit, user does one OTP tap via console.

```
Agent → AgentCore Browser (profile: xrusjohn) → internal sites
```

- Auth: One OTP tap per session via AgentCore console
- Setup: Custom browser `xrusjohn_browser-DCxlJ0kZ7F` + profile `browser_profile_xrusjohn-BVL2dTdSb1`
- Pros: No Windows needed, managed infrastructure, 8h session lifetime
- Cons: One interactive auth step per session, console access needed for OTP
- Script: `scripts/start-authenticated-browser.js`

Daily flow:
1. `mwinit` on CDM
2. Orchestrator runs `start-authenticated-browser.js` → gets session ID + cookie JS
3. Navigates to midway, injects posture cookies
4. User does one OTP tap via console
5. Session stays alive all day (8h timeout, resets on activity)
6. All agents share the session ID

### 3. AgentCore Browser for Public Sites (zero-tap)

Default AgentCore Browser for sites that don't need Midway auth.

- Auth: None
- Setup: `start_browser_session()` with default browser
- Use for: AWS docs, public websites, testing deployed apps

## Cookie Findings

| Cookie | Source | httpOnly | Session-scoped | Can inject via JS? |
|---|---|---|---|---|
| `amazon_enterprise_access` | AEA extension or mwinit | No | No (has expiry) | ✅ Yes |
| `aea_plugin_present` | AEA extension | No | No | ✅ Yes |
| `user_name` | Midway login | No | No | ✅ Yes |
| `session` | Midway login | Yes (browser) / No (mwinit) | Yes | ⚠️ Only from mwinit |
| `__Host-session` | Midway login | Yes (browser) / No (mwinit) | Yes | ⚠️ Only from mwinit |
| `tpm_metrics` | mwinit | No | No | ✅ Yes |

Key findings:
- Midway `session` cookies from browser login are httpOnly — can't be extracted or injected
- Midway `session` cookies from mwinit are NOT httpOnly — can be injected but are session-scoped (don't persist across browser sessions)
- AEA posture cookies (`amazon_enterprise_access`) can be injected and help skip the username step
- The AEA browser extension is enterprise-managed — can't be installed on non-Amazon devices
- Profile persistence saves cookies with explicit expiry but NOT session-scoped cookies

## Resources Created

- Custom browser: `xrusjohn_browser-DCxlJ0kZ7F` (public network mode)
- Browser profile: `browser_profile_xrusjohn-BVL2dTdSb1` (persistent cookies)
- IAM role: `relay-code-interpreter-role` (for Code Interpreter experiments)

## Architecture: Shared Browser Session

```
Orchestrator
  │
  ├─ startup: start-authenticated-browser.js
  │   ├─ read ~/.midway/cookie
  │   ├─ start AgentCore Browser (profile, 8h timeout)
  │   ├─ inject posture cookies
  │   └─ user does one OTP tap → session authenticated
  │
  ├─ stores session_id
  │
  ├─ Agent A: "look up xrusjohn on phonetool"
  │   └─ browser_navigate(session_id, phonetool) → extract data
  │
  ├─ Agent B: "check my COE action items"
  │   └─ browser_navigate(session_id, coe.a2z.com) → extract data
  │
  └─ Agent C: "search internal wiki for X"
      └─ browser_navigate(session_id, w.amazon.com) → extract data
```

## DCV Live View Integration

AgentCore Browser's live view is powered by AWS DCV. Each browser session launches a dedicated DCV server that streams the browser interface with real-time interaction.

Key requirements:
- **DCV Web Client SDK** — JS library that renders the stream in a `<div>`
- **SigV4 signed URL** — the `live_view_url` needs IAM auth as query params (raw URL returns 501)
- **Backend presigner** — Express endpoint generates signed URL from session ID
- **Frontend component** — React component embeds DCV client in our UI

Reference: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/browser-dcv-integration.html

```js
// Frontend: embed DCV viewer
dcv.authenticate(presignedUrl, {
  success: (auth, result) => {
    dcv.connect({ url: presignedUrl, sessionId, authToken, divId: 'dcv-display' });
  }
});
```

This eliminates the console hop — user sees the browser in our UI, taps OTP, never leaves the app.

## Next Steps / Ideas

1. **Embedded DCV browser viewer in orchestrator UI** — spike on DCV Web Client SDK integration in our React app

2. **Windows-native agent** — run the agent directly on Windows, no tunnel needed. Agent uses local Chrome via CDP. Full AEA, zero-tap.

3. **Browser session pool** — pre-authenticate N sessions at start of day for parallel agent access.

4. **Auto-refresh** — monitor session health, auto-restart + re-auth if session dies.

5. **AEA extension on AgentCore Browser** — if the extension could be loaded from S3 (`extensions` parameter on `start_browser_session`), it might handle auth automatically. Blocked by: extension is enterprise-managed, not distributable.
