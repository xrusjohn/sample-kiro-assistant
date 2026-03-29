#!/usr/bin/env node
/**
 * Test Federate auth → AgentCore Gateway flow.
 *
 * Usage:
 *   FEDERATE_CLIENT_ID=xxx FEDERATE_CLIENT_SECRET=xxx GATEWAY_URL=xxx node scripts/test-gateway-auth.js
 *
 * This uses the OAuth2 authorization code flow with PKCE.
 * It starts a local HTTP server to receive the callback, opens the Federate
 * authorize URL in your browser, and exchanges the code for a token.
 */

const http = require("http");
const crypto = require("crypto");
const { execSync } = require("child_process");

const CLIENT_ID = process.env.FEDERATE_CLIENT_ID;
const CLIENT_SECRET = process.env.FEDERATE_CLIENT_SECRET;
const GATEWAY_URL = process.env.GATEWAY_URL;
const FEDERATE_ENV = process.env.FEDERATE_ENV || "integ";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Set FEDERATE_CLIENT_ID and FEDERATE_CLIENT_SECRET");
  process.exit(1);
}

const BASE = FEDERATE_ENV === "prod"
  ? "https://idp.federate.amazon.com"
  : "https://idp-integ.federate.amazon.com";

const AUTHORIZE_URL = `${BASE}/api/oauth2/v1/authorize`;
const TOKEN_URL = `${BASE}/api/oauth2/v2/token`;
const REDIRECT_PORT = 8765;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;

// PKCE
const codeVerifier = crypto.randomBytes(32).toString("base64url");
const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");

// State
const state = crypto.randomBytes(16).toString("hex");

// Build authorize URL
const authUrl = new URL(AUTHORIZE_URL);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("client_id", CLIENT_ID);
authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
authUrl.searchParams.set("scope", "openid");
authUrl.searchParams.set("state", state);
authUrl.searchParams.set("code_challenge", codeChallenge);
authUrl.searchParams.set("code_challenge_method", "S256");

console.log("\n=== Federate OAuth Flow ===");
console.log(`Open this URL in your browser:\n\n${authUrl.toString()}\n`);

// Try to open browser
try {
  const cmd = process.platform === "win32" ? "start" : process.platform === "darwin" ? "open" : "xdg-open";
  execSync(`${cmd} "${authUrl.toString()}"`, { stdio: "ignore" });
} catch {
  console.log("(Could not auto-open browser — copy the URL above)");
}

// Start callback server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);
  if (url.pathname !== "/callback") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");

  if (returnedState !== state) {
    res.writeHead(400);
    res.end("State mismatch!");
    return;
  }

  res.writeHead(200, { "Content-Type": "text/html" });
  res.end("<h2>✓ Auth complete — you can close this tab</h2>");

  console.log("✓ Received authorization code");

  // Exchange code for token
  try {
    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code_verifier: codeVerifier,
      }).toString(),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      console.error("\n✗ Token exchange failed:", tokenData);
      process.exit(1);
    }

    console.log("\n=== Token received ===");
    console.log("  Type:", tokenData.token_type);
    console.log("  Expires in:", tokenData.expires_in, "seconds");

    // Decode JWT claims (without verification — just for inspection)
    const accessToken = tokenData.access_token;
    const parts = accessToken.split(".");
    if (parts.length === 3) {
      const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      console.log("\n=== Token claims ===");
      console.log("  Issuer:", claims.iss);
      console.log("  Subject:", claims.sub || claims.SUB);
      console.log("  Audience:", claims.aud || claims.AUD);
      console.log("  UID:", claims.UID);
      console.log("  EMAIL:", claims.EMAIL);
      console.log("  Expires:", new Date((claims.exp || 0) * 1000).toISOString());
      console.log("\n  Full claims:", JSON.stringify(claims, null, 2));
    }

    // Test gateway if URL provided
    if (GATEWAY_URL) {
      console.log("\n=== Testing gateway ===");
      console.log("  URL:", GATEWAY_URL);

      const gwRes = await fetch(`${GATEWAY_URL}/mcp`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });

      console.log("  Status:", gwRes.status);
      const gwBody = await gwRes.text();
      try {
        console.log("  Response:", JSON.stringify(JSON.parse(gwBody), null, 2));
      } catch {
        console.log("  Response:", gwBody.slice(0, 500));
      }
    } else {
      console.log("\nSet GATEWAY_URL to test the gateway with this token.");
      console.log("  export GATEWAY_URL=https://xxx.gateway.bedrock-agentcore.us-west-2.amazonaws.com");
    }

    // Output token for manual use
    console.log("\n=== Raw token (for manual testing) ===");
    console.log(accessToken);

  } catch (err) {
    console.error("\n✗ Error:", err.message);
  }

  server.close();
});

server.listen(REDIRECT_PORT, () => {
  console.log(`Listening for callback on http://localhost:${REDIRECT_PORT}/callback`);
  console.log("Waiting for you to authenticate in the browser...\n");
});
