export type MailPageParams = { mailboxId?: string; view?: string; labelId?: string; cursor?: string; query?: string; limit?: number };

async function request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`/api/banger/${path}`, { credentials: "same-origin", cache: "no-store", ...init, headers });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try { const data = await response.json(); message = data.error?.message || data.error || data.message || message; } catch { /* non-JSON */ }
    const error = new Error(message) as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function params(input: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) if (value !== undefined && value !== "") query.set(key, String(value));
  return query.toString();
}

export function createMailClient(productId?: string) {
  const scopedHeaders: Record<string, string> = productId ? { "x-banger-product-id": productId } : {};
  // Bind the product to this client, so an in-flight action keeps its original
  // context even if the user switches mailboxes before it finishes.
  const scopedRequest = <T = unknown>(path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (productId) headers.set("x-banger-product-id", productId);
    return request<T>(path, { ...init, headers });
  };
  return {
  request: scopedRequest,
  session: () => fetch("/api/session", { cache: "no-store" }).then((r) => r.json()) as Promise<{ mode: "demo" | "live"; connected: boolean; workspaceId?: string; error?: string }>,
  signIn: () => { window.location.href = "/api/auth/start"; },
  signOut: async () => { await fetch("/api/auth/logout", { method: "POST", headers: { Origin: window.location.origin } }); window.location.reload(); },
  bootstrap: (input: MailPageParams = {}) => scopedRequest(`mail-page?${params({ mailbox_id: input.mailboxId, view: input.view, label_id: input.labelId, limit: input.limit })}`),
  listThreads: (input: MailPageParams = {}) => scopedRequest(`${input.query ? "search" : "threads"}?${params({ mailbox_id: input.mailboxId, view: input.view, label_id: input.labelId, cursor: input.cursor, q: input.query, limit: input.limit })}`),
  thread: (id: string) => scopedRequest(`threads/${id}`),
  command: (threadId: string, type: string, parameters?: Record<string, unknown>) => scopedRequest("commands", { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ type, target: { thread_id: threadId }, ...(parameters ? { parameters } : {}) }) }),
  commandStatus: (id: string) => scopedRequest(`commands/${id}`),
  saveDraft: (payload: Record<string, unknown>, id?: string) => scopedRequest(id ? `drafts/${id}` : "drafts", { method: id ? "PUT" : "POST", body: JSON.stringify(payload) }),
  sendDraft: (id: string, key: string) => scopedRequest(`drafts/${id}/send`, { method: "POST", headers: { "Idempotency-Key": key } }),
  sendDraftOnce: (id: string) => {
    const storageKey = `mailg-send:${id}`;
    const key = sessionStorage.getItem(storageKey) || crypto.randomUUID();
    sessionStorage.setItem(storageKey, key);
    return scopedRequest(`drafts/${id}/send`, { method: "POST", headers: { "Idempotency-Key": key } });
  },
  uploadDraftAttachment: async (id: string, file: File) => {
    const response = await fetch(`/api/banger/drafts/${id}/attachments`, {
      method: "POST", credentials: "same-origin", cache: "no-store", body: file,
      headers: { ...scopedHeaders, "Content-Type": file.type || "application/octet-stream", "x-banger-filename": file.name },
    });
    if (!response.ok) {
      let message = `Attachment upload failed (${response.status})`;
      try { const payload = await response.json(); message = payload.error?.message || payload.error || message; } catch { /* non-JSON */ }
      throw new Error(message);
    }
    return response.json();
  },
  labels: (mailboxId?: string) => scopedRequest(`labels?${params({ mailbox_id: mailboxId })}`),
  filters: (mailboxId?: string) => scopedRequest(`triage-rules?${params({ mailbox_id: mailboxId })}`),
  realtimeTicket: (deviceId: string) => scopedRequest("realtime-ticket", { method: "POST", body: JSON.stringify({ device_id: deviceId }) }),
};
}

export const mailClient = createMailClient();
