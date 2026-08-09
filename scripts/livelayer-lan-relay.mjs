import http from 'node:http';
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

function broadcast(message) {
  for (const res of clients) {
    sendEvent(res, message);
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
        hasStatus: Boolean(snapshot.status)
      }
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
