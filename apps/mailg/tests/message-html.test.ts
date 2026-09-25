import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

test('removes active email content while preserving layout and remote images', async () => {
  const { window } = new JSDOM('');
  Object.assign(globalThis, { window, DOMParser: window.DOMParser });
  // Import after the browser DOM exists so DOMPurify binds to it.
  const { sanitizeMessage } = await import('../src/lib/message-html.ts');
  const safe = sanitizeMessage(`<!doctype html><html><head><base href="https://evil.test"><meta http-equiv="refresh" content="0;url=https://evil.test"><style>p{color:red}</style></head><body onload="steal()"><script>steal()</script><iframe srcdoc="attack"></iframe><form action="https://evil.test"><input name="password"></form><a href="javascript:steal()">click</a><p>Message</p><img src="https://images.test/photo.png" onerror="steal()"></body></html>`);
  const doc = new window.DOMParser().parseFromString(safe, 'text/html');
  assert.equal(doc.querySelectorAll('script,iframe,form,input,base,svg,math').length, 0);
  assert.equal(doc.querySelector('[onload],[onerror],[srcdoc]'), null);
  assert.equal(doc.querySelector('a')?.hasAttribute('href'), false);
  assert.equal(doc.querySelector('img')?.getAttribute('src'), 'https://images.test/photo.png');
  assert.equal(doc.querySelector('p')?.textContent, 'Message');
  assert.equal(doc.querySelector('style')?.textContent, 'p{color:red}');
  assert.equal(doc.querySelectorAll('meta').length, 2);
  assert.match(doc.querySelector('meta[http-equiv]')?.getAttribute('content') || '', /default-src 'none'/);
  assert.equal(doc.querySelector('meta[name=referrer]')?.getAttribute('content'), 'no-referrer');
  window.close();
});
