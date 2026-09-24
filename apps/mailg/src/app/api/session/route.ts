import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { demoMode } from "@/lib/server/config";

export const runtime = "nodejs";

export async function GET() {
  if (demoMode) return NextResponse.json({ mode: "demo", connected: false });
  try {
    const session = await getSession();
    return NextResponse.json({ mode: "live", connected: Boolean(session), workspaceId: session?.workspaceId, scopes: session?.scope.split(" ") }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ mode: "live", connected: false, error: error instanceof Error ? error.message : "Session unavailable" }, { status: 503 });
  }
}
