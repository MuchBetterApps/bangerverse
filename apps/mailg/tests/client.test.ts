import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browserSession } from '../src/lib/browser-auth.ts';
import { createMailClient, mailClient } from '../src/lib/client.ts';

test('mailbox actions retain their product scope and command identity', async () => {
  const originalFetch = globalThis.fetch;
  const pending = { state: 'test-state', verifier: 'a'.repeat(43), clientId: 'bgrc_test', redirectUri: 'https://mailg.test/', createdAt: Date.now() };
  Object.defineProperty(globalThis, 'location', { configurable: true, value: new URL('https://mailg.test/?code=test-code&state=test-state') });
  Object.defineProperty(globalThis, 'history', { configurable: true, value: { replaceState: () => {} } });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: () => JSON.stringify(pending), removeItem: () => {} } });
  const token = 'header.' + Buffer.from(JSON.stringify({ workspace_id: '11111111-1111-4111-8111-111111111111' })).toString('base64url') + '.signature';
  globalThis.fetch = async () => Response.json({ access_token: token, refresh_token: 'refresh', expires_in: 600 });
  await browserSession();
  const calls: Array<{ path: string; headers: Headers; body?: BodyInit | null }> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ path: String(input), headers: new Headers(init?.headers), body: init?.body });
    return Response.json({ data: { id: 'command', status: 'succeeded' } });
  };
  try {
    const first = createMailClient('product-a');
    const second = createMailClient('product-b');
    for (const action of ['mark_read', 'mark_unread', 'trash', 'restore', 'archive', 'unarchive', 'star', 'unstar', 'add_label', 'remove_label']) {
      await first.command('thread-a', action, action.includes('label') ? { label_id: 'label-a' } : undefined);
      const call = calls.at(-1)!;
      assert.equal(call.headers.get('x-banger-product-id'), 'product-a');
      assert.equal(call.headers.get('authorization'), `Bearer ${token}`);
      assert.ok(call.path.startsWith('https://api.bangermail.com/v1/workspaces/'));
      assert.equal(call.headers.get('content-type'), 'application/json');
      assert.ok(call.headers.get('idempotency-key'));
      assert.equal(JSON.parse(String(call.body)).type, action);
    }
    assert.equal(new Set(calls.map(c => c.headers.get('idempotency-key'))).size, 10);
    await second.command('thread-b', 'mark_read');
    await first.commandStatus('command');
    assert.equal(calls.at(-2)!.headers.get('x-banger-product-id'), 'product-b');
    assert.equal(calls.at(-1)!.headers.get('x-banger-product-id'), 'product-a');
    await first.request('labels', { method: 'POST', body: JSON.stringify({name:'Test'}), headers: new Headers({'X-Test':'retained'}) });
    assert.equal(calls.at(-1)!.headers.get('x-test'), 'retained');
    assert.equal(calls.at(-1)!.headers.get('x-banger-product-id'), 'product-a');
    await first.saveDraft({mailbox_id:'mailbox-a'});
    await first.uploadDraftAttachment('draft-a', new File(['test'], 'test.txt', {type:'text/plain'}));
    assert.equal(calls.at(-2)!.headers.get('x-banger-product-id'), 'product-a');
    assert.equal(calls.at(-1)!.headers.get('x-banger-product-id'), 'product-a');
    assert.equal(calls.at(-1)!.headers.get('content-type'), 'text/plain');
    await mailClient.request('mailboxes');
    assert.equal(calls.at(-1)!.headers.get('x-banger-product-id'), null);
  } finally { globalThis.fetch = originalFetch; }
});
