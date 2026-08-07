#!/usr/bin/env node
/**
 * Serve a built LiveLayer (`dist/`) with nothing installed but Node.
 *
 * `npm run preview` already does this, but it needs the full dev dependency tree
 * — which is the thing you do not have on a fresh machine minutes before a
 * service. This script has no dependencies at all, so a release archive of
 * `dist/` plus this file plus the relay script is a complete, runnable LiveLayer.
 *
 * Its behaviour is covered by `scripts/serve-dist.test.mjs` (`npm run test:server`),
 * which spawns this file against a temporary `dist/` and asserts each point
 * below. This file must never import that one.
 *
 * Four details that a naive static server gets wrong and that break the app:
 *
 *  1. **SPA fallback, but only for routes.** `/control/scripture`, `/output` and
 *     `/setup` are client routes with no file behind them, so they must return
 *     `index.html` or OBS shows a 404 where the graphic should be. A request that
 *     names a *file* (`/assets/index-abc.js`, `/logo.png`) and misses is a real
 *     404: handing it the HTML shell instead turns a missing asset into a
 *     baffling syntax error, and makes route smoke checks pass on an empty build.
 *  2. **One origin.** The dock and the Browser Source must agree on scheme, host
 *     AND port, or `BroadcastChannel` and `localStorage` silently stop matching
 *     and Take does nothing. So this serves everything from a single origin and
 *     prints the exact URLs to paste into OBS rather than leaving you to guess.
 *     The default port matches the dev/preview servers so the libraries an
 *     operator built up in `npm run dev` are still there under `npm run start`.
 *  3. **Nothing a request can do may stop the server.** It is running during a
 *     service. A malformed URL from a LAN scanner must return 400, not take the
 *     graphics down between songs.
 *  4. **Nothing outlives the fix.** No file is cached beyond the page it is on,
 *     so a corrected graphic is one refresh away, and a symlink inside `dist/`
 *     cannot reach a file outside it.
 *
 * Usage:
 *   node scripts/serve-dist.mjs                 # 127.0.0.1:4173
 *   node scripts/serve-dist.mjs --host 0.0.0.0  # reachable from the LAN
 *   node scripts/serve-dist.mjs --port 5000
 *
 * Needs Node 22 or newer. Nothing else.
 */
import { createServer } from 'node:http';
import { readFile, stat, realpath } from 'node:fs/promises';
import { join, normalize, extname, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(join(here, '..', 'dist'));

/**
 * The floor is Node 22, the oldest line still receiving security support in
 * 2026 — 18 and 20 are both end-of-life. This process can be told to listen on
 * every interface of a hall's network, which is not somewhere to run a runtime
 * that stopped getting patches.
 */
const MINIMUM_NODE_MAJOR = 22;
const nodeMajor = Number(process.versions.node.split('.')[0]);
if (Number.isFinite(nodeMajor) && nodeMajor < MINIMUM_NODE_MAJOR) {
  console.error(`LiveLayer needs Node ${MINIMUM_NODE_MAJOR} or newer; this is Node ${process.versions.node}.`);
  console.error('Node 18 and 20 are end-of-life. Install a current LTS from');
  console.error('https://nodejs.org and run this again.');
  process.exit(1);
}

const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at !== -1 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
};
const host = arg('host', '127.0.0.1');
const port = Number(arg('port', '4173'));

/**
 * Browsers refuse to fetch these ports outright (the WHATWG "bad port" list).
 * An OBS Browser Source is Chromium, so a graphic served from one of them is a
 * blank source with no error anywhere in OBS — the server looks perfectly
 * healthy from the terminal, and from curl. Refuse at start-up instead.
 */
const BROWSER_BLOCKED_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102,
  103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465,
  512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993,
  995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668,
  6669, 6679, 6697, 10080
]);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`Not a usable port: ${arg('port', '4173')}`);
  process.exit(1);
}
if (BROWSER_BLOCKED_PORTS.has(port)) {
  console.error(`Port ${port} is one browsers refuse to load, so OBS would show an empty`);
  console.error('Browser Source with no error to explain it. Pick another, e.g. --port 4188.');
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8'
};

/**
 * The lexical check on the request path is not enough on its own: `stat` and
 * `readFile` follow symbolic links, so a link inside `dist/` — a file, or a
 * directory several levels up the requested path — names something outside it
 * while the path string still looks contained. That matters here because
 * `--host 0.0.0.0` deliberately puts this on a hall's network.
 *
 * So resolve the real filesystem path first, prove *that* is inside the real
 * root, and read the resolved path rather than the requested one. `realpath`
 * throws for anything that does not exist, which is the same `null` a missing
 * file has always produced.
 */
const realRoot = await realpath(root).catch(() => root);

