import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { appUrl, bangerUrl } from "./config";
import { storeDelete, storeGet, storeLock, storeSet, storeUnlock } from "./store";

export const SESSION_COOKIE = "mailg_session";
export const STATE_COOKIE = "mailg_oauth_state";
const SESSION_TTL = 30 * 24 * 60 * 60;

type TokenResponse = { access_token: string; refresh_token: string; expires_in: number; scope?: string };
export type Session = {
  clientId: string;
  workspaceId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
};
export type PendingAuth = { verifier: string; clientId: string; redirectUri: string; createdAt: number };

export function opaque(bytes = 32): string { return randomBytes(bytes).toString("base64url"); }
export function challenge(verifier: string): string { return createHash("sha256").update(verifier).digest("base64url"); }

export function workspaceFromToken(token: string): string {
  const payload = token.split(".")[1];
  if (!payload) throw new Error("Invalid Banger access token");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { workspace_id?: string };
  if (!claims.workspace_id || !/^[0-9a-f-]{36}$/i.test(claims.workspace_id)) throw new Error("Banger token has no valid workspace");
  return claims.workspace_id;
}

export async function beginAuth(request: Request): Promise<{ url: string; state: string }> {
  const app = appUrl(request);
  const redirectUri = new URL("/api/auth/callback", app).toString();
  const response = await fetch(new URL("/oauth/register", bangerUrl()), {
    method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
    body: JSON.stringify({ client_name: "mailG", redirect_uris: [redirectUri], token_endpoint_auth_method: "none", ...(app.protocol === "https:" ? { client_uri: app.origin } : {}) }),
  });
  if (!response.ok) throw new Error(`Banger client registration failed (${response.status})`);
  const registration = await response.json() as { client_id?: string };
  if (!registration.client_id) throw new Error("Banger registration returned no client ID");
  const state = opaque(24);
  const verifier = opaque(32);
  await storeSet(`oauth:${state}`, { verifier, clientId: registration.client_id, redirectUri, createdAt: Date.now() } satisfies PendingAuth, 600);
  const url = new URL("/oauth/authorize", bangerUrl());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", registration.client_id);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "mail:read mail:write mail:send");
  url.searchParams.set("code_challenge", challenge(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  return { url: url.toString(), state };
}

async function exchange(form: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(new URL("/oauth/token", bangerUrl()), {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Banger token exchange failed (${response.status})`);
  const token = await response.json() as TokenResponse;
  if (!token.access_token || !token.refresh_token || !Number.isFinite(token.expires_in)) throw new Error("Invalid Banger token response");
  return token;
}

export async function completeAuth(request: Request, state: string, code: string, stateCookie: string): Promise<string> {
  const a = Buffer.from(state);
  const b = Buffer.from(stateCookie);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("OAuth state did not match this browser");
  const pending = await storeGet<PendingAuth>(`oauth:${state}`);
  if (!pending || Date.now() - pending.createdAt > 600_000) throw new Error("Sign-in expired. Please try again.");
  if (pending.redirectUri !== new URL("/api/auth/callback", appUrl(request)).toString()) throw new Error("OAuth callback origin changed");
  await storeDelete(`oauth:${state}`);
  const token = await exchange(new URLSearchParams({
    grant_type: "authorization_code", code, client_id: pending.clientId,
    redirect_uri: pending.redirectUri, code_verifier: pending.verifier,
  }));
  const workspaceId = workspaceFromToken(token.access_token);
  const id = opaque();
  await storeSet(`session:${id}`, {
    clientId: pending.clientId, workspaceId, accessToken: token.access_token,
    refreshToken: token.refresh_token, expiresAt: Date.now() + token.expires_in * 1000,
    scope: token.scope || "mail:read mail:write mail:send",
  } satisfies Session, SESSION_TTL);
  return id;
}

export async function sessionId(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function getSession(): Promise<Session | null> {
  const id = await sessionId();
  if (!id || !/^[A-Za-z0-9_-]{32,80}$/.test(id)) return null;
  const current = await storeGet<Session>(`session:${id}`);
  if (!current) return null;
  if (current.expiresAt > Date.now() + 60_000) return current;
  return refreshSession(id, current);
}

async function refreshSession(id: string, previous: Session): Promise<Session> {
  const lockKey = `lock:${id}`;
  const lockValue = opaque(12);
  for (let attempt = 0; attempt < 25; attempt++) {
    if (await storeLock(lockKey, lockValue, 15)) {
      try {
        const latest = await storeGet<Session>(`session:${id}`);
        if (!latest) throw new Error("Session ended");
        if (latest.expiresAt > Date.now() + 60_000) return latest;
        const token = await exchange(new URLSearchParams({
          grant_type: "refresh_token", refresh_token: latest.refreshToken, client_id: latest.clientId,
        }));
        const workspaceId = workspaceFromToken(token.access_token);
        if (workspaceId !== latest.workspaceId) { await storeDelete(`session:${id}`); throw new Error("Authorized workspace changed; sign in again"); }
        const updated: Session = { ...latest, accessToken: token.access_token, refreshToken: token.refresh_token,
          expiresAt: Date.now() + token.expires_in * 1000, scope: token.scope || latest.scope };
        await storeSet(`session:${id}`, updated, SESSION_TTL);
        return updated;
      } finally { await storeUnlock(lockKey, lockValue); }
    }
    await new Promise((resolve) => setTimeout(resolve, 120 + attempt * 20));
    const latest = await storeGet<Session>(`session:${id}`);
    if (latest && latest.refreshToken !== previous.refreshToken) return latest;
  }
  throw new Error("Could not safely refresh sign-in; retry shortly");
}

export async function endSession(): Promise<void> {
  const id = await sessionId();
  if (id) await storeDelete(`session:${id}`);
}
