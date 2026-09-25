import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { beginSignIn } from '../src/lib/browser-auth.ts';

test('registers the exact fork callback and uses fresh S256 PKCE without a secret', async () => {
  let redirected: URL | undefined, pending: any;
  const location = Object.assign(new URL('https://fork.test/'), { assign: (url: URL) => { redirected = url; } });
  Object.assign(globalThis, { location, window: { location }, localStorage: { getItem: () => null, setItem: () => {} }, sessionStorage: { setItem: (_: string, value: string) => { pending = JSON.parse(value); } } });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.ok(String(url).endsWith('/oauth/register'));
    assert.equal(init?.credentials, 'omit');
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.redirect_uris, ['https://fork.test/']);
    assert.equal(body.token_endpoint_auth_method, 'none');
    return Response.json({ client_id: 'bgrc_test' });
  };
  try {
    await beginSignIn();
    assert.equal(redirected?.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(redirected?.searchParams.get('code_challenge'), createHash('sha256').update(pending.verifier).digest('base64url'));
    assert.equal(redirected?.searchParams.get('state'), pending.state);
    assert.ok(pending.state.length >= 43);
    assert.deepEqual(Object.keys(pending).sort(), ['clientId', 'createdAt', 'redirectUri', 'state', 'verifier']);
  } finally { globalThis.fetch = originalFetch; }
});