async function readIfFile(path) {
  try {
    const real = await realpath(path);
    if (real !== realRoot && !real.startsWith(realRoot + sep)) return null;
    const info = await stat(real);
    if (!info.isFile()) return null;
    return await readFile(real);
  } catch {
    return null;
  }
}

async function handle(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end('Method Not Allowed');
    return;
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    // e.g. `/%zz` — a stray link or a LAN scanner, not a reason to stop serving.
    res.writeHead(400).end('Bad Request');
    return;
  }

  // `url.pathname` is always absolute, and normalising an absolute path drops
  // any `..` that would climb past its root — so this is what actually stops
  // traversal. The containment check below is a backstop for a future change
  // to how `rel` is derived; it is unreachable from request input today, which
  // is why removing it does not change any test's outcome.
  const rel = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const target = resolve(join(root, rel));
  if (target !== root && !target.startsWith(root + sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  const extension = extname(target).toLowerCase();
  const body = rel === '/' || rel === '\\' ? null : await readIfFile(target);

  if (body) {
    send(res, 200, TYPES[extension] ?? 'application/octet-stream', cacheFor(extension), body);
    return;
  }

  // A path that names a file and misses is a real 404. Only extensionless
  // paths are client routes, and those get the app shell.
  const shell = await readIfFile(join(root, 'index.html'));
  if (!shell) {
    send(res, 500, TYPES['.html'], 'no-store',
      'No dist/index.html found. Run `npm run build` first, or use a release archive that already contains dist/.');
    return;
  }
  if (extension) {
    send(res, 404, 'text/plain; charset=utf-8', 'no-store', `Not found: ${rel}\n`);
    return;
  }
  send(res, 200, TYPES['.html'], 'no-store', shell);
}

function send(res, status, type, cacheControl, body) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': cacheControl });
  res.end(body);
}

/**
 * Nothing is cached for longer than the page it is on. A year-long `immutable`
 * is only safe for a name that changes when its bytes do, and this process has
 * no authoritative way to know which names those are — inferring it from the
 * shape of a filename would eventually pin a hand-named graphic until 2027,
 * which is the failure it was meant to prevent. Over a local network a
 * re-fetch costs milliseconds; a stranded fix costs a service. If hard caching
 * is ever worth it, a build manifest can say which files earned it.
 */
function cacheFor(extension) {
  return extension === '.html' ? 'no-store' : 'no-cache';
}

const server = createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error(`Request failed: ${req.method} ${req.url}`, error);
    if (!res.headersSent) res.writeHead(500).end('Internal Server Error');
    else res.end();
  });
});

server.listen(port, host, () => {
  if (host === '0.0.0.0') announceEveryAddress();
  else announceOneAddress(host);
  console.log('Both OBS entries must use the same address and port — mixing');
  console.log('localhost and 127.0.0.1 silently breaks Take.\n');
  if (host !== '0.0.0.0') console.log('For a second machine: --host 0.0.0.0, and run the relay too.');
  console.log('Stop with Ctrl+C.');
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Try: node scripts/serve-dist.mjs --port 4180`);
    process.exit(1);
  }
  throw error;
});

function announceOneAddress(address) {
  const base = `http://${address}:${port}`;
  console.log('LiveLayer is serving.\n');
  console.log(`  Control (OBS Custom Browser Dock)  ${base}/control`);
  console.log(`  Output  (OBS Browser Source)       ${base}/output`);
  console.log(`  Setup / diagnostics                ${base}/setup\n`);
}

/**
 * A laptop in a hall usually has several IPv4 addresses — Wi-Fi, Ethernet, a
 * VPN, a virtualisation adapter — and which one the controller tablet can
 * reach is not something this process can know. Naming one would be a guess
 * that reads as fact, so list them all and say plainly that only one will work.
 */
function announceEveryAddress() {
  const found = lanAddresses();
  console.log(`LiveLayer is serving on every interface, port ${port}.\n`);
  console.log('Use ONE address below — the same one for the dock, the Browser');
  console.log('Source and the relay — then add /control, /output or /setup:\n');
  for (const { name, address } of found) {
    console.log(`  ${name.padEnd(12)} http://${address}:${port}`);
  }
  console.log(`  ${'this machine'.padEnd(12)} http://127.0.0.1:${port}\n`);
  if (found.length === 0) {
    console.log('No LAN address was found, so only this machine can reach it.');
    console.log('Check Wi-Fi or Ethernet if a second device is meant to connect.\n');
  } else if (found.length > 1) {
    console.log('Several are listed because this machine has several adapters.');
    console.log('Only the one on the controller\'s network will work — if the');
    console.log('first fails to load there, try the next.\n');
  }
}

function lanAddresses() {
  const found = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) found.push({ name, address: net.address });
    }
  }
  return found;
}
