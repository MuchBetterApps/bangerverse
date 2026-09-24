import { NextRequest, NextResponse } from "next/server";
import { endSession, SESSION_COOKIE } from "@/lib/server/auth";
import { appUrl } from "@/lib/server/config";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const expected = appUrl(request).origin;
  if (request.headers.get("origin") !== expected) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  await endSession();
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
