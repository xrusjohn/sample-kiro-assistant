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

  // Refresh 60s before expiry
  const ms = state.expiresAt - Date.now() - 60_000;
  if (ms <= 0) {
    refresh();
    return;
  }
  refreshTimer = setTimeout(refresh, ms);
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
}

export async function login(): Promise<boolean> {
  const loginUrl = `${COGNITO_DOMAIN}/login?client_id=${CLIENT_ID}&response_type=code&scope=email+openid+profile&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

  const popup = window.open(loginUrl, "cognito_auth", "width=500,height=600");
  if (!popup) return false;

  return new Promise((resolve) => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "AUTH_CALLBACK") {
        window.removeEventListener("message", handler);
        clearInterval(checkClosed);
        if (event.data.code) {
          exchangeCode(event.data.code).then(resolve);
        } else {
          resolve(false);
        }
      }
    };
    window.addEventListener("message", handler);
    const checkClosed = setInterval(() => {
      if (popup.closed) { clearInterval(checkClosed); window.removeEventListener("message", handler); resolve(false); }
    }, 1000);
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
if (state.refreshToken && !isAuthenticated()) {
  refresh();
} else {
  scheduleRefresh();
}
