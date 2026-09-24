import type { CSSProperties } from "react";

const ligatures: Record<string, string> = {
  menu: "menu", search: "search", filter: "tune", help: "help", settings: "settings", apps: "apps",
  compose: "edit_square", inbox: "inbox", star: "star", clock: "schedule", sent: "send", draft: "draft",
  chevronDown: "arrow_drop_down", chevronLeft: "chevron_left", chevronRight: "chevron_right",
  plus: "add", tag: "label", refresh: "refresh", more: "more_vert", archive: "archive",
  trash: "delete", unread: "markunread", read: "mark_email_read", back: "arrow_back",
  attachment: "attach_file", reply: "reply", forward: "forward", close: "close",
  expand: "open_in_full", minimize: "minimize", delete: "delete", picture: "lightbulb",
  calendar: "calendar_today", tasks: "task_alt", contacts: "contacts", edit: "edit",
  check: "check", info: "info", filterRules: "filter_alt",
};

export function Icon({ name, size = 20, filled = false }: { name: string; size?: number; filled?: boolean }) {
  const style: CSSProperties = { fontSize: size, fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 24` };
  return <span className="mg-material-icon" style={style} aria-hidden="true">{ligatures[name] || name}</span>;
}
