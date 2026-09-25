"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mailClient as workspaceClient, createMailClient } from "../lib/client";
import { subscribeRealtime } from "../lib/realtime";
import { Icon } from "./icons";
import { MessageBody } from "./MessageBody";
import { demoLabels, demoLabelsByMailbox, demoMailboxes, demoThreads, type MailThread } from "./demo";
import "./MailApp.css";

type Mailbox = { id: string; address: string; display_name?: string; product_id?: string | null };
type Product = { id: string; name: string; domains?: string[]; website_url?: string | null; brand?: { logo_url?: string | null }; context?: { brand_discovery?: { brand?: { logo_url?: string | null } } } };
function ProductAvatar({ product, fallback }: { product?: Product; fallback: string }) {
  const [failedUrl, setFailedUrl] = useState("");
  const candidate = product?.brand?.logo_url || product?.context?.brand_discovery?.brand?.logo_url;
  let url = "";
  try { if (candidate) { const parsed = new URL(candidate); if (parsed.protocol === "https:" && !parsed.username && !parsed.password) url = parsed.href; } } catch { /* Use the product initial for invalid image URLs. */ }
  return <span className="mg-product-avatar" aria-hidden="true">{(product?.name || fallback).trim().slice(0, 1).toUpperCase() || "?"}{url && failedUrl !== url && <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setFailedUrl(url)} />}</span>;
}
type Label = { id: string; name: string; color?: string | null };
type DraftAttachment = { id: string; filename: string; size_bytes: number };
type Detail = { thread: MailThread; messages: Array<{ id: string; sent_at: string; body_text: string; body_html_url?: string; from_participant: { name?: string | null; email: string } | null; to_participants: Array<{ name?: string | null; email: string }>; cc_participants?: Array<{ name?: string | null; email: string }>; attachments?: Array<{ id: string; filename: string; size_bytes: number; download_url?: string }> }> };
type Draft = { id?: string; version?: number; to: string; cc: string; bcc: string; subject: string; body: string; threadId?: string; attachments?: DraftAttachment[] };
type DraftRecord = { id: string; mailbox_id: string; thread_id?: string; version?: number; to: Array<{ email: string }>; cc?: Array<{ email: string }>; bcc?: Array<{ email: string }>; subject: string; body_text: string; updated_at: string; attachments?: DraftAttachment[] };
type Filter = { id: string; name: string; enabled: boolean; description?: string; exact_conditions?: Record<string, unknown>; actions?: Array<{ type: string; label_id?: string }> };
type View = "inbox" | "starred" | "snoozed" | "sent" | "drafts" | "archive" | "trash" | "all" | "labels" | "filters";
type Theme = "light" | "dark" | "landscape";

const emptyDraft: Draft = { to: "", cc: "", bcc: "", subject: "", body: "" };
const nav: Array<{ view: View; icon: string; label: string }> = [
  { view: "inbox", icon: "inbox", label: "Inbox" }, { view: "starred", icon: "star", label: "Starred" },
  { view: "sent", icon: "sent", label: "Sent" },
  { view: "drafts", icon: "draft", label: "Drafts" }, { view: "archive", icon: "archive", label: "Archive" },
  { view: "trash", icon: "trash", label: "Trash" }, { view: "all", icon: "unread", label: "All Mail" },
];

function IconButton({ icon, label, onClick, active, disabled, size = 20 }: { icon: string; label: string; onClick?: () => void; active?: boolean; disabled?: boolean; size?: number }) {
  return <button type="button" className={`mg-icon-button${active ? " active" : ""}`} title={label} aria-label={label} onClick={onClick} disabled={disabled}><Icon name={icon} size={size} /></button>;
}

function formatDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return value;
  const date = new Date(value.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
  if (Number.isNaN(date.getTime())) return value;
  const now = new Date();
  return date.toDateString() === now.toDateString() ? date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function recipients(value: string) { return value.split(/[;,]/).map(email => email.trim()).filter(Boolean).map(email => ({ email })); }
function dataOf<T>(value: unknown): T { return ((value as { data?: T })?.data ?? value) as T; }
function safeText(value: unknown) { return typeof value === "string" ? value : ""; }
function draftAsThread(draft: DraftRecord): MailThread { return { id: draft.id, mailbox_id: draft.mailbox_id, subject: draft.subject || "(no subject)", snippet: draft.body_text || draft.to.map(item => item.email).join(", "), last_message_at: draft.updated_at, message_count: 1, unread_count: 0, is_archived: false, is_trash: false, is_starred: false, is_sent: false, has_attachments: false, labels: [], participants: [{ name: "Draft", email: draft.to.map(item => item.email).join(", ") }] }; }
async function waitForCommand(id: string, mailClient: ReturnType<typeof createMailClient>) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const result = dataOf<{ status: string; error_code?: string }>(await mailClient.commandStatus(id));
    if (result.status === "succeeded") return true;
    if (result.status === "failed") throw new Error(result.error_code ? `Mail action failed (${result.error_code}).` : "Mail action failed.");
    await new Promise(resolve => setTimeout(resolve, 750));
  }
  return false;
}

