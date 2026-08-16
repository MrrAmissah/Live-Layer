import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RELAY = join(ROOT, 'scripts', 'livelayer-lan-relay.mjs');

/**
 * THE RELAY ANSWERS WITH THE MACHINE'S OWN ADDRESSES, AND THAT BREAKS A CIRCLE.
 *
 * The setup page built its LAN URLs from `window.location.hostname` — the
 * address you had already loaded it on — so opening /setup at 127.0.0.1 handed
 * out a "LAN" URL of 127.0.0.1, which on the controller device means the
 * controller itself. You had to know the address to reach the page that gives
 * you the address, and a router handing out a new one turned that into a
 * debugging job under time pressure.
 *
 * A browser cannot enumerate its machine's interfaces. This process can, and it
 * is already the one a second device must reach.
 *
 * Spawned for real rather than unit-tested, because the thing worth asserting is
 * the wire format an already-shipped page reads.
 */
const PORT = 4187;

function startRelay() {
  const child = spawn('node', [RELAY], {
    env: { ...process.env, LIVELAYER_LAN_RELAY_PORT: String(PORT), LIVELAYER_LAN_HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return new Promise((resolve, reject) => {
    const done = setTimeout(() => reject(new Error('relay did not start')), 8000);
    child.stdout.on('data', () => {
      clearTimeout(done);
      resolve(child);
    });
    child.on('error', reject);
  });
}

test('health reports this machine’s LAN candidates', async () => {
  const child = await startRelay();
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}/health`);
    assert.equal(response.status, 200);
    const body = await response.json();

    // The identity `lib/relayReadiness.ts` checks. Adding a field must not
    // disturb it — an older page against a newer relay has to keep working.
    assert.equal(body.ok, true);
    assert.equal(typeof body.clients, 'number');

    assert.ok(Array.isArray(body.addresses), 'no addresses array');
    for (const candidate of body.addresses) {
      assert.equal(typeof candidate.address, 'string');
      assert.equal(typeof candidate.name, 'string', 'the adapter name is what tells Wi-Fi from a VPN');
      // IPv4 only, and never loopback. A link-local IPv6 needs a zone index
      // that does not survive a URL, and 127.0.0.1 is the wrong answer by
      // construction — it is the address that made this circular.
      assert.match(candidate.address, /^\d+\.\d+\.\d+\.\d+$/, `${candidate.address} is not IPv4`);
      assert.ok(!candidate.address.startsWith('127.'), 'loopback was offered as a LAN address');
    }
  } finally {
    child.kill();
  }
});

test('the setup page builds its URLs from those, not from its own hostname', () => {
  const page = readFileSync(join(ROOT, 'src', 'app', 'SetupPage.tsx'), 'utf8');
  // It still asks, and it still degrades: with no relay there is nothing to ask,
  // and the hostname-derived pair returns with a warning rather than nothing.
  assert.match(page, /\/health/);
  assert.match(page, /candidate\.address/);
  assert.match(page, /lanProbe === 'ok'/);
  assert.match(page, /no-relay/);
});
