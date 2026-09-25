import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browserSession, authorizedFetch, signOut } from '../src/lib/browser-auth.ts';

test('exchanges once, refreshes once under concurrency, and ends the local session on logout', async () => {
  const originalFetch = globalThis.fetch;
  const values = new Map([['mailg-oauth-pending', JSON.stringify({ state: 'state', verifier: 'v'.repeat(43), clientId: 'bgrc_test', redirectUri: 'https://fork.test/', createdAt: Date.now() })]]);
  const navigation: string[] = [];
  const location = Object.assign(new URL('https://fork.test/?code=one-use&state=state'), { assign: (url: string) => navigation.push(url) });
  Object.assign(globalThis, { location, window: { location }, history: { replaceState: (_: unknown, __: string, url: URL) => navigation.push(url.href) }, sessionStorage: { getItem: (key: string) => values.get(key) ?? null, removeItem: (key: string) => values.delete(key), setItem: () => { throw new Error('Tokens must not be stored'); } } });
  let exchanges = 0, refreshes = 0, apiCalls = 0;
  const token = (suffix: string) => 'header.' + Buffer.from(JSON.stringify({ workspace_id: '11111111-1111-4111-8111-111111111111' })).toString('base64url') + '.' + suffix;
  globalThis.fetch = async (url, init) => {
    assert.equal(init?.credentials, 'omit');
    if (String(url).endsWith('/oauth/token')) {
      const grant = (init!.body as URLSearchParams).get('grant_type');
      if (grant === 'authorization_code') { exchanges++; return Response.json({ access_token: token('first'), refresh_token: 'secret-refresh', expires_in: 30 }); }
      refreshes++;
      await new Promise(resolve => setTimeout(resolve, 10));
      return Response.json({ access_token: token('second'), refresh_token: 'rotated-refresh', expires_in: 600 });
    }
    apiCalls++;
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer ' + token('second'));
    assert.equal(init?.redirect, 'error');
    return Response.json({ data: [] });
  };
  try {
    const sessions = await Promise.all([browserSession(), browserSession()]);
    assert.ok(sessions.every(s => s.connected));
    assert.equal(exchanges, 1);
    assert.equal(values.size, 0);
    assert.equal(navigation[0], 'https://fork.test/');
    await Promise.all([authorizedFetch('mailboxes'), authorizedFetch('threads')]);
    assert.equal(refreshes, 1);
    assert.equal(apiCalls, 2);
    await assert.rejects(authorizedFetch('../other'), /Invalid API path/);
    signOut();
    assert.equal((await browserSession()).connected, false);
    await assert.rejects(authorizedFetch('mailboxes'), /Sign in/);
    assert.equal(apiCalls, 2);
  } finally { globalThis.fetch = originalFetch; }
});
