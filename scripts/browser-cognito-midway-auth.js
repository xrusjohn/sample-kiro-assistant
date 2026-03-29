// === Cognito + Midway OAuth Flow — paste into browser console ===
// Uses your existing Cognito pool with Midway as IdP
// No client secret needed for this flow (Cognito handles it)

(async () => {
  // === CONFIG ===
  const COGNITO_DOMAIN = "https://xrusjohn-demo.auth.us-east-1.amazoncognito.com";
  const CLIENT_ID = "434321f0nj66bmo12i2qg7eled";
  const REDIRECT_URI = "http://localhost:5173"; // already registered
  const GATEWAY_URL = "https://kiro-assistant-gateway-bfsj0hg96b.gateway.bedrock-agentcore.us-west-2.amazonaws.com/mcp";

  // === PKCE ===
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const codeVerifier = btoa(String.fromCharCode(...randomBytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  const state = crypto.randomUUID();

  // Build Cognito authorize URL — force Midway as IdP
  const authUrl = new URL(`${COGNITO_DOMAIN}/oauth2/authorize`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("identity_provider", "Midway"); // skip Cognito hosted UI, go straight to Midway

  console.log("Opening Midway auth popup...");
  console.log("URL:", authUrl.toString());
  const popup = window.open(authUrl.toString(), "midway_auth", "width=600,height=700");

  if (!popup) {
    console.error("Popup blocked! Allow popups and try again.");
    return;
  }

  // Poll popup for the redirect back to localhost:5173
  console.log("Waiting for you to authenticate...");
  const code = await new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      try {
        const url = popup.location.href;
        if (url && url.startsWith(REDIRECT_URI)) {
          clearInterval(interval);
          popup.close();
          const params = new URL(url).searchParams;
          if (params.get("error")) {
            reject(new Error(`Auth error: ${params.get("error")} - ${params.get("error_description")}`));
          } else if (params.get("state") !== state) {
            reject(new Error("State mismatch!"));
          } else {
            resolve(params.get("code"));
          }
        }
      } catch (e) {
        // Cross-origin — popup still on Midway/Cognito domain
      }
    }, 500);
    setTimeout(() => { clearInterval(interval); popup.close(); reject(new Error("Timeout after 2 min")); }, 120000);
  });

  console.log("✓ Got authorization code");

  // Exchange code for tokens via Cognito token endpoint
  console.log("Exchanging code for tokens...");
  const tokenRes = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: codeVerifier,
    }),
  });

  const tokenData = await tokenRes.json();

  if (tokenData.error) {
    console.error("✗ Token exchange failed:", tokenData);
    return;
  }

  console.log("✓ Tokens received!");
  console.log("  Expires in:", tokenData.expires_in, "seconds");
  console.log("  Has refresh_token:", !!tokenData.refresh_token);
  console.log("  Has id_token:", !!tokenData.id_token);

  // Decode ID token (has user claims)
  const idToken = tokenData.id_token;
  if (idToken) {
    const [, payload] = idToken.split(".");
    const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    console.log("\n=== ID Token Claims ===");
    console.log("  Issuer:", claims.iss);
    console.log("  Subject:", claims.sub);
    console.log("  Email:", claims.email);
    console.log("  Identities:", JSON.stringify(claims.identities, null, 2));
    console.log("  Expires:", new Date(claims.exp * 1000).toISOString());
    console.log("  Full claims:", JSON.stringify(claims, null, 2));
  }

  // Decode access token
  const accessToken = tokenData.access_token;
  try {
    const [, payload] = accessToken.split(".");
    const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    console.log("\n=== Access Token Claims ===");
    console.log("  Issuer:", claims.iss);
    console.log("  Subject:", claims.sub);
    console.log("  Scopes:", claims.scope);
    console.log("  Expires:", new Date(claims.exp * 1000).toISOString());
  } catch { console.log("  (access token is opaque, not JWT)"); }

  // Test gateway with the access token
  console.log("\n=== Testing Gateway with access_token ===");
  for (const [label, token] of [["access_token", accessToken], ["id_token", idToken]]) {
    if (!token) continue;
    try {
      const gwRes = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      console.log(`  ${label}: HTTP ${gwRes.status}`);
      if (gwRes.ok) {
        const body = await gwRes.json();
        console.log(`  Response:`, JSON.stringify(body, null, 2));
      } else {
        console.log(`  Body:`, await gwRes.text());
      }
    } catch (e) {
      console.log(`  ${label}: fetch failed (likely CORS) — use curl from CDM:`);
      console.log(`  curl -H "Authorization: Bearer ${token.slice(0, 40)}..." \\`);
      console.log(`    -X POST -H "Content-Type: application/json" \\`);
      console.log(`    -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \\`);
      console.log(`    "${GATEWAY_URL}"`);
    }
  }

  // Store for manual use
  window.__tokens = tokenData;
  window.__accessToken = accessToken;
  window.__idToken = idToken;
  window.__refreshToken = tokenData.refresh_token;
  console.log("\n=== Stored in window ===");
  console.log("  window.__accessToken");
  console.log("  window.__idToken");
  console.log("  window.__refreshToken");
  console.log("  copy(window.__idToken)  // to paste into CDM curl");
})();
