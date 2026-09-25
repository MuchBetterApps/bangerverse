import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browserSession } from '../src/lib/browser-auth.ts';

test('rejects an unsolicited callback before exchanging a code and clears pending state', async () => {
  let removed = false, scrubbed = false;
  Object.assign(globalThis, {
    location: new URL('https://fork.test/?code=attacker-code&state=wrong'),
    history: { replaceState: (_: unknown, __: string, url: URL) => { scrubbed = !url.searchParams.has('code'); } },
    sessionStorage: { getItem: () => JSON.stringify({ state: 'expected', redirectUri: 'https://fork.test/', createdAt: Date.now() }), removeItem: () => { removed = true; } },
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Token exchange must not run'); };
  try {
    await assert.rejects(browserSession(), /state did not match/);
    assert.ok(removed && scrubbed);
  } finally { globalThis.fetch = originalFetch; }
});
