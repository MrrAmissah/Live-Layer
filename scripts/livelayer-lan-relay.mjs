import http from 'node:http';
import { networkInterfaces } from 'node:os';
import {
  createRelaySnapshot,
  reduceRelaySnapshot,
  snapshotReplay,
  validateRelayMessage
} from './relay-snapshot.mjs';

const host = process.env.LIVELAYER_LAN_HOST || '0.0.0.0';
const port = Number(process.env.LIVELAYER_LAN_RELAY_PORT || 4174);
const maxBodyBytes = 1_000_000;
const clients = new Set();
// One validated slot per concern (command / ack / status) — see
// relay-snapshot.mjs for why a single last-message slot became a bug once
// output events joined the wire.
let snapshot = createRelaySnapshot();

/**
 * This machine's real LAN addresses, so /setup can stop guessing at them.
 *
 * THE CHICKEN AND EGG THIS SOLVES. The setup page used to build its LAN URLs
 * from `window.location.hostname` — the address you had ALREADY loaded it on —
 * so opening it at 127.0.0.1 handed out `127.0.0.1:4174`, an address that means
 * "this same machine" on the controller device and can never work. You had to
 * know the IP to reach the page that tells you the IP, and when a router hands
 * out a different one you get to discover that under time pressure.
 *
 * A browser cannot enumerate its machine's interfaces; this process can, and it
 * is already the process a second device must reach. So it answers with the
 * candidates and their adapter names, and the page prints ready-made URLs.
 *
 * Loopback and IPv6 are filtered out: a link-local IPv6 needs a zone index that
 * does not survive a URL, and 127.0.0.1 is the wrong answer by construction.
 * Several may be listed — Wi-Fi, Ethernet, a VPN, a virtualiser — because only
 * the controller device knows which network it is on.
 */
function lanAddresses() {
  const found = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) found.push({ name, address: net.address });
    }
  }
  return found;
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
}

function sendJson(res, status, body) {
  setCors(res);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function sendEvent(res, message) {
  res.write(`data: ${JSON.stringify(message)}\n\n`);
}

/**
 * Write to every listener, and SURVIVE the ones that are already gone.
 *
 * `clients` was pruned only by `req.on('close')`, which is the clean-shutdown
 * path — a browser tab closed, a source removed. It is not what happens when a
 * laptop sleeps, Wi-Fi drops, or OBS is killed: the socket dies without the
 * request ever emitting `close`, and the dead response stays in the set.
 *
 * The next broadcast then writes to it. An `http.ServerResponse` with no
 * `error` listener turns that into an unhandled 'error' event, which takes the
 * whole relay process down — and a relay that dies mid-service makes every Take
 * report failed, which is exactly what this rig has already been bitten by
 * once. In the milder case the throw lands in the POST handler's catch and the
 * Take gets a 400 for somebody else's dead socket.
 *
 * Neither is acceptable for a machine nobody is watching during a service. A
 * listener that cannot be written to is dropped and the rest still get the
 * message.
 *
 * NOTE: found by reading, not by reproducing a crash. It is a real unhandled
 * path either way — that is why the handling is defensive rather than a fix
 * aimed at a specific symptom.
 */
function drop(res) {
  clients.delete(res);
  try {
    res.end();
  } catch {
    // Already destroyed — nothing to close.
  }
}

function broadcast(message) {
  for (const res of Array.from(clients)) {
    if (res.writableEnded || res.destroyed) {
      drop(res);
      continue;
    }
    try {
      sendEvent(res, message);
    } catch {
      drop(res);
    }
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > maxBodyBytes) {
        reject(new Error('Message is too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Message must be valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    // `ok` + numeric `clients` is the identity `lib/relayReadiness.ts` checks —
    // keep both. `hasLastMessage` keeps its historical meaning: a command is
    // retained for replay.
    sendJson(res, 200, {
      ok: true,
      clients: clients.size,
      hasLastMessage: Boolean(snapshot.command),
      output: {
        lastSeenAt: snapshot.outputLastSeenAt,
        // Now a count, because one boolean cannot answer "are both screens
        // reporting" — which is the question with several browser sources.
        screens: Object.keys(snapshot.statuses ?? {}).length,
        hasStatus: Object.keys(snapshot.statuses ?? {}).length > 0
      },
      // Additive: `relayReadiness.ts` checks `ok` + numeric `clients` and
      // ignores the rest, so an older page against a newer relay is unaffected
      // and a newer page against an older relay simply finds none.
      addresses: lanAddresses()
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/events') {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no'
    });
    res.write(': LiveLayer LAN relay connected\n\n');
    clients.add(res);
    // Coherent snapshot, in apply-safe order: command → matching ack → status.
    for (const message of snapshotReplay(snapshot)) {
      sendEvent(res, message);
    }
    req.on('close', () => {
      clients.delete(res);
    });
    /**
     * The listener `req.on('close')` cannot give you.
     *
     * An SSE response is held open for the length of a service. If its socket
     * errors — the far end vanished, the network went away — an
     * `http.ServerResponse` with no `error` listener raises an unhandled event
     * and ends the process. This keeps the relay alive and forgets the
     * listener, which is all that can honestly be done about a socket that has
     * already gone.
     */
    res.on('error', () => {
      clients.delete(res);
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/message') {
    try {
      const body = await readJson(req);
      const verdict = validateRelayMessage(body);
      if (!verdict.ok) {
        sendJson(res, 400, { ok: false, error: verdict.error });
        return;
      }
      snapshot = reduceRelaySnapshot(snapshot, verdict.message, Date.now());
      broadcast(verdict.message);
      sendJson(res, 202, { ok: true, clients: clients.size });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : 'Invalid request' });
    }
    return;
  }

  sendJson(res, 404, { ok: false, error: 'Not found' });
});

server.listen(port, host, () => {
  console.log(`LiveLayer LAN relay listening on http://${host}:${port}`);
  console.log(`Use ?relay=http://<graphics-host-ip>:${port} on both /control and /output.`);
});
