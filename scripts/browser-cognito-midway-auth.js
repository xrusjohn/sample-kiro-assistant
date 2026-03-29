// === Cognito + Midway Auth via Kiro Assistant callback — paste into browser console ===
// Uses http://localhost:3001/auth/callback (served by the Kiro Assistant web server)

(async () => {
  const COGNITO_DOMAIN = "https://xrusjohn-demo.auth.us-east-1.amazoncognito.com";
  const CLIENT_ID = "434321f0nj66bmo12i2qg7eled";
  const REDIRECT_URI = "http://localhost:3001/auth/callback";
  const GATEWAY_URL = "https://kiro-assistant-gateway-bfsj0hg96b.gateway.bedrock-agentcore.us-west-2.amazonaws.com/mcp";

  const loginUrl = `${COGNITO_DOMAIN}/login?client_id=${CLIENT_ID}&response_type=code&scope=email+openid+profile&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

  console.log("Opening Cognito login popup...");
  const popup = window.open(loginUrl, "cognito_auth", "width=500,height=600");
  if (!popup) { console.error("Popup blocked!"); return; }

  // Wait for the callback page to postMessage the code back
  console.log("Waiting for authentication...");
  const code = await new Promise((resolve, reject) => {
    const handler = (event) => {
      if (event.data?.type === "AUTH_CALLBACK") {
        window.removeEventListener("message", handler);
        clearInterval(checkClosed);
        if (event.data.error) reject(new Error(event.data.error));
        else if (event.data.code) resolve(event.data.code);
        else reject(new Error("No code received"));
      }
    };
    window.addEventListener("message", handler);
    const checkClosed = setInterval(() => {
      if (popup.closed) { clearInterval(checkClosed); window.removeEventListener("message", handler); reject(new Error("Popup closed")); }
    }, 1000);
    setTimeout(() => { clearInterval(checkClosed); window.removeEventListener("message", handler); popup.close(); reject(new Error("Timeout 2min")); }, 120000);
  });

  console.log("✓ Got auth code");

  // Exchange code for tokens
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
      console.log(JSON.stringify(claims, null, 2));
    } catch (e) { console.log("  Could not decode id_token"); }
  }

  // Test gateway — will likely CORS fail from browser, that's OK
  console.log("\n=== Testing Gateway ===");
  for (const [label, token] of [["id_token", idToken], ["access_token", tokenData.access_token]]) {
    if (!token) continue;
    try {
      const r = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      console.log(`  ${label}: HTTP ${r.status} ${r.status === 200 ? "✓ ACCEPTED!" : ""}`);
      console.log(`  Body: ${(await r.text()).slice(0, 300)}`);
    } catch (e) {
      console.log(`  ${label}: CORS blocked — copy token and test from CDM`);
    }
  }

  window.__tokens = tokenData;
  window.__accessToken = tokenData.access_token;
  window.__idToken = idToken;
  window.__refreshToken = tokenData.refresh_token;
  console.log("\n=== Stored — copy with: ===");
  console.log("  copy(window.__idToken)");
  console.log("  copy(window.__accessToken)");
})();
