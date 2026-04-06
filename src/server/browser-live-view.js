/**
 * browser-live-view.js — Express routes for AgentCore Browser live view
 *
 * Provides:
 *   GET /api/browser/session    — start or get current authenticated browser session
 *   GET /api/browser/live-view  — get presigned DCV live view URL
 *   GET /api/browser/console    — get AWS console link as fallback
 *   POST /api/browser/stop      — stop the browser session
 *
 * The presigned URL can be used with the DCV Web Client SDK
 * to embed the browser view directly in the React UI.
 */

import { execSync } from "node:child_process";

const BROWSER_ID = process.env.BROWSER_ID || "xrusjohn_browser-DCxlJ0kZ7F";
const PROFILE_ID = process.env.PROFILE_ID || "browser_profile_xrusjohn-BVL2dTdSb1";
const REGION = process.env.AWS_REGION || "us-east-1";
const ACCOUNT_ID = process.env.AWS_ACCOUNT_ID || "441262788356";

// Shared session state
let currentSession = null;

function runPython(code) {
  return execSync(`python3 -c '${code.replace(/'/g, "'\\''")}'`, {
    encoding: "utf-8",
    timeout: 30000,
    env: { ...process.env, AWS_DEFAULT_REGION: REGION }
  }).trim();
}

export function registerBrowserRoutes(app) {

  // Start or return current browser session
  app.get("/api/browser/session", async (req, res) => {
    try {
      if (currentSession) {
        return res.json(currentSession);
      }

      const result = runPython(`
from bedrock_agentcore.tools.browser_client import BrowserClient
import json
client = BrowserClient(region="${REGION}")
client.identifier = "${BROWSER_ID}"
session = client.start(profile_identifier="${PROFILE_ID}", timeout_seconds=28800)
print(json.dumps({"sessionId": client.session_id, "status": "active"}))
`);
      currentSession = JSON.parse(result);
      currentSession.browserId = BROWSER_ID;
      currentSession.profileId = PROFILE_ID;
      res.json(currentSession);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Get presigned DCV live view URL
  app.get("/api/browser/live-view", (req, res) => {
    try {
      const sessionId = req.query.sessionId || currentSession?.sessionId;
      if (!sessionId) {
        return res.status(400).json({ error: "No active session. Start one first." });
      }

      const url = runPython(`
from bedrock_agentcore.tools.browser_client import BrowserClient
client = BrowserClient(region="${REGION}")
client.identifier = "${BROWSER_ID}"
client.session_id = "${sessionId}"
print(client.generate_live_view_url())
`);

      res.json({
        presignedUrl: url,
        expiresIn: 300,
        sessionId,
        consoleUrl: `https://${ACCOUNT_ID}-fd2s26o5.${REGION}.console.aws.amazon.com/bedrock-agentcore/browser/${BROWSER_ID}/session/${sessionId}#`
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Console link fallback
  app.get("/api/browser/console", (req, res) => {
    const sessionId = req.query.sessionId || currentSession?.sessionId;
    if (!sessionId) {
      return res.status(400).json({ error: "No active session" });
    }
    res.json({
      url: `https://${ACCOUNT_ID}-fd2s26o5.${REGION}.console.aws.amazon.com/bedrock-agentcore/browser/${BROWSER_ID}/session/${sessionId}#`
    });
  });

  // Stop session
  app.post("/api/browser/stop", (req, res) => {
    try {
      const sessionId = req.query.sessionId || currentSession?.sessionId;
      if (!sessionId) {
        return res.status(400).json({ error: "No active session" });
      }
      runPython(`
from bedrock_agentcore.tools.browser_client import BrowserClient
client = BrowserClient(region="${REGION}")
client.identifier = "${BROWSER_ID}"
client.session_id = "${sessionId}"
client.stop()
`);
      currentSession = null;
      res.json({ status: "stopped", sessionId });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}
