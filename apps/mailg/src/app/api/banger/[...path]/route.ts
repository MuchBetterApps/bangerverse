import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { appUrl, bangerUrl, demoMode } from "@/lib/server/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };
const uuid = "[0-9a-fA-F-]{36}";
const routes: Array<[RegExp, string[]]> = [
  [/^mail-page$/, ["GET"]], [/^mailboxes$/, ["GET"]], [/^products$/, ["GET"]],
  [/^threads$/, ["GET"]], [new RegExp(`^threads/${uuid}$`), ["GET"]],
  [/^search$/, ["GET"]], [/^changes$/, ["GET"]],
  [/^labels$/, ["GET", "POST"]], [new RegExp(`^labels/${uuid}$`), ["PATCH", "DELETE"]],
  [/^label-suggestions$/, ["GET"]],
  [/^triage-rules$/, ["GET", "POST"]], [/^triage-rules\/preview$/, ["POST"]],
  [/^triage-rules\/run-past-mail$/, ["POST"]], [new RegExp(`^triage-rules/${uuid}$`), ["GET", "PATCH", "DELETE"]],
  [/^triage-actions$/, ["GET"]], [new RegExp(`^triage-actions/${uuid}/undo$`), ["POST"]],
  [/^drafts$/, ["GET", "POST"]], [new RegExp(`^drafts/${uuid}$`), ["GET", "PUT", "DELETE"]],
  [new RegExp(`^drafts/${uuid}/send$`), ["POST"]],
  [new RegExp(`^drafts/${uuid}/attachments$`), ["POST"]],
  [new RegExp(`^drafts/${uuid}/attachments/${uuid}$`), ["DELETE"]],
  [new RegExp(`^drafts/${uuid}/html$`), ["GET"]],
  [/^commands$/, ["POST"]], [new RegExp(`^commands/${uuid}$`), ["GET"]],
  [/^realtime-ticket$/, ["POST"]],
  [new RegExp(`^messages/${uuid}/html$`), ["GET"]],
  [new RegExp(`^attachments/${uuid}/content$`), ["GET"]],
];

async function proxy(request: NextRequest, context: Context) {
  if (demoMode) return NextResponse.json({ error: "Demo mode has no Banger connection" }, { status: 404 });
  const path = (await context.params).path.join("/");
  if (!routes.some(([pattern, methods]) => pattern.test(path) && methods.includes(request.method))) {
    return NextResponse.json({ error: "Unsupported mailG API route" }, { status: 404 });
  }
  if (request.method !== "GET" && request.headers.get("origin") !== appUrl(request).origin) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in to Banger" }, { status: 401 });
    const upstream = new URL(`/v1/workspaces/${session.workspaceId}/${path}`, bangerUrl());
    upstream.search = new URL(request.url).search;
    const headers = new Headers({ Authorization: `Bearer ${session.accessToken}` });
    for (const name of ["content-type", "idempotency-key", "x-banger-filename", "range", "x-banger-product-id"]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    const length = Number(request.headers.get("content-length") || "0");
    if (length > 26 * 1024 * 1024) return NextResponse.json({ error: "Request too large" }, { status: 413 });
    const body = request.method === "GET" || request.method === "DELETE" ? undefined : await request.arrayBuffer();
    if (body && body.byteLength > 26 * 1024 * 1024) return NextResponse.json({ error: "Request too large" }, { status: 413 });
    const result = await fetch(upstream, { method: request.method, headers, body, cache: "no-store" });
    const contentType = result.headers.get("content-type") || "application/octet-stream";
    const responseHeaders = new Headers({ "Cache-Control": "private, no-store", "Content-Type": contentType, "X-Content-Type-Options": "nosniff" });
    const disposition = result.headers.get("content-disposition");
    if (disposition && path.includes("/content")) responseHeaders.set("Content-Disposition", disposition);
    if (contentType.includes("text/html")) {
      responseHeaders.set("Referrer-Policy", "no-referrer");
      responseHeaders.set("Content-Security-Policy", "sandbox allow-same-origin; default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline'; font-src data:");
    }
    return new Response(result.body, { status: result.status, headers: responseHeaders });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Banger request failed" }, { status: 503 });
  }
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
