import { createIcons, Settings, X, KeyRound, Copy, ArrowUpRight, LockKeyhole, ArrowRight, Search, Radio, ChevronRight, RefreshCw, Mail, MailCheck, Check } from 'lucide';
const icons = { Settings, X, KeyRound, Copy, ArrowUpRight, LockKeyhole, ArrowRight, Search, Radio, ChevronRight, RefreshCw, Mail, MailCheck, Check };
export function paintIcons() { createIcons({ icons, nameAttr: 'data-icon', attrs: { class: 'icon', 'aria-hidden': 'true' } }); }
export function icon(name) { const element = document.createElement('i'); element.dataset.icon = name; return element; }
export function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
export function buttonText(button, label, iconName, trailing = false) {
  button.replaceChildren();
  if (iconName && !trailing) button.append(icon(iconName));
  button.append(document.createTextNode(label));
  if (iconName && trailing) button.append(icon(iconName));
  paintIcons();
}
export function codeContent(code) {
  const fragment = document.createDocumentFragment();
  const split = code.length === 6 ? 3 : code.length === 8 ? 4 : 0;
  if (split) { fragment.append(code.slice(0, split), element('span', 'code-half', code.slice(split))); }
  else fragment.append(code);
  return fragment;
}
export function alertTitle(item) {
  if (!item.code) return item.title;
  const prefix = `Code ${item.code} · `;
  return item.title.startsWith(prefix) ? item.title.slice(prefix.length) : item.title;
}
export function relativeTime(at) {
  if (!at) return 'Just now';
  const minutes = Math.max(0, Math.floor((Date.now() - at) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
export function initAppearance() {
  const media = matchMedia('(prefers-color-scheme: dark)');
  let preference = 'system';
  try { preference = localStorage.getItem('pulse-appearance') || 'system'; } catch { /* Appearance is optional when storage is unavailable. */ }
  if (import.meta.env.DEV) preference = new URLSearchParams(location.search).get('appearance') || preference;
  const apply = () => {
    document.documentElement.dataset.appearance = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
    document.querySelectorAll('[data-theme]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.theme === preference)));
  };
  document.querySelectorAll('[data-theme]').forEach(button => button.addEventListener('click', () => {
    preference = button.dataset.theme;
    try { localStorage.setItem('pulse-appearance', preference); } catch { /* Use session appearance. */ }
    apply();
  }));
  media.addEventListener('change', apply);
  window.addEventListener('storage', event => { if (event.key === 'pulse-appearance') { preference = event.newValue || 'system'; apply(); } });
  apply();
}
