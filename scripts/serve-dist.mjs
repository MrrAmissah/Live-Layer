#!/usr/bin/env node
/**
 * Serve a built LiveLayer (`dist/`) with nothing installed but Node.
 *
 * `npm run preview` already does this, but it needs the full dev dependency tree
 * — which is the thing you do not have on a fresh machine minutes before a
 * service. This script has no dependencies at all, so a release archive of
 * `dist/` plus this file plus the relay script is a complete, runnable LiveLayer.
 *
 * Three details that a naive static server gets wrong and that break the app:
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
 *
 * Usage:
 *   node scripts/serve-dist.mjs                 # 127.0.0.1:4173
 *   node scripts/serve-dist.mjs --host 0.0.0.0  # reachable from the LAN
 *   node scripts/serve-dist.mjs --port 5000
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(join(here, '..', 'dist'));

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

async function readIfFile(path) {
  try {
    const info = await stat(path);
    if (!info.isFile()) return null;
    return await readFile(path);
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

  // Normalise and refuse to escape the served directory.
  const rel = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const target = resolve(join(root, rel));
  if (target !== root && !target.startsWith(root + sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  const extension = extname(target).toLowerCase();
  const body = rel === '/' || rel === '\\' ? null : await readIfFile(target);

  if (body) {
    send(res, 200, TYPES[extension] ?? 'application/octet-stream', cacheFor(rel, extension), body);
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
 * Only Vite's `assets/` output carries a content hash in the filename, so only
 * it may be cached hard. Files copied verbatim from `public/` keep their names,
 * and an operator who fixes a logo must not be served the old one for a year.
 */
function cacheFor(rel, extension) {
  if (extension === '.html') return 'no-store';
  return rel.startsWith('/assets/') || rel.startsWith('\\assets\\')
    ? 'public, max-age=31536000, immutable'
    : 'no-cache';
}

const server = createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error(`Request failed: ${req.method} ${req.url}`, error);
    if (!res.headersSent) res.writeHead(500).end('Internal Server Error');
    else res.end();
  });
});

server.listen(port, host, () => {
  const shown = host === '0.0.0.0' ? lanAddress() ?? '127.0.0.1' : host;
  const base = `http://${shown}:${port}`;
  console.log('LiveLayer is serving.\n');
  console.log(`  Control (OBS Custom Browser Dock)  ${base}/control`);
  console.log(`  Output  (OBS Browser Source)       ${base}/output`);
  console.log(`  Setup / diagnostics                ${base}/setup\n`);
  console.log('Both OBS entries must use this exact address and port — mixing');
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

function lanAddress() {
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return null;
}