export default function MailApp() {
  const [mode, setMode] = useState<"demo" | "live">("demo");
  const [connected, setConnected] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [view, setView] = useState<View>("inbox");
  const [category, setCategory] = useState("Primary");
  const [mailboxes, setMailboxes] = useState<Mailbox[]>(demoMailboxes);
  const [products, setProducts] = useState<Product[]>([]);
  const [mailboxProducts, setMailboxProducts] = useState<Record<string, string>>({});
  const productForMailbox = (mailbox: Mailbox) => {
    const productId = mailbox.product_id || mailboxProducts[mailbox.id];
    if (productId) return products.find(product => product.id === productId);
    const domain = mailbox.address.split("@")[1]?.toLowerCase();
    const candidates = products.filter(product => product.domains?.some(value => value.toLowerCase() === domain));
    const primary = candidates.filter(product => { try { return new URL(product.website_url || "").hostname.replace(/^www\./, "").toLowerCase() === domain; } catch { return false; } });
    return primary.length === 1 ? primary[0] : candidates.length === 1 ? candidates[0] : undefined;
  };
  const [mailboxId, setMailboxId] = useState("demo-mailbox");
  const selectedMailbox = mailboxes.find(mailbox => mailbox.id === mailboxId);
  const selectedProductId = selectedMailbox && (selectedMailbox.product_id || mailboxProducts[mailboxId] || productForMailbox(selectedMailbox)?.id);
  const mailClient = useMemo(() => createMailClient(selectedProductId), [selectedProductId]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [selectedMailboxIds, setSelectedMailboxIds] = useState<string[]>([]);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [chooserIds, setChooserIds] = useState<string[]>([]);
  const [mailboxMenu, setMailboxMenu] = useState(false);
  const [labels, setLabels] = useState<Label[]>(demoLabels);
  const [labelId, setLabelId] = useState<string | null>(null);
  const [threads, setThreads] = useState<MailThread[]>(demoThreads);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const loadSequence = useRef(0);
  const commandQueue = useRef(new Map<string, Promise<boolean>>());
  const [toast, setToast] = useState("");
  const [compose, setCompose] = useState<Draft | null>(null);
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [composeMinimized, setComposeMinimized] = useState(false);
  const [sending, setSending] = useState(false);
  const [draftStatus, setDraftStatus] = useState("");
  const [draftAttachments, setDraftAttachments] = useState<DraftAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const attachmentInput = useRef<HTMLInputElement>(null);
  const draftAttachmentsRef = useRef<DraftAttachment[]>([]);
  const [labelEditor, setLabelEditor] = useState<Label | "new" | null>(null);
  const [labelName, setLabelName] = useState("");
  const [labelColor, setLabelColor] = useState("#7baaf7");
  const [filters, setFilters] = useState<Filter[]>([]);
  const [filterEditor, setFilterEditor] = useState<Filter | "new" | null>(null);
  const [filterForm, setFilterForm] = useState({ name: "", from: "", to: "", subject: "", words: "", excluded: "", description: "", action: "apply_label", actionLabel: "" });
  const [filterPreview, setFilterPreview] = useState("");
  const draftIdentity = useRef<{ id?: string; version?: number }>({});
  const draftSaveChain = useRef<Promise<unknown>>(Promise.resolve());
  const lastDraftPayload = useRef("");
  const chooserPrompted = useRef(false);
  const loadRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    const saved = localStorage.getItem("mailg-theme") as Theme | null;
    if (saved === "light" || saved === "dark" || saved === "landscape") setTheme(saved);
    const startDemo = () => {
      let chosen: string[] = [];
      try { chosen = JSON.parse(localStorage.getItem("mailg-mailboxes:demo") || "[]"); } catch { /* invalid preference */ }
      const valid = chosen.filter(id => demoMailboxes.some(mailbox => mailbox.id === id));
      if (valid.length) { setSelectedMailboxIds(valid); setMailboxId(valid[0]); }
      else { setChooserIds(["demo-mailbox", "studio-mailbox"]); setChooserOpen(true); }
    };
    workspaceClient.session().then(session => {
      if (session.mode === "live" && session.connected) { setWorkspaceId(session.workspaceId || "workspace"); setMailboxId(""); setSelectedMailboxIds([]); setMode("live"); setConnected(true); }
      else startDemo();
    }).catch(startDemo);
  }, []);

  useEffect(() => { localStorage.setItem("mailg-theme", theme); }, [theme]);
  useEffect(() => { if (mode === "demo") setLabels(demoLabelsByMailbox[mailboxId] || []); }, [mode, mailboxId]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(""), 3800); return () => clearTimeout(id); }, [toast]);

  const load = useCallback(async (append = false, nextCursor?: string | null) => {
    if (mode !== "live") return;
    if (view === "labels" || view === "filters" || view === "snoozed") return;
    const sequence = ++loadSequence.current;
    setLoading(true);
    try {
      if (view === "drafts") { const result = await workspaceClient.request(`drafts?mailbox_id=${encodeURIComponent(mailboxId)}`); if (sequence !== loadSequence.current) return; setDrafts(dataOf<DraftRecord[]>(result)); setHasMore(false); setCursor(null); return; }
      const backendView = view === "starred" ? "all" : view;
      const input = { mailboxId, view: backendView, labelId: labelId || undefined, query: query || undefined, cursor: nextCursor || undefined, limit: 50 };
      const raw = append || query ? await workspaceClient.listThreads(input) : await workspaceClient.bootstrap(input);
      if (sequence !== loadSequence.current) return;
      const envelope = raw as { data?: Record<string, unknown> | MailThread[]; page?: { next_cursor?: string; has_more?: boolean } };
      const page = Array.isArray(envelope.data) ? { threads: envelope.data, page: envelope.page } : dataOf<Record<string, any>>(raw);
      const list = page.threads || [];
      setThreads(previous => append ? [...previous, ...list] : list);
      setCursor(page.page?.next_cursor ?? null);
      setHasMore(!!page.page?.has_more);
      if (!append && !query && page.mailboxes) {
        setMailboxes(page.mailboxes); setMailboxId(page.selected_mailbox_id || page.mailboxes[0]?.id || "");
        setLabels(page.labels || []);
        const key = `mailg-mailboxes:${workspaceId}`;
        let saved: string[] = [];
        try { saved = JSON.parse(localStorage.getItem(key) || "[]"); } catch { /* invalid preference */ }
        const valid = saved.filter(id => page.mailboxes.some((mailbox: Mailbox) => mailbox.id === id));
        if (valid.length) setSelectedMailboxIds(valid);
        else if (!chooserPrompted.current) { chooserPrompted.current = true; setChooserIds(page.mailboxes[0]?.id ? [page.mailboxes[0].id] : []); setChooserOpen(true); }
      }
    } catch (error) { setToast(error instanceof Error ? error.message : "Could not load mail"); }
    finally { if (sequence === loadSequence.current) setLoading(false); }
  }, [mode, view, mailboxId, labelId, query, workspaceId]);

  useEffect(() => {
    if (mode !== "live" || !workspaceId) return;
    let cancelled = false;
    Promise.all([workspaceClient.request("products"), workspaceClient.request("mailboxes")]).then(async ([rawProducts, rawMailboxes]) => {
      const available = dataOf<Product[]>(rawProducts);
      if (cancelled) return;
      setProducts(available);
      const mapping: Record<string, string> = Object.fromEntries(dataOf<Mailbox[]>(rawMailboxes).filter(mailbox => mailbox.product_id).map(mailbox => [mailbox.id, mailbox.product_id!]));
      // Older Banger responses omit product_id. Product-scoped reads still
      // enforce membership, so discover it without guessing from brand names.
      const scoped = await Promise.all(available.map(async product => ({ productId: product.id, mailboxes: dataOf<Mailbox[]>(await createMailClient(product.id).request("mailboxes")) })));
      const memberships = new Map<string, string[]>();
      for (const group of scoped) for (const mailbox of group.mailboxes) memberships.set(mailbox.id, [...(memberships.get(mailbox.id) || []), group.productId]);
      for (const [id, owners] of memberships) if (owners.length === 1) mapping[id] = owners[0];
      if (!cancelled) setMailboxProducts(mapping);
    }).catch(error => { if (!cancelled) setToast(error instanceof Error ? error.message : "Could not load mailbox products"); });
    return () => { cancelled = true; };
  }, [mode, workspaceId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { loadRef.current = () => load(); }, [load]);
  useEffect(() => {
    if (mode !== "live" || !workspaceId) return;
    return subscribeRealtime(workspaceId, signal => {
      const mailboxIds = "mailbox_ids" in signal ? signal.mailbox_ids : undefined;
      const topics: string[] = "topics" in signal ? signal.topics || [] : [];
      if (mailboxIds?.length && mailboxId && !mailboxIds.includes(mailboxId)) return;
      if (signal.type === "reconcile" || signal.type === "new_mail" || topics.some(topic => ["threads", "messages", "drafts"].includes(topic))) void loadRef.current();
      if (signal.type === "reconcile" || topics.includes("labels")) mailClient.labels(mailboxId).then(raw => setLabels(dataOf<Label[]>(raw))).catch(() => undefined);
    });
  }, [mode, workspaceId, mailboxId]);
  useEffect(() => {
    if (mode !== "live" || view !== "filters") return;
    mailClient.filters(mailboxId).then(raw => setFilters(dataOf<Filter[]>(raw))).catch(error => setToast(error.message));
  }, [mode, view, mailboxId]);

  useEffect(() => {
    if (mode !== "live" || !threadId) return;
    let cancelled = false;
    workspaceClient.thread(threadId).then(raw => {
      if (cancelled) return;
      const value = dataOf<Record<string, any>>(raw);
      const mapped = { thread: value.thread || value, messages: (value.messages || []).map((message: Record<string, any>) => ({ ...message, from_participant: message.from_participant || message.from || null, to_participants: message.to_participants || message.to || [] })) } as Detail;
      setDetail(mapped);
    }).catch(error => { if (!cancelled) setToast(error.message); });
    return () => { cancelled = true; };
  }, [mode, threadId]);

  const filtered = useMemo(() => {
    let list = view === "drafts" ? drafts.filter(d => d.mailbox_id === mailboxId).map(draftAsThread) : threads;
    if (mode === "demo") {
      list = list.filter(t => t.mailbox_id === mailboxId).filter(t => view === "trash" ? t.is_trash : view === "archive" ? t.is_archived : view === "starred" ? t.is_starred && !t.is_trash : view === "sent" ? t.is_sent : view === "snoozed" ? false : view === "drafts" ? true : !t.is_archived && !t.is_trash);
      if (labelId) list = list.filter(t => t.labels.some(name => labels.find(l => l.id === labelId)?.name === name));
      if (query) { const q = query.toLowerCase(); list = list.filter(t => [t.subject, t.snippet, t.participants[0]?.name, t.participants[0]?.email].join(" ").toLowerCase().includes(q)); }
      if (view === "inbox" && !query && !labelId) {
        const promotions = new Set(["demo-4", "demo-12"]), social = new Set(["demo-8"]);
        list = list.filter(t => category === "Promotions" ? promotions.has(t.id) : category === "Social" ? social.has(t.id) : !promotions.has(t.id) && !social.has(t.id));
      }
    }
    if (mode === "live" && !query && !labelId) {
      if (view === "inbox") list = list.filter(t => !t.is_trash && !t.is_archived);
      if (view === "trash") list = list.filter(t => t.is_trash);
      if (view === "archive") list = list.filter(t => t.is_archived && !t.is_trash);
    }
    if (view === "starred") list = list.filter(t => t.is_starred && !t.is_trash);
    return list;
  }, [threads, drafts, mode, view, labelId, labels, query, mailboxId, category]);

  const selectionHasUnread = filtered.some(thread => selected.has(thread.id) && thread.unread_count > 0);

  const openView = (next: View, label: string | null = null) => { setView(next); setLabelId(label); setThreadId(null); setDetail(null); setSelected(new Set()); setCursor(null); setQuery(""); setSearchInput(""); };
  const openThread = (thread: MailThread) => {
    if (view === "drafts") { const draft = drafts.find(item => item.id === thread.id); if (draft) beginCompose({ id: draft.id, version: draft.version, to: draft.to.map(item => item.email).join(", "), cc: (draft.cc || []).map(item => item.email).join(", "), bcc: (draft.bcc || []).map(item => item.email).join(", "), subject: draft.subject, body: draft.body_text, threadId: draft.thread_id, attachments: draft.attachments }); return; }
    setThreadId(thread.id); setDetail({ thread, messages: [{ id: `${thread.id}-msg`, sent_at: thread.last_message_at, body_text: `${thread.snippet}\n\nBest,\n${thread.participants[0]?.name || ""}`, from_participant: thread.participants[0] || null, to_participants: [{ email: "you@example.com" }], attachments: thread.has_attachments ? [{ id: "demo-attachment", filename: "project-notes.pdf", size_bytes: 234138 }] : [] }] });
    if (thread.unread_count) void perform([thread.id], "mark_read", false);
  };
  const toggleSelect = (id: string) => setSelected(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const perform = async (ids: string[], action: string, notify = true, parameters?: Record<string, unknown>) => {
    if (!ids.length) return;
    if (view === "drafts") {
      if (action !== "trash") return;
      try {
        if (mode === "live") await Promise.all(ids.map(id => mailClient.request(`drafts/${id}`, { method: "DELETE" })));
        setDrafts(items => items.filter(item => !ids.includes(item.id)));
        setSelected(new Set());
        setToast("Draft discarded");
      } catch (error) { setToast(error instanceof Error ? error.message : "Could not discard draft"); }
      return;
    }
    const previous = threads;
    setThreads(items => items.map(t => ids.includes(t.id) ? {
      ...t,
      ...(action === "mark_read" ? { unread_count: 0 } : {}), ...(action === "mark_unread" ? { unread_count: 1 } : {}),
      ...(action === "star" ? { is_starred: true } : {}), ...(action === "unstar" ? { is_starred: false } : {}),
      ...(action === "archive" ? { is_archived: true } : {}), ...(action === "unarchive" ? { is_archived: false } : {}),
      ...(action === "trash" ? { is_trash: true } : {}), ...(action === "restore" ? { is_trash: false } : {}),
      ...(action === "add_label" ? { labels: [...new Set([...t.labels, labels.find(l => l.id === parameters?.label_id)?.name || ""])] } : {}),
      ...(action === "remove_label" ? { labels: t.labels.filter(l => l !== labels.find(item => item.id === parameters?.label_id)?.name) } : {}),
    } : t));
    try {
      const settled = mode === "live" ? await Promise.all(ids.map(id => {
        // Preserve read → unread (and other rapid action) ordering per thread.
        const preceding = commandQueue.current.get(id) || Promise.resolve(true);
        const pending = preceding.catch(() => false).then(async () => {
          const raw = await mailClient.command(id, action, parameters);
          return waitForCommand(dataOf<{ id: string }>(raw).id, mailClient);
        });
        commandQueue.current.set(id, pending);
        return pending.finally(() => { if (commandQueue.current.get(id) === pending) commandQueue.current.delete(id); });
      })) : [true];
      if (notify) setToast(settled.every(Boolean) ? `${action.replaceAll("_", " ")} applied` : "Action queued. Syncing with Banger…");
      setSelected(new Set());
      if (mode === "live") setTimeout(() => void loadRef.current(), 850);
    } catch (error) { if (mode === "live") void loadRef.current(); else setThreads(previous); setToast(error instanceof Error ? error.message : "Action failed"); }
  };

  const currentThread = threads.find(t => t.id === threadId) || detail?.thread;
  const activeMailbox = mailboxes.find(m => m.id === mailboxId) || mailboxes[0];
  const unreadCount = threads.filter(t => t.mailbox_id === mailboxId && t.unread_count > 0 && !t.is_archived && !t.is_trash).length;

  const beginCompose = (draft: Draft = emptyDraft) => { draftIdentity.current = { id: draft.id, version: draft.version }; setCompose({ ...draft }); draftAttachmentsRef.current = draft.attachments || []; setDraftAttachments(draftAttachmentsRef.current); setComposeMinimized(false); setDraftStatus(""); lastDraftPayload.current = ""; };
  const draftPayload = (draft: Draft) => ({ mailbox_id: mailboxId, ...(draft.threadId ? { thread_id: draft.threadId } : {}), ...(draft.version ? { version: draft.version } : {}), to: recipients(draft.to), cc: recipients(draft.cc), bcc: recipients(draft.bcc), subject: draft.subject, body_text: draft.body });
  const persistDraft = async (draft: Draft): Promise<Draft> => {
    if (mode !== "live") {
      const id = draftIdentity.current.id || `demo-draft-${Date.now()}`;
      const version = (draftIdentity.current.version || 0) + 1;
      draftIdentity.current = { id, version };
      const next = { ...draft, id, version };
      setDrafts(items => [{ id, mailbox_id: mailboxId, thread_id: draft.threadId, version, to: recipients(draft.to), cc: recipients(draft.cc), bcc: recipients(draft.bcc), subject: draft.subject, body_text: draft.body, updated_at: new Date().toISOString(), attachments: draftAttachmentsRef.current }, ...items.filter(item => item.id !== id)]);
      setCompose(current => current && current.to === draft.to && current.subject === draft.subject && current.body === draft.body ? next : current);
      setDraftStatus("Saved to drafts"); return next;
    }
    const payload = { ...draftPayload(draft), ...(draftIdentity.current.version ? { version: draftIdentity.current.version } : {}) };
    const raw = await mailClient.saveDraft(payload, draftIdentity.current.id);
    const saved = dataOf<{ id: string; version?: number }>(raw);
    draftIdentity.current = { id: saved.id, version: saved.version };
    setDrafts(items => [{ id: saved.id, mailbox_id: mailboxId, thread_id: draft.threadId, version: saved.version, to: recipients(draft.to), cc: recipients(draft.cc), bcc: recipients(draft.bcc), subject: draft.subject, body_text: draft.body, updated_at: new Date().toISOString(), attachments: draftAttachmentsRef.current }, ...items.filter(item => item.id !== saved.id)]);
    const next = { ...draft, id: saved.id, version: saved.version };
    setCompose(current => current && current.to === draft.to && current.subject === draft.subject && current.body === draft.body ? next : current);
    setDraftStatus("Saved to drafts");
    return next;
  };
  const refreshDraftAttachments = async (id: string) => {
    const fresh = dataOf<DraftRecord>(await mailClient.request(`drafts/${id}`));
    draftIdentity.current = { id, version: fresh.version };
    draftAttachmentsRef.current = fresh.attachments || [];
    setDraftAttachments(draftAttachmentsRef.current);
    setDrafts(items => items.map(item => item.id === id ? { ...item, version: fresh.version, attachments: fresh.attachments || [] } : item));
    setCompose(current => current ? { ...current, id, version: fresh.version, attachments: fresh.attachments || [] } : null);
  };
  const queueAttachments = (files: File[]) => {
    if (!compose || !files.length) return;
    if (files.some(file => file.size < 1 || file.size > 25 * 1024 * 1024)) { setToast("Each attachment must be between 1 byte and 25 MiB"); return; }
    const snapshot = { ...compose };
    setUploading(true);
    setDraftStatus("Attaching…");
    draftSaveChain.current = draftSaveChain.current.then(async () => {
      const saved = await persistDraft(snapshot);
      if (mode === "live") {
        for (const file of files) await mailClient.uploadDraftAttachment(saved.id!, file);
        await refreshDraftAttachments(saved.id!);
      } else {
        const additions = files.map(file => ({ id: `demo-file-${crypto.randomUUID()}`, filename: file.name, size_bytes: file.size }));
        draftAttachmentsRef.current = [...draftAttachmentsRef.current, ...additions];
        setDraftAttachments(draftAttachmentsRef.current);
        setDrafts(items => items.map(item => item.id === saved.id ? { ...item, attachments: draftAttachmentsRef.current } : item));
      }
      setDraftStatus("Saved to drafts");
    }).catch(error => { setDraftStatus("Could not attach file"); setToast(error instanceof Error ? error.message : "Could not attach file"); }).finally(() => setUploading(false));
  };
  const removeAttachment = (attachment: DraftAttachment) => {
    if (!compose) return;
    setUploading(true);
    draftSaveChain.current = draftSaveChain.current.then(async () => {
      if (mode === "live" && draftIdentity.current.id) {
        await mailClient.request(`drafts/${draftIdentity.current.id}/attachments/${attachment.id}`, { method: "DELETE" });
        await refreshDraftAttachments(draftIdentity.current.id);
      } else {
        draftAttachmentsRef.current = draftAttachmentsRef.current.filter(item => item.id !== attachment.id);
        setDraftAttachments(draftAttachmentsRef.current);
        setDrafts(items => items.map(item => item.id === draftIdentity.current.id ? { ...item, attachments: draftAttachmentsRef.current } : item));
      }
    }).catch(error => setToast(error instanceof Error ? error.message : "Could not remove attachment")).finally(() => setUploading(false));
  };
  const closeCompose = async () => {
    if (!compose) return;
    const snapshot = { ...compose };
    try {
      await draftSaveChain.current;
      if (snapshot.to || snapshot.subject || snapshot.body) await persistDraft(snapshot);
      setCompose(null);
    } catch (error) { setToast(error instanceof Error ? error.message : "Could not save draft"); }
  };
  const discardCompose = async () => {
    if (!compose) return;
    try {
      await draftSaveChain.current;
      if (mode === "live" && draftIdentity.current.id) await mailClient.request(`drafts/${draftIdentity.current.id}`, { method: "DELETE" });
      if (draftIdentity.current.id) setDrafts(items => items.filter(item => item.id !== draftIdentity.current.id));
      setCompose(null); setToast("Draft discarded");
    } catch (error) { setToast(error instanceof Error ? error.message : "Could not discard draft"); }
  };
  useEffect(() => {
    if (!compose || (!compose.to && !compose.subject && !compose.body)) return;
    const snapshot = { ...compose };
    const serialized = JSON.stringify(draftPayload(snapshot));
    if (serialized === lastDraftPayload.current) return;
    setDraftStatus("Saving…");
    const timer = setTimeout(() => {
      lastDraftPayload.current = serialized;
      draftSaveChain.current = draftSaveChain.current.then(() => persistDraft(snapshot)).catch(error => { setDraftStatus("Could not save"); setToast(error.message); });
    }, 1200);
    return () => clearTimeout(timer);
  }, [compose?.to, compose?.cc, compose?.bcc, compose?.subject, compose?.body, compose?.threadId, mode]);

  const send = async () => {
    if (!compose || sending) return;
    if (!recipients(compose.to).length) { setToast("Add at least one recipient"); return; }
    if (!compose.subject.trim() && !compose.body.trim()) { setToast("Add a subject or message"); return; }
    setSending(true);
    try {
      await draftSaveChain.current;
      const current = compose;
      if (mode === "live") {
        const saved = await persistDraft(current);
        const queued = dataOf<{ id: string }>(await mailClient.sendDraftOnce(saved.id!));
        if (!queued.id) throw new Error("Banger did not return a send command");
        const delivered = await waitForCommand(queued.id, mailClient);
        if (!delivered) { setToast("Send is still processing in Banger. Check Sent before trying again."); return; }
      } else {
        setThreads(items => [{ id: `demo-sent-${Date.now()}`, mailbox_id: mailboxId, subject: current.subject || "(no subject)", snippet: current.body.slice(0, 130), last_message_at: new Date().toISOString(), message_count: 1, unread_count: 0, is_archived: false, is_trash: false, is_starred: false, is_sent: true, has_attachments: false, labels: [], participants: [{ name: "me", email: activeMailbox?.address || "you@example.com" }] }, ...items]);
      }
      setDrafts(items => items.filter(item => item.id !== draftIdentity.current.id));
      setCompose(null); setToast("Message sent");
    } catch (error) { setToast(error instanceof Error ? error.message : "Could not send"); }
    finally { setSending(false); }
  };

  const beginLabelEdit = (label: Label | "new") => { setLabelEditor(label); setLabelName(label === "new" ? "" : label.name); setLabelColor(label === "new" ? "#7baaf7" : label.color || "#7baaf7"); };
  const saveLabel = async () => {
    if (!labelName.trim()) return;
    try {
      if (mode === "live") {
        const id = labelEditor === "new" ? null : (labelEditor as Label).id;
        await mailClient.request(id ? `labels/${id}` : "labels", { method: id ? "PATCH" : "POST", body: JSON.stringify({ name: labelName.trim(), color: labelColor, mailbox_id: mailboxId }) });
        setLabels(dataOf<Label[]>(await mailClient.labels(mailboxId)));
      } else {
        if (labelEditor === "new") setLabels(items => [...items, { id: `demo-label-${Date.now()}`, name: labelName.trim(), color: labelColor }]);
        else setLabels(items => items.map(l => l.id === (labelEditor as Label).id ? { ...l, name: labelName.trim(), color: labelColor } : l));
      }
      setLabelEditor(null); setToast("Label saved");
    } catch (error) { setToast(error instanceof Error ? error.message : "Could not save label"); }
  };
  const deleteLabel = async (label: Label) => {
    try { if (mode === "live") await mailClient.request(`labels/${label.id}`, { method: "DELETE" }); setLabels(items => items.filter(l => l.id !== label.id)); setLabelEditor(null); setToast("Label deleted"); }
    catch (error) { setToast(error instanceof Error ? error.message : "Could not delete label"); }
  };

  const openFilterEditor = (filter: Filter | "new") => {
    const conditions = filter === "new" ? {} : filter.exact_conditions || {};
    const first = (key: string) => { const value = conditions[key]; return Array.isArray(value) ? safeText(value[0]) : ""; };
    setFilterEditor(filter); setFilterPreview(""); setFilterForm({ name: filter === "new" ? "" : filter.name, from: first("from"), to: first("to"), subject: first("subject_contains"), words: first("has_words"), excluded: first("excludes_words"), description: filter === "new" ? "" : filter.description || "", action: filter === "new" ? "apply_label" : filter.actions?.[0]?.type || "apply_label", actionLabel: filter === "new" ? labels[0]?.id || "" : filter.actions?.[0]?.label_id || "" });
  };
  const filterPayload = () => ({ mailbox_id: mailboxId, name: filterForm.name.trim(), description: filterForm.description.trim(), exact_conditions: Object.fromEntries([["from", filterForm.from], ["to", filterForm.to], ["subject_contains", filterForm.subject], ["has_words", filterForm.words], ["excludes_words", filterForm.excluded]].filter(([, v]) => !!v).map(([key, value]) => [key, [value]])), actions: [{ type: filterForm.action, ...(filterForm.action === "apply_label" ? { label_id: filterForm.actionLabel } : {}) }], enabled: true });
  const saveFilter = async () => {
    if (!filterForm.name.trim()) { setToast("Name the filter first"); return; }
    if (filterForm.action === "apply_label" && !filterForm.actionLabel) { setToast("Choose a label for this filter"); return; }
    try {
      const payload = filterPayload();
      if (mode === "live") {
        const id = filterEditor === "new" ? null : (filterEditor as Filter).id;
        await mailClient.request(id ? `triage-rules/${id}` : "triage-rules", { method: id ? "PATCH" : "POST", body: JSON.stringify(payload) });
        setFilters(dataOf<Filter[]>(await mailClient.filters(mailboxId)));
      } else setFilters(items => [...items, { id: `demo-filter-${Date.now()}`, name: payload.name, description: payload.description, enabled: true, actions: payload.actions }]);
      setFilterEditor(null); setToast("Filter enabled");
    } catch (error) { setToast(error instanceof Error ? error.message : "Could not save filter"); }
  };
  const previewFilter = async () => {
    try {
      if (mode === "live") { const raw = await mailClient.request("triage-rules/preview", { method: "POST", body: JSON.stringify({ ...filterPayload(), limit: 20 }) }); const result = dataOf<Record<string, unknown>>(raw); setFilterPreview(JSON.stringify(result, null, 2)); }
      else setFilterPreview("Preview: 3 matching messages in this demo mailbox.");
    } catch (error) { setFilterPreview(error instanceof Error ? error.message : "Preview unavailable"); }
  };

  return <div className={`mg-app theme-${theme}`}>
    <header className="mg-topbar">
      <div className="mg-brand-area"><IconButton icon="menu" label="Toggle main menu" onClick={() => setSidebarOpen(v => !v)} /><div className="mg-logo" aria-label="mailG"><img className="mg-logo-mark" src="/mailg-mark.svg" alt="" width={32} height={26}/><span>mailG</span></div></div>
      <form className="mg-search" onSubmit={event => { event.preventDefault(); setQuery(searchInput.trim()); setThreadId(null); }}><Icon name="search" size={22} /><input value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Search mail" aria-label="Search mail" /><IconButton icon="filter" label="Show search options" onClick={() => setSettingsOpen(true)} /></form>
      <div className="mg-top-actions"><IconButton icon="help" label="Help" onClick={() => setToast("mailG is an open-source mail interface powered by Banger.")} /><IconButton icon="settings" label="Settings" onClick={() => setSettingsOpen(true)} /><IconButton icon="apps" label="Apps" onClick={() => setToast("More apps are coming soon.")} /><button className="mg-avatar" title={activeMailbox?.address} onClick={() => setMailboxMenu(v => !v)}>{(activeMailbox?.display_name || activeMailbox?.address || "M")[0].toUpperCase()}</button></div>
    </header>
    <div className="mg-body">
      <aside className="mg-app-rail" aria-label="Mailbox switcher">{mailboxes.filter(mailbox => selectedMailboxIds.includes(mailbox.id)).map(mailbox => <button key={mailbox.id} className={mailbox.id === mailboxId ? "active" : ""} title={mailbox.address} aria-label={mailbox.address} aria-pressed={mailbox.id === mailboxId} onClick={() => { setMailboxId(mailbox.id); openView("inbox"); }}><ProductAvatar product={productForMailbox(mailbox)} fallback={mailbox.display_name || mailbox.address} /><small className="mg-rail-name">{mailbox.display_name || mailbox.address.split("@")[0]}</small><small className="mg-rail-domain">{mailbox.address.split("@")[1] || ""}</small></button>)}<button className="mg-rail-manage" title="Choose mailboxes" onClick={() => { setChooserIds(selectedMailboxIds); setChooserOpen(true); }}><span className="mg-rail-add"><Icon name="plus" size={20}/></span><small>Manage</small></button></aside>
      <aside className={`mg-sidebar${sidebarOpen ? "" : " collapsed"}`}>
        <button className="mg-compose-button" onClick={() => beginCompose()}><Icon name="compose" size={23}/><span>Compose</span></button>
        <nav className="mg-nav" aria-label="Mail folders">{nav.map(item => <button key={item.view} className={`mg-nav-item${view === item.view && !labelId ? " current" : ""}`} onClick={() => openView(item.view)} title={item.label}><Icon name={item.icon} size={18} filled={view === item.view && item.view === "inbox"}/><span>{item.label}</span>{item.view === "inbox" && unreadCount > 0 && <b>{unreadCount}</b>}</button>)}</nav>
        <div className="mg-sidebar-divider"/><div className="mg-label-heading"><span>Labels</span><IconButton icon="plus" label="Create new label" onClick={() => beginLabelEdit("new")} size={18}/></div>
        <nav className="mg-nav mg-label-nav" aria-label="Labels">{labels.map(label => <button key={label.id} className={`mg-nav-item${labelId === label.id ? " current" : ""}`} onClick={() => openView("inbox", label.id)}><span className="mg-label-dot" style={{ background: label.color || "#8d94a3" }} /><span>{label.name}</span></button>)}</nav>
        <div className="mg-sidebar-bottom"><button onClick={() => openView("labels")}><Icon name="tag" size={18}/><span>Manage labels</span></button><button onClick={() => openView("filters")}><Icon name="filterRules" size={18}/><span>Filters &amp; triggers</span></button></div>
      </aside>
      <main className="mg-main">
        <div className="mg-main-inner">
          {view === "labels" ? <section className="mg-management"><div className="mg-management-heading"><div><h1>Labels</h1><p>Organize mail in this mailbox.</p></div><button className="mg-primary-button" onClick={() => beginLabelEdit("new")}><Icon name="plus" size={18}/> New label</button></div><div className="mg-manage-list">{labels.map(label => <div className="mg-manage-row" key={label.id}><span className="mg-label-dot" style={{ background: label.color || "#8d94a3" }}/><strong>{label.name}</strong><button onClick={() => beginLabelEdit(label)}>Edit</button></div>)}</div></section>
          : view === "filters" ? <section className="mg-management"><div className="mg-management-heading"><div><h1>Filters &amp; triggers</h1><p>Automatically organize incoming messages.</p></div><button className="mg-primary-button" onClick={() => openFilterEditor("new")}><Icon name="plus" size={18}/> Create filter</button></div><div className="mg-manage-list">{filters.length ? filters.map(filter => <div className="mg-manage-row" key={filter.id}><Icon name="filterRules" size={18}/><div><strong>{filter.name}</strong><small>{filter.description || filter.actions?.map(a => a.type.replaceAll("_", " ")).join(", ")}</small></div><span className={`mg-status${filter.enabled ? " enabled" : ""}`}>{filter.enabled ? "On" : "Off"}</span><button onClick={() => openFilterEditor(filter)}>Edit</button></div>) : <div className="mg-empty">No filters yet. Create one to sort new mail automatically.</div>}</div></section>
          : view === "snoozed" ? <div className="mg-empty mg-large-empty"><Icon name="clock" size={42}/><h2>No snoozed conversations</h2><p>Snoozed mail will appear here.</p></div>
          : threadId && currentThread ? <section className="mg-thread-view"><div className="mg-toolbar"><IconButton icon="back" label="Back to mail" onClick={() => { setThreadId(null); setDetail(null); }} /><span className="mg-toolbar-separator"/><IconButton icon="archive" label="Archive" onClick={() => { void perform([threadId], "archive"); setThreadId(null); }} /><IconButton icon="trash" label="Delete" onClick={() => { void perform([threadId], "trash"); setThreadId(null); }} /><IconButton icon="unread" label="Mark as unread" onClick={() => { void perform([threadId], "mark_unread"); setThreadId(null); }} /><span className="mg-toolbar-spacer"/><span className="mg-range">1 of {filtered.length}</span><IconButton icon="chevronLeft" label="Previous" onClick={() => setThreadId(null)} /><IconButton icon="chevronRight" label="Next" onClick={() => setThreadId(null)} /></div><div className="mg-thread-content"><div className="mg-thread-title"><h1>{currentThread.subject || "(no subject)"}</h1>{currentThread.labels.map(label => <span className="mg-chip" key={label}>{label}</span>)}</div>{detail?.messages.map(message => <article className="mg-message" key={message.id}><div className="mg-message-header"><div className="mg-sender-avatar">{(message.from_participant?.name || message.from_participant?.email || "?")[0].toUpperCase()}</div><div className="mg-message-who"><strong>{message.from_participant?.name || message.from_participant?.email || "Unknown"}</strong><span>to {message.to_participants?.map(p => p.email).join(", ") || "me"}</span></div><time>{formatDate(message.sent_at)}</time><IconButton icon="star" label="Star" onClick={() => void perform([threadId], currentThread.is_starred ? "unstar" : "star")} /><IconButton icon="reply" label="Reply" onClick={() => beginCompose({ ...emptyDraft, to: message.from_participant?.email || "", subject: `Re: ${currentThread.subject}`, threadId })} /><IconButton icon="more" label="More" onClick={() => setToast("Use the toolbar for more actions.")} /></div>{mode === "live" && message.body_html_url ? <MessageBody messageId={message.id} sender={message.from_participant?.email || "sender"} /> : <div className="mg-message-body">{message.body_text || currentThread.snippet}</div>}{message.attachments?.length ? <div className="mg-attachments">{message.attachments.map(file => <a key={file.id} href={mode === "live" ? `/api/banger/attachments/${file.id}/content` : "#"} onClick={event => { if (mode === "demo") event.preventDefault(); }} className="mg-attachment"><Icon name="attachment" size={18}/><span>{file.filename}</span><small>{(file.size_bytes / 1024).toFixed(0)} KB</small></a>)}</div> : null}</article>)}<div className="mg-reply-actions"><button onClick={() => beginCompose({ ...emptyDraft, to: currentThread.participants[0]?.email || "", subject: `Re: ${currentThread.subject}`, threadId })}><Icon name="reply" size={17}/> Reply</button><button onClick={() => beginCompose({ ...emptyDraft, subject: `Fwd: ${currentThread.subject}`, body: `\n\n---------- Forwarded message ----------\n${currentThread.snippet}`, threadId })}><Icon name="forward" size={17}/> Forward</button></div></div></section>
          : <section className="mg-inbox" aria-busy={loading}><div className="mg-toolbar"><label className="mg-select-all"><input type="checkbox" aria-label="Select all visible messages" checked={filtered.length > 0 && selected.size === filtered.length} onChange={event => setSelected(event.target.checked ? new Set(filtered.map(t => t.id)) : new Set())}/></label><IconButton icon="chevronDown" label="Selection options" onClick={() => setSelected(new Set(filtered.map(t => t.id)))} size={14}/>{selected.size ? <>{view !== "drafts" && <IconButton icon="archive" label="Archive selected" onClick={() => void perform([...selected], "archive")} />}<IconButton icon="trash" label={view === "drafts" ? "Discard selected drafts" : "Delete selected"} onClick={() => void perform([...selected], "trash")} />{view !== "drafts" && <><IconButton icon={selectionHasUnread ? "read" : "unread"} label={selectionHasUnread ? "Mark selected as read" : "Mark selected as unread"} onClick={() => void perform([...selected], selectionHasUnread ? "mark_read" : "mark_unread")} /><div className="mg-label-picker"><select aria-label="Apply label to selected" defaultValue="" onChange={event => { if (event.target.value) void perform([...selected], "add_label", true, { label_id: event.target.value }); event.target.value = ""; }}><option value="">Label as…</option>{labels.map(label => <option key={label.id} value={label.id}>{label.name}</option>)}</select></div></>}</> : <IconButton icon="refresh" label="Refresh" onClick={() => void load()} />}<span className="mg-toolbar-spacer"/><span className="mg-range">{filtered.length ? `1–${filtered.length} of ${mode === "demo" ? filtered.length : hasMore ? "many" : filtered.length}` : "0 messages"}</span><IconButton icon="chevronLeft" label="Previous page" disabled /><IconButton icon="chevronRight" label="Next page" disabled={!hasMore} onClick={() => void load(true, cursor)} /></div>{mode === "demo" && view === "inbox" && !labelId && !query && <div className="mg-category-tabs">{[["Primary", "inbox"], ["Promotions", "tag"], ["Social", "contacts"]].map(([name, icon]) => <button key={name} className={category === name ? "current" : ""} onClick={() => setCategory(name)}><Icon name={icon} size={18}/><span>{name}</span></button>)}</div>}<div className="mg-mail-list">{loading && !filtered.length && <div className="mg-loading" role="status">Loading mail…</div>}{filtered.length ? filtered.map(thread => <div className={`mg-mail-row${thread.unread_count ? " unread" : ""}${selected.has(thread.id) ? " selected" : ""}`} key={thread.id} onClick={() => openThread(thread)}><input type="checkbox" aria-label={`Select ${thread.subject}`} checked={selected.has(thread.id)} onClick={event => event.stopPropagation()} onChange={() => toggleSelect(thread.id)}/>{view !== "drafts" ? <button className={`mg-star${thread.is_starred ? " starred" : ""}`} title={thread.is_starred ? "Unstar" : "Star"} onClick={event => { event.stopPropagation(); void perform([thread.id], thread.is_starred ? "unstar" : "star"); }}><Icon name="star" size={18} filled={thread.is_starred}/></button> : <span className="mg-star"/>}<span className="mg-row-sender">{thread.participants[0]?.name || thread.participants[0]?.email || "Unknown"}{thread.message_count > 1 && <small> ({thread.message_count})</small>}</span><span className="mg-row-subject"><strong>{thread.subject || "(no subject)"}</strong>{thread.labels.filter(l => l !== "Updates").map(label => <span className="mg-row-label" key={label}>{label}</span>)}<span className="mg-row-snippet"> – {thread.snippet}</span></span><span className="mg-row-date">{thread.has_attachments && <Icon name="attachment" size={15}/>} {formatDate(thread.last_message_at)}</span><div className="mg-row-hover-actions" onClick={event => event.stopPropagation()}>{view !== "drafts" && <IconButton icon="archive" label="Archive" onClick={() => void perform([thread.id], "archive")} size={18}/>}<IconButton icon="trash" label={view === "drafts" ? "Discard draft" : "Delete"} onClick={() => void perform([thread.id], "trash")} size={18}/>{view !== "drafts" && <IconButton icon={thread.unread_count ? "read" : "unread"} label={thread.unread_count ? "Mark as read" : "Mark as unread"} onClick={() => void perform([thread.id], thread.unread_count ? "mark_read" : "mark_unread")} size={18}/>}</div></div>) : !loading && <div className="mg-empty">No conversations here.</div>}</div><div className="mg-footer">{mode === "demo" ? "Demo mailbox · Connect Banger to use your mail" : "Powered by Banger"}<span>mailG</span></div></section>}
        </div>
      </main>
      <aside className="mg-utility-rail" aria-hidden="true" />
    </div>
    {mailboxMenu && <div className="mg-account-popover"><strong>{activeMailbox?.display_name || "mailG"}</strong><small>{activeMailbox?.address}</small>{mailboxes.map(mailbox => <button key={mailbox.id} onClick={() => { setMailboxId(mailbox.id); setMailboxMenu(false); setThreadId(null); }}><ProductAvatar product={productForMailbox(mailbox)} fallback={mailbox.display_name || mailbox.address} />{mailbox.address}</button>)}{connected ? <button onClick={() => void mailClient.signOut()}>Sign out</button> : <button onClick={() => mailClient.signIn()}>Connect Banger</button>}</div>}
    {settingsOpen && <div className="mg-overlay" onClick={() => setSettingsOpen(false)}><aside className="mg-settings" onClick={event => event.stopPropagation()}><div className="mg-settings-header"><h2>Quick settings</h2><IconButton icon="close" label="Close settings" onClick={() => setSettingsOpen(false)}/></div><h3>Theme</h3><div className="mg-theme-grid">{(["light", "dark", "landscape"] as Theme[]).map(option => <button key={option} className={theme === option ? "selected" : ""} onClick={() => setTheme(option)}><span className={`mg-theme-preview preview-${option}`}><i/><i/><i/></span><span>{option === "landscape" ? "Landscape" : option === "dark" ? "Dark" : "Default"}</span></button>)}</div><h3>Account</h3><p className="mg-settings-copy">{connected ? `Connected as ${activeMailbox?.address || "your Banger mailbox"}` : "Explore the demo or connect your Banger workspace to use live mail."}</p><button className="mg-outline-button" onClick={() => connected ? void mailClient.signOut() : mailClient.signIn()}>{connected ? "Disconnect" : "Connect Banger"}</button></aside></div>}
    {compose && <div className={`mg-compose-window${composeMinimized ? " minimized" : ""}`}><div className="mg-compose-header"><span>{compose.subject || "New Message"}</span><div><IconButton icon={composeMinimized ? "expand" : "minimize"} label={composeMinimized ? "Expand" : "Minimize"} onClick={() => setComposeMinimized(v => !v)} size={16}/><IconButton icon="close" label="Save and close" onClick={() => void closeCompose()} size={16}/></div></div>{!composeMinimized && <><div className="mg-compose-fields"><div><label>To</label><input value={compose.to} onChange={event => setCompose({ ...compose, to: event.target.value })} placeholder="Recipients" aria-label="To"/></div><div><label>Cc</label><input value={compose.cc} onChange={event => setCompose({ ...compose, cc: event.target.value })} aria-label="Cc"/></div><div><label>Bcc</label><input value={compose.bcc} onChange={event => setCompose({ ...compose, bcc: event.target.value })} aria-label="Bcc"/></div><input className="mg-subject-input" value={compose.subject} onChange={event => setCompose({ ...compose, subject: event.target.value })} placeholder="Subject" aria-label="Subject"/></div><textarea className="mg-compose-body" value={compose.body} onChange={event => setCompose({ ...compose, body: event.target.value })} aria-label="Message body"/>{draftAttachments.length > 0 && <div className="mg-compose-attachments">{draftAttachments.map(file => <span key={file.id}><Icon name="attachment" size={15}/>{file.filename}<button type="button" aria-label={`Remove ${file.filename}`} onClick={() => removeAttachment(file)}>×</button></span>)}</div>}<input ref={attachmentInput} className="mg-file-input" type="file" multiple onChange={event => { queueAttachments(Array.from(event.target.files || [])); event.target.value = ""; }}/><div className="mg-compose-footer"><button className="mg-send-button" onClick={() => void send()} disabled={sending || uploading}>{sending ? "Sending…" : "Send"}</button><IconButton icon="attachment" label="Attach files" onClick={() => attachmentInput.current?.click()} disabled={uploading}/><span>{draftStatus}</span><IconButton icon="trash" label="Discard draft" onClick={() => void discardCompose()}/></div></>}</div>}
    {chooserOpen && <div className="mg-modal-shade"><div className="mg-modal mg-mailbox-chooser"><h2>Choose your mailboxes</h2><p>Select the mailboxes you want to switch between in mailG.</p><div className="mg-chooser-list">{mailboxes.map(mailbox => <label key={mailbox.id}><input type="checkbox" checked={chooserIds.includes(mailbox.id)} onChange={event => setChooserIds(ids => event.target.checked ? [...ids, mailbox.id] : ids.filter(id => id !== mailbox.id))}/><ProductAvatar product={productForMailbox(mailbox)} fallback={mailbox.display_name || mailbox.address} /><span><strong>{mailbox.display_name || mailbox.address}</strong><small>{mailbox.address}</small></span></label>)}</div><div className="mg-modal-actions"><span/>{selectedMailboxIds.length > 0 && <button onClick={() => setChooserOpen(false)}>Cancel</button>}<button className="mg-primary-button" disabled={!chooserIds.length} onClick={() => { if (!chooserIds.length) return; setSelectedMailboxIds(chooserIds); localStorage.setItem(`mailg-mailboxes:${workspaceId || "demo"}`, JSON.stringify(chooserIds)); if (!chooserIds.includes(mailboxId)) setMailboxId(chooserIds[0]); setChooserOpen(false); }}>Save selection</button></div></div></div>}
    {labelEditor && <div className="mg-modal-shade" onClick={() => setLabelEditor(null)}><div className="mg-modal" onClick={event => event.stopPropagation()}><h2>{labelEditor === "new" ? "New label" : "Edit label"}</h2><label>Label name<input value={labelName} onChange={event => setLabelName(event.target.value)} autoFocus/></label><label>Color<input type="color" value={labelColor} onChange={event => setLabelColor(event.target.value)}/></label><div className="mg-modal-actions">{labelEditor !== "new" && <button className="mg-danger" onClick={() => void deleteLabel(labelEditor as Label)}>Delete</button>}<span/><button onClick={() => setLabelEditor(null)}>Cancel</button><button className="mg-primary-button" onClick={() => void saveLabel()}>Save</button></div></div></div>}
    {filterEditor && <div className="mg-modal-shade" onClick={() => setFilterEditor(null)}><div className="mg-modal mg-filter-modal" onClick={event => event.stopPropagation()}><h2>{filterEditor === "new" ? "Create a filter" : "Edit filter"}</h2><p>Choose matching conditions, then what should happen to new mail.</p><div className="mg-filter-grid">{[["name", "Filter name"], ["from", "From"], ["to", "To"], ["subject", "Subject"], ["words", "Has the words"], ["excluded", "Doesn’t have"]].map(([key, title]) => <label key={key}>{title}<input value={filterForm[key as keyof typeof filterForm]} onChange={event => setFilterForm({ ...filterForm, [key]: event.target.value })}/></label>)}</div><label>Natural-language condition<textarea value={filterForm.description} onChange={event => setFilterForm({ ...filterForm, description: event.target.value })} placeholder="For example: receipts from travel bookings"/></label><div className="mg-filter-action"><label>Then<select value={filterForm.action} onChange={event => setFilterForm({ ...filterForm, action: event.target.value })}><option value="apply_label">Apply label</option><option value="archive">Archive</option><option value="mark_read">Mark as read</option><option value="star">Star</option></select></label>{filterForm.action === "apply_label" && <label>Label<select value={filterForm.actionLabel} onChange={event => setFilterForm({ ...filterForm, actionLabel: event.target.value })}>{labels.map(label => <option key={label.id} value={label.id}>{label.name}</option>)}</select></label>}</div>{filterPreview && <pre className="mg-filter-preview">{filterPreview}</pre>}<div className="mg-modal-actions"><button onClick={() => void previewFilter()}>Preview matches</button><span/><button onClick={() => setFilterEditor(null)}>Cancel</button><button className="mg-primary-button" onClick={() => void saveFilter()}>Enable filter</button></div></div></div>}
    {toast && <div className="mg-toast" role="status">{toast}<button onClick={() => setToast("")} aria-label="Dismiss"><Icon name="close" size={15}/></button></div>}
  </div>;
}
