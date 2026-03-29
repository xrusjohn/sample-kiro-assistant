// === Federate OAuth Token Flow — paste this into your browser console ===
// Run on any page (e.g. about:blank or your Kiro Assistant tab)
//
// After pasting, it will:
// 1. Open a popup for Midway auth
// 2. Capture the auth code from the redirect
// 3. Exchange it for a token
// 4. Log the token claims and test the gateway

(async () => {
  // === CONFIG ===
  const CLIENT_ID = "xrusjohn-midway-cognito-1";
  const REDIRECT_URI = "https://idp-integ.federate.amazon.com/api/oauth2/v1/authorize"; // we'll use a trick below
  const AUTHORIZE_URL = "https://idp-integ.federate.amazon.com/api/oauth2/v1/authorize";
  const TOKEN_URL = "https://idp-integ.federate.amazon.com/api/oauth2/v2/token";
  const GATEWAY_URL = "https://kiro-assistant-gateway-bfsj0hg96b.gateway.bedrock-agentcore.us-west-2.amazonaws.com/mcp";

  // You'll need to paste the client secret here (from Secrets Manager)
  const CLIENT_SECRET = prompt("Enter Federate client secret:");
  if (!CLIENT_SECRET) { console.log("Cancelled"); return; }

  // === PKCE ===
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const codeVerifier = btoa(String.fromCharCode(...randomBytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  const state = crypto.randomUUID();

  // Use a localhost redirect that we'll intercept
  // If you have nothing on localhost:8765, the popup will show an error page
  // but the URL bar will have the code — we read it via the popup reference
  const callbackUri = "http://localhost:8765/callback";

  const authUrl = new URL(AUTHORIZE_URL);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", callbackUri);
  authUrl.searchParams.set("scope", "openid");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  console.log("Opening Federate auth popup...");
  const popup = window.open(authUrl.toString(), "federate_auth", "width=600,height=700");

  if (!popup) {
    console.error("Popup blocked! Allow popups and try again.");
    return;
  }

  // Poll the popup URL for the callback
  console.log("Waiting for you to authenticate...");
  const code = await new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      try {
        const url = popup.location.href;
        if (url.startsWith(callbackUri)) {
          clearInterval(interval);
          popup.close();
          const params = new URL(url).searchParams;
          if (params.get("state") !== state) {
            reject(new Error("State mismatch!"));
          } else {
            resolve(params.get("code"));
          }
        }
      } catch (e) {
        // Cross-origin — popup is still on Federate's domain, keep waiting
      }
    }, 500);

    // Timeout after 2 minutes
    setTimeout(() => { clearInterval(interval); popup.close(); reject(new Error("Timeout")); }, 120000);
  });

  console.log("✓ Got authorization code:", code.slice(0, 20) + "...");

  // === Exchange code for token ===
  console.log("Exchanging code for token...");
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: code,
      redirect_uri: callbackUri,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code_verifier: codeVerifier,
    }),
  });

  const tokenData = await tokenRes.json();

  if (tokenData.error) {
    console.error("✗ Token exchange failed:", tokenData);
    return;
  }

  console.log("✓ Token received!");
  console.log("  Type:", tokenData.token_type);
  console.log("  Expires in:", tokenData.expires_in, "seconds");
  console.log("  Has refresh_token:", !!tokenData.refresh_token);

  // Decode JWT
  const accessToken = tokenData.access_token;
  const [, payload] = accessToken.split(".");
  const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));

  console.log("\n=== Token Claims ===");
  console.log("  Issuer:", claims.iss);
  console.log("  Subject:", claims.sub || claims.SUB);
  console.log("  Audience:", claims.aud || claims.AUD);
  console.log("  UID:", claims.UID);
  console.log("  EMAIL:", claims.EMAIL);
  console.log("  Expires:", new Date(claims.exp * 1000).toISOString());
  console.log("  Full claims:", JSON.stringify(claims, null, 2));

  // === Test gateway ===
  console.log("\n=== Testing Gateway ===");
  try {
    const gwRes = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    console.log("  Status:", gwRes.status);
    const body = await gwRes.json();
    console.log("  Response:", JSON.stringify(body, null, 2));
  } catch (e) {
    console.log("  Gateway test failed (CORS?):", e.message);
    console.log("  Try from CDM instead:");
    console.log(`  curl -H "Authorization: Bearer ${accessToken.slice(0, 50)}..." \\`);
    console.log(`    -X POST -H "Content-Type: application/json" \\`);
    console.log(`    -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \\`);
    console.log(`    "${GATEWAY_URL}"`);
  }

  // Store for manual use
  window.__federateToken = accessToken;
  window.__refreshToken = tokenData.refresh_token;
  console.log("\n=== Stored ===");
  console.log("  window.__federateToken  (access token)");
  console.log("  window.__refreshToken   (refresh token)");
  console.log("\n  Copy token: copy(window.__federateToken)");
})();
