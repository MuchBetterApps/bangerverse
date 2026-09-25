/** Public OAuth client. Tokens exist only in memory, never in browser storage. */
const API = process.env.NEXT_PUBLIC_BANGER_API_URL || "https://api.bangermail.com";
export function apiOrigin(): string {
  const url = new URL(API);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("Banger API must use HTTPS");
  return url.origin;
}
type Session = { accessToken: string; refreshToken: string; clientId: string; workspaceId: string; expiresAt: number };
type Pending = { state: string; verifier: string; clientId: string; redirectUri: string; createdAt: number };
let session: Session | null = null;
let initialization: Promise<void> | undefined;
let refreshing: Promise<Session> | undefined;
let generation = 0;
const pendingKey = "mailg-oauth-pending";
function opaque() { return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
async function exchange(form: URLSearchParams) {
  const response = await fetch(`${apiOrigin()}/oauth/token`, { method: "POST", credentials: "omit", body: form, cache: "no-store", redirect: "error" });
  if (!response.ok) throw new Error("Banger sign-in expired or was denied. Please sign in again.");
  const data = await response.json();
  if (typeof data.access_token !== "string" || typeof data.refresh_token !== "string" || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw new Error("Invalid sign-in response");
  return data as { access_token: string; refresh_token: string; expires_in: number };
}
function workspace(token: string) {
  // Used for routing only; Banger verifies the signature and authorization.
  const encoded = token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/");
  const id = JSON.parse(atob(encoded || "")).workspace_id;
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Missing authorized workspace");
  return id;
}
export async function beginSignIn() {
  const redirectUri = `${window.location.origin}${window.location.pathname}`;
  // Registration metadata is public, so reusing it avoids registering on every reload.
  const clientKey = `mailg-client:${apiOrigin()}:${redirectUri}`;
  let client_id: string | null = null;
  try { client_id = localStorage.getItem(clientKey); } catch { /* storage may be disabled */ }
  if (!client_id?.startsWith("bgrc_")) {
    const response = await fetch(`${apiOrigin()}/oauth/register`, { method: "POST", credentials: "omit", redirect: "error", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_name: "mailG", redirect_uris: [redirectUri], token_endpoint_auth_method: "none", ...(location.protocol === "https:" ? { client_uri: location.origin } : {}) }) });
    if (!response.ok) throw new Error("Banger sign-in is unavailable. This deployment needs Banger's browser-client support.");
    const registration = await response.json();
    if (typeof registration.client_id !== "string" || !registration.client_id.startsWith("bgrc_")) throw new Error("Invalid client registration");
    client_id = registration.client_id as string;
    try { localStorage.setItem(clientKey, client_id); } catch { /* public metadata is optional */ }
  }
  const state = opaque(), verifier = opaque();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  sessionStorage.setItem(pendingKey, JSON.stringify({ state, verifier, clientId: client_id, redirectUri, createdAt: Date.now() } satisfies Pending));
  const url = new URL(`${apiOrigin()}/oauth/authorize`);
  url.search = new URLSearchParams({ response_type: "code", client_id, redirect_uri: redirectUri, state, code_challenge: challenge, code_challenge_method: "S256", scope: "mail:read mail:write mail:send" }).toString();
  window.location.assign(url);
}
async function completeSignIn() {
  const url = new URL(location.href);
  if (!url.searchParams.has("code") && !url.searchParams.has("error")) return;
  const code = url.searchParams.get("code"), state = url.searchParams.get("state"), denied = url.searchParams.has("error");
  for (const name of ["code", "state", "error", "error_description", "iss"]) url.searchParams.delete(name);
  history.replaceState(null, "", url);
  const raw = sessionStorage.getItem(pendingKey);
  sessionStorage.removeItem(pendingKey);
  if (!raw) throw new Error("Sign-in was not started in this tab. Please try again.");
  const pending = JSON.parse(raw) as Pending;
  if (!state || state !== pending.state || pending.redirectUri !== `${location.origin}${location.pathname}` || !Number.isFinite(pending.createdAt) || pending.createdAt > Date.now() + 60_000 || Date.now() - pending.createdAt > 600_000) throw new Error("Sign-in expired or state did not match. Please try again.");
  if (denied || !code) throw new Error("Sign-in was cancelled.");
  const started = generation;
  const token = await exchange(new URLSearchParams({ grant_type: "authorization_code", client_id: pending.clientId, code, redirect_uri: pending.redirectUri, code_verifier: pending.verifier }));
  if (started !== generation) return;
  session = { clientId: pending.clientId, workspaceId: workspace(token.access_token), accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: Date.now() + token.expires_in * 1000 };
}
export async function browserSession() {
  await (initialization ??= completeSignIn());
  return { mode: session ? "live" as const : "demo" as const, connected: !!session, workspaceId: session?.workspaceId };
}
export async function authorizedFetch(path: string, init: RequestInit = {}) {
  await browserSession();
  if (!session) throw new Error("Sign in to Banger");
  if (session.expiresAt < Date.now() + 60_000) {
    const previous = session, started = generation;
    refreshing ??= exchange(new URLSearchParams({ grant_type: "refresh_token", client_id: previous.clientId, refresh_token: previous.refreshToken })).then(token => {
      if (generation !== started || session !== previous) throw new Error("Session ended");
      const workspaceId = workspace(token.access_token);
      if (workspaceId !== previous.workspaceId) throw new Error("Authorized workspace changed; sign in again");
      return session = { ...previous, accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: Date.now() + token.expires_in * 1000 };
    }).catch(error => { if (started === generation) session = null; throw error; }).finally(() => { refreshing = undefined; });
    await refreshing;
  }
  if (!session) throw new Error("Session ended");
  if (!/^[a-z][a-z0-9/-]*(\?[^#]*)?$/.test(path) || path.includes("..")) throw new Error("Invalid API path");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${session.accessToken}`);
  return fetch(`${apiOrigin()}/v1/workspaces/${session.workspaceId}/${path}`, { ...init, headers, credentials: "omit", cache: "no-store", redirect: "error" });
}
export function signOut() { generation++; session = null; sessionStorage.removeItem(pendingKey); window.location.assign(window.location.pathname); }
