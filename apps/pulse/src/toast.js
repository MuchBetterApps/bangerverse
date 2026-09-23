import { invoke } from './bridge.js';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { alertTitle, codeContent, initAppearance, paintIcons } from './ui.js';
const $ = id => document.getElementById(id);
const id = new URLSearchParams(location.search).get('id');
const close = () => import.meta.env.DEV && new URLSearchParams(location.search).has('preview') ? document.body.replaceChildren() : getCurrentWindow().close();
const failure = error => { $('toast-error').hidden = false; $('toast-error').textContent = String(error); };
initAppearance(); paintIcons();
$('dismiss').addEventListener('click', () => void close());
document.addEventListener('keydown', event => { if (event.key === 'Escape') void close(); });
try {
  const alert = await invoke('get_alert', { id });
  $('title').textContent = alertTitle(alert);
  $('body').textContent = alert.body.replace(/\s+/g, ' ').trim();
  $('kind').textContent = alert.isTest ? 'TEST ALERT' : alert.code ? 'ONE-TIME CODE' : 'NEW MAIL';
  $('copy').hidden = !alert.code; $('code').hidden = !alert.code;
  if (alert.code) { $('code').append(codeContent(alert.code)); $('code').setAttribute('aria-label', `Code ${alert.code.split('').join(' ')}`); }
  $('copy').addEventListener('click', async () => { try { await invoke('copy_code', { id }); await close(); } catch (error) { failure(error); } });
  $('open').hidden = alert.isTest;
  $('open').addEventListener('click', async () => { try { await invoke('open_email', { id }); await close(); } catch (error) { failure(error); } });
} catch (error) { $('title').textContent = 'This alert is no longer available.'; $('open').hidden = true; failure(error); }
