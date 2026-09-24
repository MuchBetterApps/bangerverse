import { NextRequest, NextResponse } from "next/server";
import { completeAuth, SESSION_COOKIE, STATE_COOKIE } from "@/lib/server/auth";
import { appUrl } from "@/lib/server/config";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const app = appUrl(request);
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  const stateCookie = request.cookies.get(STATE_COOKIE)?.value || "";
  const response = NextResponse.redirect(new URL("/", app));
  response.cookies.delete(STATE_COOKIE);
  if (error) {
    response.headers.set("location", new URL(`/?auth_error=${encodeURIComponent(error)}`, app).toString());
    return response;
  }
  try {
    if (!state || !code) throw new Error("Missing authorization response");
    const id = await completeAuth(request, state, code, stateCookie);
    response.cookies.set(SESSION_COOKIE, id, { httpOnly: true, secure: app.protocol === "https:", sameSite: "lax", path: "/", maxAge: 30 * 24 * 60 * 60 });
    return response;
  } catch (caught) {
    response.headers.set("location", new URL(`/?auth_error=${encodeURIComponent(caught instanceof Error ? caught.message : "Sign-in failed")}`, app).toString());
    return response;
  }
}
