#!/usr/bin/env node
/**
 * start-authenticated-browser.js
 *
 * Starts an AgentCore Browser session with persistent profile,
 * injects midway posture cookies from ~/.midway/cookie,
 * and navigates to midway for one-time auth.
 *
 * Usage:
 *   node start-authenticated-browser.js
 *
 * Outputs JSON with session_id for other agents to reuse.
 * The session stays alive for up to 8 hours.
 *
 * Env vars:
 *   BROWSER_ID       - custom browser identifier (default: xrusjohn_browser-DCxlJ0kZ7F)
 *   PROFILE_ID       - browser profile identifier (default: browser_profile_xrusjohn-BVL2dTdSb1)
 *   MIDWAY_COOKIE    - path to midway cookie file (default: ~/.midway/cookie)
 *   AWS_REGION       - region (default: us-east-1)
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BROWSER_ID = process.env.BROWSER_ID || "xrusjohn_browser-DCxlJ0kZ7F";
const PROFILE_ID = process.env.PROFILE_ID || "browser_profile_xrusjohn-BVL2dTdSb1";
const COOKIE_PATH = process.env.MIDWAY_COOKIE || join(homedir(), ".midway", "cookie");
const REGION = process.env.AWS_REGION || "us-east-1";

// Parse Netscape cookie file
function parseMidwayCookies(path) {
  const lines = readFileSync(path, "utf-8").split("\n");
  const cookies = [];
  for (const raw of lines) {
    const line = raw.startsWith("#HttpOnly_") ? raw.slice(10) : raw;
    if (!line || line.startsWith("#")) continue;
    const parts = line.split("\t");
    if (parts.length < 7) continue;
    const [domain, , cookiePath, secure, expires, name, value] = parts;
    if (domain.includes("midway") || domain.includes("amazon")) {
      cookies.push({ domain, name, value, path: cookiePath, secure: secure === "TRUE", expires: parseInt(expires) });
    }
  }
  return cookies;
}

// Build JS to inject cookies
function buildCookieJS(cookies) {
  return cookies.map(c =>
    `document.cookie = "${c.name}=${c.value}; path=${c.path}; secure; SameSite=None";`
  ).join("\n");
}

async function main() {
  // 1. Parse midway cookies
  let cookies;
  try {
    cookies = parseMidwayCookies(COOKIE_PATH);
    console.error(`[auth-browser] Parsed ${cookies.length} cookies from ${COOKIE_PATH}`);
  } catch (e) {
    console.error(`[auth-browser] ERROR: Cannot read ${COOKIE_PATH}: ${e.message}`);
    console.error(`[auth-browser] Run 'mwinit' first.`);
    process.exit(1);
  }

  // 2. Start browser session via AWS SDK
  const { BedrockAgentCoreClient, StartBrowserSessionCommand } = await import("@aws-sdk/client-bedrock-agentcore");
  const client = new BedrockAgentCoreClient({ region: REGION });

  const startResp = await client.send(new StartBrowserSessionCommand({
    browserIdentifier: BROWSER_ID,
    profileConfiguration: { profileIdentifier: PROFILE_ID },
    sessionTimeout: 28800, // 8 hours max
  }));

  const sessionId = startResp.sessionId;
  console.error(`[auth-browser] Session started: ${sessionId}`);

  // 3. Connect via Playwright CDP and inject cookies
  // For now, output the session info — the orchestrator uses the MCP browser tools
  const cookieJS = buildCookieJS(cookies);

  // Output session info as JSON for the orchestrator
  const output = {
    sessionId,
    browserId: BROWSER_ID,
    profileId: PROFILE_ID,
    cookieCount: cookies.length,
    cookieJS,
    instructions: "Navigate to https://midway-auth.amazon.com/login, evaluate cookieJS, then user does one OTP tap via console. Session is then authenticated for up to 8 hours."
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
