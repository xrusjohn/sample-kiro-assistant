// === Cognito + Midway Auth (matching sonic pattern) — paste into browser console ===
// Uses /login endpoint (Cognito hosted UI) which handles Midway redirect internally

(async () => {
  const COGNITO_DOMAIN = "https://xrusjohn-demo.auth.us-east-1.amazoncognito.com";
  const CLIENT_ID = "434321f0nj66bmo12i2qg7eled";
  const REDIRECT_URI = "http://localhost:5173";
  const GATEWAY_URL = "https://kiro-assistant-gateway-bfsj0hg96b.gateway.bedrock-agentcore.us-west-2.amazonaws.com/mcp";

  // Use Cognito hosted UI /login (not /oauth2/authorize with identity_provider)
  const loginUrl = `${COGNITO_DOMAIN}/login?client_id=${CLIENT_ID}&response_type=code&scope=email+openid+profile&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

  console.log("Opening Cognito login popup...");
  console.log("URL:", loginUrl);
  const popup = window.open(loginUrl, "cognito_auth", "width=500,height=600,scrollbars=yes,resizable=yes");

  if (!popup) { console.error("Popup blocked!"); return; }

  // Poll for redirect back to localhost:5173 with ?code=
  console.log("Waiting for authentication...");
  const code = await new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      try {
        const url = popup.location.href;
        if (url && url.startsWith(REDIRECT_URI)) {
          clearInterval(interval);
          popup.close();
          const params = new URL(url).searchParams;
          if (params.get("error")) {
            reject(new Error(`${params.get("error")}: ${params.get("error_description")}`));
          } else if (params.get("code")) {
            resolve(params.get("code"));
          } else {
            reject(new Error("No code in redirect"));
          }
        }
      } catch (e) { /* cross-origin, keep waiting */ }
    }, 500);
    setTimeout(() => { clearInterval(interval); popup.close(); reject(new Error("Timeout 2min")); }, 120000);
  });

  console.log("✓ Got auth code");

  // Exchange code for tokens (no PKCE, no client secret — matches sonic pattern)
  const tokenRes = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      code: code,
    }),
  });

  const tokenData = await tokenRes.json();
  if (tokenData.error) { console.error("✗ Token exchange failed:", tokenData); return; }

  console.log("✓ Tokens received!");
  console.log("  expires_in:", tokenData.expires_in, "seconds");
  console.log("  has refresh_token:", !!tokenData.refresh_token);

  // Decode ID token
  const idToken = tokenData.id_token;
  if (idToken) {
    try {
      const claims = JSON.parse(atob(idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      console.log("\n=== ID Token Claims ===");
      console.log("  iss:", claims.iss);
      console.log("  sub:", claims.sub);
      console.log("  email:", claims.email);
      console.log("  cognito:username:", claims["cognito:username"]);
      console.log("  exp:", new Date(claims.exp * 1000).toISOString());
      console.log("  Full:", JSON.stringify(claims, null, 2));
    } catch (e) { console.log("  Could not decode id_token"); }
  }

  // Decode access token
  const accessToken = tokenData.access_token;
  try {
    const claims = JSON.parse(atob(accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    console.log("\n=== Access Token Claims ===");
    console.log("  iss:", claims.iss);
    console.log("  sub:", claims.sub);
    console.log("  scope:", claims.scope);
    console.log("  exp:", new Date(claims.exp * 1000).toISOString());
  } catch { console.log("  (access token is opaque)"); }

  // Test gateway
  console.log("\n=== Testing Gateway ===");
  for (const [label, token] of [["id_token", idToken], ["access_token", accessToken]]) {
    if (!token) continue;
    try {
      const r = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      console.log(`  ${label}: HTTP ${r.status}`);
      if (r.status === 200) console.log("  ✓ GATEWAY ACCEPTED THIS TOKEN!");
      const body = await r.text();
      console.log(`  Body: ${body.slice(0, 300)}`);
    } catch (e) {
      console.log(`  ${label}: CORS error — test from CDM with curl:`);
      console.log(`    curl -H "Authorization: Bearer $(echo '${token}' | head -c 50)..." \\`);
      console.log(`      -X POST -H "Content-Type: application/json" \\`);
      console.log(`      -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' "${GATEWAY_URL}"`);
    }
  }

  window.__tokens = tokenData;
  window.__accessToken = accessToken;
  window.__idToken = idToken;
  window.__refreshToken = tokenData.refresh_token;
  console.log("\n=== Stored ===");
  console.log("  copy(window.__idToken)      // for CDM curl test");
  console.log("  copy(window.__accessToken)  // alternative");
})();
