import http from 'node:http';

const host = process.env.LIVELAYER_LAN_HOST || '0.0.0.0';
const port = Number(process.env.LIVELAYER_LAN_RELAY_PORT || 4174);
const maxBodyBytes = 1_000_000;
const clients = new Set();
let lastMessage = null;

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

function isRelayMessage(value) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof value.id === 'string' &&
    typeof value.type === 'string' &&
    typeof value.timestamp === 'number' &&
    Number.isFinite(value.timestamp) &&
    'payload' in value
  );
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
    sendJson(res, 200, { ok: true, clients: clients.size, hasLastMessage: Boolean(lastMessage) });
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
    if (lastMessage) sendEvent(res, lastMessage);
    req.on('close', () => {
      clients.delete(res);
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/message') {
    try {
      const message = await readJson(req);
      if (!isRelayMessage(message)) {
        sendJson(res, 400, { ok: false, error: 'Invalid LiveLayer realtime message' });
        return;
      }
      lastMessage = message;
      broadcast(message);
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
