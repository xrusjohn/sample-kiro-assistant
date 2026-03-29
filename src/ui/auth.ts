// Cognito + Midway auth module for Kiro Assistant

const COGNITO_DOMAIN = "https://xrusjohn-demo.auth.us-east-1.amazoncognito.com";
const CLIENT_ID = "434321f0nj66bmo12i2qg7eled";
const REDIRECT_URI = `${window.location.origin}/auth/callback`;

type AuthState = {
  idToken: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  email: string | null;
  username: string | null;
};

type AuthListener = (state: AuthState) => void;

const listeners = new Set<AuthListener>();
let state: AuthState = loadFromStorage();
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function loadFromStorage(): AuthState {
  try {
    const s = localStorage.getItem("kiro-auth");
    if (s) {
      const parsed = JSON.parse(s);
      // Check if expired
      if (parsed.expiresAt && Date.now() < parsed.expiresAt) return parsed;
    }
  } catch {}
  return { idToken: null, accessToken: null, refreshToken: null, expiresAt: null, email: null, username: null };
}

function saveToStorage() {
  localStorage.setItem("kiro-auth", JSON.stringify(state));
}

function notify() {
  for (const fn of listeners) fn(state);
}

function decodeJwt(token: string): Record<string, unknown> {
  return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
}

function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  if (!state.expiresAt || !state.refreshToken) return;

  // Refresh 90s before expiry (gives us buffer for network delays)
  const ms = state.expiresAt - Date.now() - 90_000;
  if (ms <= 0) {
    // Already past refresh window — try immediately
    refresh();
    return;
  }
  console.log(`[auth] refresh scheduled in ${Math.round(ms / 1000)}s`);
  refreshTimer = setTimeout(() => {
    console.log("[auth] auto-refreshing token...");
    refresh().then(ok => {
      if (ok) console.log("[auth] ✓ token refreshed");
      else console.log("[auth] ✗ refresh failed — user needs to re-authenticate");
    });
  }, ms);
}

async function processTokens(data: { id_token?: string; access_token?: string; refresh_token?: string; expires_in?: number }) {
  state.idToken = data.id_token || null;
  state.accessToken = data.access_token || null;
  if (data.refresh_token) state.refreshToken = data.refresh_token;
  state.expiresAt = data.expires_in ? Date.now() + data.expires_in * 1000 : null;

  if (data.id_token) {
    try {
      const claims = decodeJwt(data.id_token);
      state.email = (claims.email as string) || null;
      state.username = (claims["cognito:username"] as string)?.replace("Midway_", "") || null;
    } catch {}
  }

  saveToStorage();
  notify();
  scheduleRefresh();

  // Push to server for server-side gateway calls
  if (state.idToken) {
    fetch("/api/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: state.idToken }),
    }).catch(() => {});
  }
}

export async function login(): Promise<boolean> {
  const loginUrl = `${COGNITO_DOMAIN}/login?client_id=${CLIENT_ID}&response_type=code&scope=email+openid+profile&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

  const popup = window.open(loginUrl, "cognito_auth", "width=500,height=600");
  if (!popup) return false;

  return new Promise((resolve) => {
    // Listen for postMessage from callback page
    const msgHandler = (event: MessageEvent) => {
      if (event.data?.type === "AUTH_CALLBACK") {
        cleanup();
        // Callback page already stored tokens in localStorage — reload them
        state = loadFromStorage();
        notify();
        scheduleRefresh();
        resolve(!!state.idToken);
      }
    };

    // Also poll localStorage in case postMessage doesn't work
    const storageCheck = setInterval(() => {
      const fresh = loadFromStorage();
      if (fresh.idToken && fresh.idToken !== state.idToken) {
        cleanup();
        state = fresh;
        notify();
        scheduleRefresh();
        resolve(true);
      }
    }, 1000);

    const checkClosed = setInterval(() => {
      if (popup.closed) {
        // Give localStorage a moment to sync
        setTimeout(() => {
          cleanup();
          const fresh = loadFromStorage();
          if (fresh.idToken) {
            state = fresh;
            notify();
            scheduleRefresh();
            resolve(true);
          } else {
            resolve(false);
          }
        }, 500);
      }
    }, 1000);

    const cleanup = () => {
      window.removeEventListener("message", msgHandler);
      clearInterval(storageCheck);
      clearInterval(checkClosed);
    };

    window.addEventListener("message", msgHandler);
    setTimeout(() => { cleanup(); popup.close(); resolve(false); }, 120000);
  });
}

async function exchangeCode(code: string): Promise<boolean> {
  try {
    const res = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        code,
      }),
    });
    const data = await res.json();
    if (data.error) return false;
    await processTokens(data);
    return true;
  } catch {
    return false;
  }
}

export async function refresh(): Promise<boolean> {
  if (!state.refreshToken) return false;
  try {
    const res = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: CLIENT_ID,
        refresh_token: state.refreshToken,
      }),
    });
    const data = await res.json();
    if (data.error) {
      state.idToken = null;
      state.accessToken = null;
      state.expiresAt = null;
      saveToStorage();
      notify();
      return false;
    }
    await processTokens(data);
    return true;
  } catch {
    return false;
  }
}

export function logout() {
  state = { idToken: null, accessToken: null, refreshToken: null, expiresAt: null, email: null, username: null };
  if (refreshTimer) clearTimeout(refreshTimer);
  saveToStorage();
  notify();
}

export function getAuth(): AuthState { return state; }
export function getIdToken(): string | null { return state.idToken; }
export function isAuthenticated(): boolean { return !!state.idToken && !!state.expiresAt && Date.now() < state.expiresAt; }
export function onAuthChange(fn: AuthListener) { listeners.add(fn); fn(state); return () => { listeners.delete(fn); }; }
export function timeToExpiry(): number | null { return state.expiresAt ? Math.max(0, state.expiresAt - Date.now()) : null; }

// Boot: if we have a refresh token but expired id token, try refreshing
// If we have a valid token, push it to the server and schedule refresh
if (state.refreshToken && !isAuthenticated()) {
  refresh();
} else if (isAuthenticated()) {
  // Push existing valid token to server
  fetch("/api/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: state.idToken }),
  }).catch(() => {});
  scheduleRefresh();
}
