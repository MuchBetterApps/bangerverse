import { mailClient } from "./client";

export type MailSignal = {
  type: "new_mail" | "workspace_revision" | "command_status" | string;
  mailbox_id?: string;
  mailbox_ids?: string[];
  topics?: string[];
  command_id?: string;
  status?: string;
};

/** Notifications contain metadata only. Consumers refetch visible data after signals. */
export function subscribeRealtime(workspaceId: string, onSignal: (signal: MailSignal | { type: "reconcile" }) => void): () => void {
  let stopped = false;
  let socket: WebSocket | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  const deviceId = `mailg-${crypto.randomUUID()}`;

  async function connect() {
    if (stopped) return;
    try {
      const result = await mailClient.realtimeTicket(deviceId) as { data?: { ticket: string; websocket_url: string } };
      const ticket = result.data;
      if (!ticket?.ticket || !ticket.websocket_url) throw new Error("No realtime ticket");
      const url = new URL(ticket.websocket_url);
      url.searchParams.set("ticket", ticket.ticket);
      url.searchParams.set("workspace", workspaceId);
      socket = new WebSocket(url);
      socket.onopen = () => { attempt = 0; onSignal({ type: "reconcile" }); };
      socket.onmessage = (event) => {
        try {
          const signal = JSON.parse(event.data) as MailSignal;
          if (["new_mail", "workspace_revision", "command_status"].includes(signal.type)) onSignal(signal);
        } catch { /* malformed notification */ }
      };
      socket.onclose = () => scheduleReconnect();
      socket.onerror = () => socket?.close();
    } catch { scheduleReconnect(); }
  }

  function scheduleReconnect() {
    if (stopped || retry) return;
    retry = setTimeout(() => { retry = undefined; void connect(); }, Math.min(30_000, 1000 * 2 ** Math.min(attempt++, 5)));
  }

  void connect();
  timer = setInterval(() => { if (!stopped) onSignal({ type: "reconcile" }); }, 60_000);
  return () => { stopped = true; if (retry) clearTimeout(retry); if (timer) clearInterval(timer); socket?.close(); };
}
