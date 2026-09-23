// Browser-only fixtures for visual and interaction QA. Never included in a release build.
const params = new URLSearchParams(location.search);
const mode = params.get('preview');
const groups = [
  { product: { id: 'p1', name: 'Banger', brand: { logo_url: new URL('./assets/banger-avatar.png', import.meta.url).href } }, mailboxes: [{ id: 'm1', address: 'hello@banger.example', status: 'active' }, { id: 'm2', address: 'codes@banger.example', status: 'active' }, { id: 'm3', address: 'team@banger.example', status: 'active' }] },
  { product: { id: 'p2', name: 'Side projects' }, mailboxes: [{ id: 'm4', address: 'hello@orbit.example', status: 'active' }, { id: 'm5', address: 'updates@studio.example', status: 'active' }] },
  { product: { id: 'p3', name: 'Personal' }, mailboxes: [{ id: 'm6', address: 'me@personal.example', status: 'active' }] }
];
const now = Date.now();
const alerts = [
  { id: 'a1', title: 'Code 482916 · Linear', body: 'Your sign-in code for Linear. You can get back to the good stuff.', code: '482916', at: now - 40000, isTest: false },
  { id: 'a2', title: 'Maya Chen', body: 'A few ideas for our next release — I left some thoughts on the new onboarding.', code: null, at: now - 240000, isTest: false },
  { id: 'a3', title: 'Code 853107 · GitHub', body: 'Verify your sign-in to GitHub.', code: '853107', at: now - 480000, isTest: false }
];
let state = { signedIn: mode !== 'welcome', connected: mode !== 'offline', connectionError: mode === 'offline' ? 'The connection was interrupted. Trying again automatically.' : null, apiUrl: 'https://api.bangermail.com', webUrl: 'https://app.bangermail.com', selectedMailboxIds: mode === 'welcome' || mode === 'mailboxes' ? [] : ['m1', 'm2', 'm4'], recent: ['live', 'offline', 'toast'].includes(mode) ? alerts : [] };
let listener;
const emit = () => listener?.({ payload: structuredClone(state) });
export async function listen(_name, callback) { listener = callback; return () => { listener = null; }; }
export async function invoke(command, args = {}) {
  switch (command) {
    case 'get_status': return structuredClone(state);
    case 'list_catalog': if (params.has('catalog-error')) throw new Error('Preview: mailbox service is unavailable.'); return params.has('empty-catalog') ? [] : structuredClone(groups);
    case 'sign_in': state.signedIn = true; emit(); return structuredClone(state);
    case 'save_selection': state.selectedMailboxIds = args.mailboxIds; state.connected = true; emit(); return structuredClone(state);
    case 'sign_out': state.signedIn = false; state.selectedMailboxIds = []; state.recent = []; emit(); return;
    case 'check_now': return;
    case 'copy_code': { const code = state.recent.find(item => item.id === args.id)?.code; if (!code) throw new Error('Code expired'); await navigator.clipboard.writeText(code); return; }
    case 'open_email': window.dispatchEvent(new CustomEvent('preview-open-email', { detail: args.id })); return;
    case 'get_alert': return structuredClone(alerts[0]);
    case 'test_alert': state.recent.unshift({ id: `test-${Date.now()}`, title: 'Banger Pulse test alert', body: 'Looking good. Alerts are working on this desktop.', code: '123456', at: Date.now(), isTest: true }); state.recent = state.recent.slice(0, 20); emit(); return 'popup';
    default: throw new Error(`Unexpected preview command: ${command}`);
  }
}
if (mode !== 'toast' && !params.has('clean')) {
  const banner = document.createElement('div'); banner.className = 'preview-banner'; banner.append('DESIGN PREVIEW · ');
  for (const [value, label] of [['welcome', 'Sign in'], ['mailboxes', 'Mailboxes'], ['empty', 'Empty'], ['live', 'Live'], ['offline', 'Offline']]) {
    const button = document.createElement('button'); button.textContent = label; button.setAttribute('aria-pressed', String(mode === value));
    button.addEventListener('click', () => { params.set('preview', value); location.search = params.toString(); }); banner.append(button);
  }
  document.body.prepend(banner);
  window.addEventListener('preview-open-email', () => { const message = document.getElementById('message'); message.hidden = false; message.dataset.kind = 'success'; message.textContent = 'Preview: the native app opens this exact email in Banger.'; });
}
