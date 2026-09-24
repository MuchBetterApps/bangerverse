import { NextResponse } from "next/server";
import { beginAuth, STATE_COOKIE } from "@/lib/server/auth";
import { appUrl, demoMode } from "@/lib/server/config";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    if (demoMode) return NextResponse.redirect(new URL("/?auth=demo", request.url));
    const { url, state } = await beginAuth(request);
    const response = NextResponse.redirect(url);
    response.cookies.set(STATE_COOKIE, state, { httpOnly: true, secure: appUrl(request).protocol === "https:", sameSite: "lax", path: "/api/auth/callback", maxAge: 600 });
    return response;
  } catch (error) {
    return NextResponse.redirect(new URL(`/?auth_error=${encodeURIComponent(error instanceof Error ? error.message : "Sign-in failed")}`, request.url));
  }
}
