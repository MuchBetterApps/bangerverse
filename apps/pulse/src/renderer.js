import { invoke, listen } from './bridge.js';
import { paintIcons, icon, element, buttonText, codeContent, alertTitle, relativeTime, initAppearance } from './ui.js';
const $ = id => document.getElementById(id);
let status;
let catalog = [];
let selected = new Set();
let editing = false;
let catalogLoading = false;
let catalogLoaded = false;
let settingsDirty = false;
let recentKey = '';
let currentStep = 0;
let saving = false;

function message(value = '', kind = 'error') { $('message').textContent = value; $('message').hidden = !value; $('message').dataset.kind = kind; }
function setSettingsOpen(open) {
  $('settings').hidden = !open;
  $('settings-toggle').setAttribute('aria-expanded', String(open));
  if (open) $('settings-close').focus();
}
function step(number) {
  const changed = currentStep !== number;
  currentStep = number;
  for (let i = 1; i <= 3; i++) {
    $(`step-${i}`).hidden = i !== number;
    $(`nav-${i}`).classList.toggle('active', i === number);
    $(`nav-${i}`).classList.toggle('complete', i < number);
    if (i === number) $(`nav-${i}`).setAttribute('aria-current', 'step'); else $(`nav-${i}`).removeAttribute('aria-current');
  }
  $('setup-nav').hidden = number === 3;
  $('cancel-selection').hidden = !status?.selectedMailboxIds.length;
  $('app-footer').hidden = !status?.signedIn;
  $('test-alert').hidden = number !== 3;
  $('sign-out').hidden = !status?.signedIn;
  if (number === 2) updateSelection();
  if (changed) { message(); window.scrollTo(0, 0); }
}
function showRecent(items = []) {
  const key = JSON.stringify(items);
  if (key === recentKey) return;
  recentKey = key;
  const root = $('recent'); root.replaceChildren();
  $('alert-count').textContent = items.length;
  if (!items.length) {
    const empty = element('div', 'empty-state');
    const mark = element('span', 'empty-icon'); mark.append(icon('mail-check'));
    empty.append(mark, element('h3', '', 'All quiet. You’re covered.'), element('p', '', 'New mail and one-time codes will land here. Get back to what you were doing.'));
    root.append(empty); paintIcons(); return;
  }
  for (const item of items) {
    const row = element('article', `alert${item.code ? ' has-code' : ''}`);
    const meta = element('div', 'alert-meta');
    const time = element('time', '', relativeTime(item.at)); time.dataset.at = item.at;
    if (item.at) { time.dateTime = new Date(item.at).toISOString(); time.title = new Date(item.at).toLocaleString(); }
    meta.append(icon(item.code ? 'key-round' : 'mail'), document.createTextNode(item.isTest ? 'Test alert' : item.code ? 'One-time code' : 'New mail'), time);
    row.append(meta, element('strong', 'alert-title', alertTitle(item)));
    if (item.body) row.append(element('p', 'alert-body', item.body.replace(/\s+/g, ' ').trim()));
    if (item.code) { const code = element('div', 'otp-code'); code.setAttribute('aria-label', `Code ${item.code.split('').join(' ')}`); code.append(codeContent(item.code)); row.append(code); }
    const actions = element('div', 'alert-actions');
    if (item.code) {
      const copy = element('button', 'copy-button'); copy.append(icon('copy'), document.createTextNode('Copy code'));
      copy.setAttribute('aria-label', `Copy code from ${alertTitle(item)}`);
      copy.addEventListener('click', async () => {
        copy.disabled = true;
        try {
          await invoke('copy_code', { id: item.id });
          buttonText(copy, 'Copied!', 'check'); copy.classList.add('copied');
          message('Code copied to clipboard.', 'success');
          setTimeout(() => { if (copy.isConnected) { buttonText(copy, 'Copy code', 'copy'); copy.classList.remove('copied'); } }, 2200);
        } catch (error) { message(String(error)); }
        finally { copy.disabled = false; }
      });
      actions.append(copy);
    }
    if (!item.isTest) {
      const open = element('button', 'open-button'); open.append(document.createTextNode('Open email'), icon('arrow-up-right'));
      open.addEventListener('click', async () => { try { await invoke('open_email', { id: item.id }); } catch (error) { message(String(error)); } });
      actions.append(open);
    }
    if (actions.childElementCount) row.append(actions);
    root.append(row);
  }
  paintIcons();
}
function render(next) {
  status = next;
  if (!settingsDirty) { $('api-url').value = next.apiUrl; $('web-url').value = next.webUrl; }
  $('api-url').disabled = next.signedIn; $('web-url').disabled = next.signedIn;
  $('settings-help').textContent = next.signedIn ? 'Sign out to change servers.' : 'Changes apply when you sign in.';
  showRecent(next.recent);
  $('live-text').textContent = next.connected ? 'Live' : next.connectionError ? 'Reconnecting' : 'Connecting';
  $('live').dataset.connected = String(next.connected);
  $('connection-detail').hidden = !next.connectionError;
  $('connection-detail').textContent = next.connectionError ? `We’re reconnecting. ${next.connectionError}` : '';
  $('summary').textContent = `Listening to ${next.selectedMailboxIds.length} mailbox${next.selectedMailboxIds.length === 1 ? '' : 'es'}`;
  $('monitor-note').textContent = next.connected ? 'Listening for your next important thing.' : 'Alerts resume when the connection returns.';
  if (!next.signedIn) { editing = false; selected.clear(); step(1); return; }
  if (!editing) {
    selected = new Set(next.selectedMailboxIds);
    if (selected.size) step(3);
    else { editing = true; step(2); void loadCatalog(); }
  }
}
function visibleGroups() {
  const query = $('mailbox-search').value.trim().toLowerCase();
  return catalog.map(group => ({ ...group, mailboxes: group.mailboxes.filter(mailbox => `${group.product.name} ${mailbox.address}`.toLowerCase().includes(query)) })).filter(group => group.mailboxes.length || (!query && !catalog.some(g => g.mailboxes.length)));
}
function updateSelection() {
  $('selection-count').textContent = `${selected.size} selected`;
  $('save-selection').disabled = !selected.size || catalogLoading || !catalogLoaded || saving;
  const mailboxes = visibleGroups().flatMap(group => group.mailboxes);
  $('select-all').disabled = !mailboxes.length || catalogLoading || saving;
  $('select-all').textContent = mailboxes.length && mailboxes.every(mailbox => selected.has(mailbox.id)) ? 'Deselect all' : 'Select all';
  if (!saving) buttonText($('save-selection'), status?.selectedMailboxIds.length ? 'Save changes' : 'Start listening', 'arrow-right', true);
}
function productAvatar(product) {
  const avatar = element('span', 'product-avatar', product.name.trim().slice(0, 1).toUpperCase() || '?');
  avatar.setAttribute('aria-hidden', 'true');
  const url = product.brand?.logo_url || product.context?.brand_discovery?.brand?.logo_url;
  if (url) {
    try {
      const parsed = new URL(url, location.href);
      if ((parsed.protocol === 'https:' && !parsed.username && !parsed.password) || (import.meta.env.DEV && parsed.origin === location.origin)) {
        const image = element('img'); image.alt = ''; image.referrerPolicy = 'no-referrer'; image.loading = 'lazy';
        image.addEventListener('error', () => image.remove()); image.src = parsed.href; avatar.append(image);
      }
    } catch { /* A missing or invalid avatar falls back to the product initial. */ }
  }
  return avatar;
}
function showCatalog() {
  const root = $('catalog'); root.replaceChildren();
  const groups = visibleGroups();
  if (!groups.length) root.append(element('p', 'catalog-state', catalog.some(g => g.mailboxes.length) ? 'No matches. Try another mailbox or product.' : 'No mailboxes yet. Create one in Banger, then refresh.'));
  for (const group of groups) {
    const section = element('section', 'product');
    const title = element('h2'); title.append(productAvatar(group.product), document.createTextNode(group.product.name), element('span', 'product-count', `${group.mailboxes.length} mailbox${group.mailboxes.length === 1 ? '' : 'es'}`));
    section.append(title);
    const rows = element('div', 'product-mailboxes');
    for (const mailbox of group.mailboxes) {
      const label = element('label', 'mailbox-row');
      const checkbox = element('input'); checkbox.type = 'checkbox'; checkbox.checked = selected.has(mailbox.id); checkbox.disabled = saving;
      checkbox.addEventListener('change', () => { checkbox.checked ? selected.add(mailbox.id) : selected.delete(mailbox.id); updateSelection(); });
      label.append(checkbox, element('span', 'mailbox-address', mailbox.address));
      if (mailbox.status && mailbox.status !== 'active') label.append(element('small', '', mailbox.status));
      rows.append(label);
    }
    if (!group.mailboxes.length) rows.append(element('p', 'catalog-state', 'No mailboxes in this product yet.'));
    section.append(rows); root.append(section);
  }
  if (!catalog.some(g => g.mailboxes.length)) {
    const retry = element('button', 'secondary', 'Refresh mailboxes'); retry.addEventListener('click', () => loadCatalog()); root.append(retry);
  }
  updateSelection(); paintIcons();
}
async function loadCatalog() {
  if (catalogLoading) return;
  catalogLoading = true; catalogLoaded = false;
  $('catalog').setAttribute('aria-busy', 'true'); $('catalog').replaceChildren(element('p', 'catalog-state', 'Finding your mailboxes…')); updateSelection();
  try {
    const nextCatalog = await invoke('list_catalog');
    if (!status?.signedIn || !editing) return;
    catalog = nextCatalog;
    const available = new Set(catalog.flatMap(group => group.mailboxes.map(mailbox => mailbox.id)));
    selected = new Set([...selected].filter(id => available.has(id)));
    catalogLoaded = true;
  } catch (error) {
    const state = element('div', 'catalog-state'); state.append(element('p', '', 'Couldn’t load your mailboxes.'));
    const retry = element('button', 'secondary', 'Try again'); retry.addEventListener('click', () => { message(); void loadCatalog(); }); state.append(retry);
    $('catalog').replaceChildren(state); message(String(error));
  } finally {
    catalogLoading = false; $('catalog').setAttribute('aria-busy', 'false');
    if (catalogLoaded) showCatalog(); else updateSelection();
  }
}
$('settings-toggle').addEventListener('click', () => setSettingsOpen($('settings').hidden));
$('settings-close').addEventListener('click', () => { setSettingsOpen(false); $('settings-toggle').focus(); });
document.addEventListener('click', event => { if (!$('settings').hidden && !$('settings').contains(event.target) && !$('settings-toggle').contains(event.target)) setSettingsOpen(false); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('settings').hidden) { setSettingsOpen(false); $('settings-toggle').focus(); } });
for (const id of ['api-url', 'web-url']) $(id).addEventListener('input', () => { settingsDirty = true; });
$('mailbox-search').addEventListener('input', () => { if (catalogLoaded) showCatalog(); });
$('select-all').addEventListener('click', () => {
  const mailboxes = visibleGroups().flatMap(group => group.mailboxes);
  const clear = mailboxes.every(mailbox => selected.has(mailbox.id));
  mailboxes.forEach(mailbox => clear ? selected.delete(mailbox.id) : selected.add(mailbox.id)); showCatalog();
});
$('sign-in').addEventListener('click', async () => {
  message(); const button = $('sign-in'); button.disabled = true; buttonText(button, 'Continue in your browser…', 'arrow-up-right', true);
  try { const next = await invoke('sign_in', { apiUrl: $('api-url').value, webUrl: $('web-url').value }); settingsDirty = false; setSettingsOpen(false); render(next); }
  catch (error) { message(String(error)); }
  finally { button.disabled = false; buttonText(button, 'Sign in with Banger', 'arrow-up-right', true); }
});
$('save-selection').addEventListener('click', async () => {
  if (saving || !selected.size) return;
  message(); saving = true; showCatalog(); $('cancel-selection').disabled = true; $('mailbox-search').disabled = true; buttonText($('save-selection'), 'Saving mailboxes…');
  try { const next = await invoke('save_selection', { mailboxIds: [...selected] }); editing = false; render(next); }
  catch (error) { message(String(error)); }
  finally { saving = false; $('cancel-selection').disabled = false; $('mailbox-search').disabled = false; showCatalog(); }
});
$('cancel-selection').addEventListener('click', () => { editing = false; render(status); });
$('edit').addEventListener('click', async () => { editing = true; selected = new Set(status.selectedMailboxIds); $('mailbox-search').value = ''; step(2); await loadCatalog(); });
$('check').addEventListener('click', async () => {
  const button = $('check'); button.disabled = true; button.classList.add('busy'); message();
  try { await invoke('check_now'); message('All caught up. Checked for new mail.', 'success'); }
  catch (error) { message(String(error)); }
  finally { button.disabled = false; button.classList.remove('busy'); }
});
$('test-alert').addEventListener('click', async () => {
  const button = $('test-alert'); button.disabled = true;
  try { const delivery = await invoke('test_alert'); message(delivery === 'native' ? 'Test sent to Notification Center.' : 'Test popup sent. Enable notifications in macOS for native alerts.', 'success'); }
  catch (error) { message(String(error)); }
  finally { button.disabled = false; }
});
$('sign-out').addEventListener('click', async () => {
  $('sign-out').disabled = true;
  try { await invoke('sign_out'); editing = false; catalog = []; catalogLoaded = false; settingsDirty = false; render(await invoke('get_status')); }
  catch (error) { message(String(error)); }
  finally { $('sign-out').disabled = false; }
});
initAppearance(); paintIcons();
setInterval(() => { if (!document.hidden) document.querySelectorAll('time[data-at]').forEach(time => { time.textContent = relativeTime(Number(time.dataset.at)); }); }, 60000);
try { await listen('pulse-state', ({ payload }) => render(payload)); render(await invoke('get_status')); }
catch (error) { message(`Couldn’t connect to Pulse. Reopen the app to try again. ${String(error)}`); }
