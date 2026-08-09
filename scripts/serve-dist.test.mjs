/**
 * Integration tests for the portable server (`serve-dist.mjs`).
 *
 * This is the process that keeps graphics on screen during a service, so the
 * tests drive the real thing: a temporary `dist/` fixture beside a copy of the
 * script, a spawned Node process, and actual HTTP requests. Nothing here is
 * stubbed, because every defect these cover was one the unit-testable parts
 * would have reported as fine.
 *
 * Run with `npm run test:server` (or `node --test scripts/serve-dist.test.mjs`).
 * The server itself must never import this file.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, copyFile, symlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SERVER = join(here, 'serve-dist.mjs');

const SHELL = '<!doctype html><html><head><title>SHELL</title></head><body>app</body></html>';
const HARNESS = '<!doctype html><html><head><title>HARNESS</title></head><body>seed</body></html>';
const HASHED_JS = 'export const hashed = true;\n';
const STABLE_PNG = 'not-really-a-png';
const MARK_SVG = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
const SECRET = 'this file lives outside dist and must never be served';

/** A port the OS just confirmed is free. Ephemeral ports sit far above the blocked list. */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/**
 * A portable bundle in a temp directory: `dist/` next to `scripts/`, exactly the
 * layout the README tells an operator to copy, and no package.json anywhere.
 */
async function makeBundle({ withIndex = true } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'livelayer-serve-'));
  await mkdir(join(dir, 'scripts'));
  await mkdir(join(dir, 'dist', 'assets'), { recursive: true });
  await copyFile(SERVER, join(dir, 'scripts', 'serve-dist.mjs'));

  if (withIndex) await writeFile(join(dir, 'dist', 'index.html'), SHELL);
  await writeFile(join(dir, 'dist', 'seed-test.html'), HARNESS);
  await writeFile(join(dir, 'dist', 'livelayer-mark.svg'), MARK_SVG);
  await writeFile(join(dir, 'dist', 'assets', 'index-B8pWpWbR.js'), HASHED_JS);
  // A stable name in the hashed namespace — the case the /assets/ prefix alone
  // would have cached for a year.
  await writeFile(join(dir, 'dist', 'assets', 'brand-companylogo.png'), STABLE_PNG);
  // Outside dist/, so no request may ever reach it.
  await writeFile(join(dir, 'secret.txt'), SECRET);
  return dir;
}

const running = new Set();

/** Spawn the server and wait until it says it is listening. */
async function start(dir, args = []) {
  const port = args.includes('--port') ? Number(args[args.indexOf('--port') + 1]) : await freePort();
  const argv = args.includes('--port') ? args : [...args, '--port', String(port)];
  const child = spawn(process.execPath, [join(dir, 'scripts', 'serve-dist.mjs'), ...argv], {
    cwd: dir,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  running.add(child);

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });

  await new Promise((resolve, reject) => {
    // A start that never completes must still take its process with it, or the
    // leaked stdio pipes keep `node --test` alive long after the run is over.
    const timer = setTimeout(() => {
      stop(child);
      reject(new Error(`server did not start\n${stdout}\n${stderr}`));
    }, 10_000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited early with ${code}\n${stdout}\n${stderr}`));
    });
    const check = () => {
      if (stdout.includes('Stop with Ctrl+C.')) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on('data', check);
    check();
  });

  return {
    port,
    base: `http://127.0.0.1:${port}`,
    output: () => stdout,
    stop: () => stop(child)
  };
}

/** Run the server expecting it to refuse to start, and return why. */
async function startExpectingExit(dir, args) {
  const child = spawn(process.execPath, [join(dir, 'scripts', 'serve-dist.mjs'), ...args], {
    cwd: dir,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  running.add(child);
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  try {
    const code = await new Promise((resolve, reject) => {
      // If it wrongly *keeps* running, kill it here rather than leaving a
      // server holding the port and the runner open.
      const timer = setTimeout(() => {
        stop(child);
        reject(new Error(`server did not exit\n${stdout}\n${stderr}`));
      }, 10_000);
      child.on('exit', (value) => { clearTimeout(timer); resolve(value); });
    });
    return { code, stdout, stderr };
  } finally {
    await stop(child);
  }
}

function stop(child) {
  running.delete(child);
  // Already gone: `exit` has fired and will not fire again, so waiting on it
  // would hang forever.
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    child.on('exit', () => resolve());
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 2_000).unref();
  });
}

/**
 * Every test runs against a live process and a temp directory; both are cleaned
 * up here whether the assertions passed or threw.
 */
async function withServer(run, options) {
  const dir = await makeBundle(options);
  let server;
  try {
    if (options?.prepare) await options.prepare(dir);
    server = await start(dir, options?.args);
    await run(server, dir);
  } finally {
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Symlink creation is unprivileged on macOS and Linux but not always on
 * Windows. Skip loudly there rather than quietly weakening what is being tested.
 */
async function canSymlink(dir) {
  try {
    await symlink(join(dir, 'dist'), join(dir, 'symlink-probe'));
    await rm(join(dir, 'symlink-probe'), { force: true });
    return true;
  } catch (error) {
    return error.code ?? 'unsupported';
  }
}

async function withBundle(run, options) {
  const dir = await makeBundle(options);
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

process.on('exit', () => {
  for (const child of running) child.kill('SIGKILL');
});

// --- application routes -----------------------------------------------------

test('serves the app shell at the root', async () => {
  await withServer(async ({ base }) => {
    const response = await fetch(`${base}/`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /SHELL/);
    assert.match(response.headers.get('content-type'), /text\/html/);
  });
});

test('client routes fall back to the shell', async () => {
  await withServer(async ({ base }) => {
    for (const route of ['/control', '/control/scripture', '/output', '/setup']) {
      const response = await fetch(`${base}${route}`);
      assert.equal(response.status, 200, `${route} should serve the shell`);
      assert.match(await response.text(), /SHELL/, `${route} should serve the shell`);
    }
  });
});

test('a real file is served as itself, not as the shell', async () => {
  await withServer(async ({ base }) => {
    const response = await fetch(`${base}/livelayer-mark.svg`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), MARK_SVG);
    assert.equal(response.headers.get('content-type'), 'image/svg+xml');
  });
});

test('/seed-test.html is the harness file, not the SPA fallback', async () => {
  await withServer(async ({ base }) => {
    const response = await fetch(`${base}/seed-test.html`);
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.match(body, /HARNESS/);
    assert.doesNotMatch(body, /SHELL/, 'serving the shell here would hide a missing harness');
  });
});

// --- misses -----------------------------------------------------------------

test('a missing asset is a 404, not the shell', async () => {
  await withServer(async ({ base }) => {
    for (const path of ['/assets/missing.js', '/missing.png', '/nested/gone.css']) {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, 404, `${path} should 404`);
      assert.doesNotMatch(await response.text(), /SHELL/, `${path} must not return the shell`);
    }
  });
});

test('a missing dist/index.html explains itself instead of 404ing blankly', async () => {
  await withServer(async ({ base }) => {
    const response = await fetch(`${base}/control`);
    assert.equal(response.status, 500);
    assert.match(await response.text(), /npm run build/);
  }, { withIndex: false });
});

// --- hostile input ----------------------------------------------------------

test('a malformed URL is a 400 and does not stop the server', async () => {
  await withServer(async ({ base }) => {
    const bad = await fetch(`${base}/%zz`);
    assert.equal(bad.status, 400);
    // The regression that matters: the process used to die here.
    const after = await fetch(`${base}/control`);
    assert.equal(after.status, 200);
    assert.match(await after.text(), /SHELL/);
  });
});

test('path traversal cannot read outside dist', async () => {
  await withServer(async ({ base }) => {
    const attempts = [
      '/../secret.txt',
      '/../../secret.txt',
      '/..%2fsecret.txt',
      '/%2e%2e/secret.txt',
      '/assets/../../secret.txt',
      '/..%5csecret.txt'
    ];
    for (const path of attempts) {
      const response = await fetch(`${base}${path}`);
      const body = await response.text();
      assert.notEqual(response.status, 200, `${path} must not succeed`);
      assert.doesNotMatch(body, /lives outside dist/, `${path} leaked the file`);
    }
  });
});

test('a symlink out of dist cannot be followed', async (t) => {
  const probe = await mkdtemp(join(tmpdir(), 'livelayer-symlink-'));
  const supported = await canSymlink(probe).finally(() => rm(probe, { recursive: true, force: true }));
  if (supported !== true) {
    t.skip(`this platform refused to create a symlink (${supported}) — the server rule is unchanged`);
    return;
  }

  await withServer(async ({ base }, dir) => {
    // The path string stays inside dist/ in every case here; only the resolved
    // filesystem target leaves it.
    for (const path of ['/exposed.txt', '/escape/secret.txt', '/escape/nested/deeper.txt']) {
      const response = await fetch(`${base}${path}`);
      const body = await response.text();
      assert.equal(response.status, 404, `${path} must not be served`);
      assert.doesNotMatch(body, /lives outside dist/, `${path} leaked a file outside dist`);
      assert.doesNotMatch(body, /deeper secret/, `${path} leaked a file outside dist`);
    }

    // The real file beside them still serves, so this is containment, not a
    // blanket refusal.
    const ordinary = await fetch(`${base}/livelayer-mark.svg`);
    assert.equal(ordinary.status, 200);
    assert.equal(await ordinary.text(), MARK_SVG);
  }, {
    prepare: async (dir) => {
      // A direct file symlink…
      await symlink(join(dir, 'secret.txt'), join(dir, 'dist', 'exposed.txt'));
      // …and a directory symlink, where the escape is a path component rather
      // than the file itself.
      await mkdir(join(dir, 'outside', 'nested'), { recursive: true });
      await writeFile(join(dir, 'outside', 'secret.txt'), SECRET);
      await writeFile(join(dir, 'outside', 'nested', 'deeper.txt'), 'deeper secret');
      await symlink(join(dir, 'outside'), join(dir, 'dist', 'escape'));
    }
  });
});

test('a port already in use is refused with a clear message', async () => {
  const port = await freePort();
  const blocker = createServer();
  await new Promise((resolve, reject) => {
    blocker.on('error', reject);
    blocker.listen(port, '127.0.0.1', resolve);
  });
  try {
    await withBundle(async (dir) => {
      const { code, stderr } = await startExpectingExit(dir, ['--port', String(port)]);
      assert.equal(code, 1);
      assert.match(stderr, /already in use/i);
      assert.match(stderr, /--port \d+/, 'the error should name a port to try instead');
    });
  } finally {
    await new Promise((resolve) => blocker.close(resolve));
  }
});

test('only GET and HEAD are allowed', async () => {
  await withServer(async ({ base }) => {
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const response = await fetch(`${base}/`, { method });
      assert.equal(response.status, 405, `${method} should be refused`);
      assert.equal(response.headers.get('allow'), 'GET, HEAD');
    }
  });
});

test('HEAD returns the headers with no body', async () => {
  await withServer(async ({ base }) => {
    const response = await fetch(`${base}/control`, { method: 'HEAD' });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '');
    assert.match(response.headers.get('content-type'), /text\/html/);
  });
});

// --- caching ----------------------------------------------------------------

test('nothing is cached beyond the page it is on', async () => {
  await withServer(async ({ base }) => {
    // No file may be pinned, whatever its name or directory: the server cannot
    // know which names are content-addressed, and a wrong guess strands a fix
    // an operator just made.
    for (const path of ['/assets/index-B8pWpWbR.js', '/assets/brand-companylogo.png', '/livelayer-mark.svg']) {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, 200, `${path} should serve`);
      assert.equal(response.headers.get('cache-control'), 'no-cache', `${path} must not be pinned`);
    }

    const shell = await fetch(`${base}/control`);
    assert.equal(shell.headers.get('cache-control'), 'no-store');

    // A real HTML file takes a different code path from the client-route
    // fallback above, and must not be pinned either.
    const harness = await fetch(`${base}/seed-test.html`);
    assert.equal(harness.headers.get('cache-control'), 'no-store');
  });
});

// --- start-up ---------------------------------------------------------------

test('a port browsers block is refused with a usable alternative', async () => {
  await withBundle(async (dir) => {
    const { code, stderr } = await startExpectingExit(dir, ['--port', '4190']);
    assert.equal(code, 1);
    assert.match(stderr, /browsers refuse/i);
    assert.match(stderr, /--port \d+/, 'the error should name a port that works');
  });
});

test('a port that is not a port is refused', async () => {
  await withBundle(async (dir) => {
    for (const bad of ['banana', '0', '70000', '-1']) {
      const { code, stderr } = await startExpectingExit(dir, ['--port', bad]);
      assert.equal(code, 1, `--port ${bad} should be refused`);
      assert.match(stderr, /port/i);
    }
  });
});

test('an allowed alternate port starts normally and serves', async () => {
  await withBundle(async (dir) => {
    const port = await freePort();
    let server;
    try {
      server = await start(dir, ['--port', String(port)]);
      assert.equal(server.port, port);
      assert.match(server.output(), new RegExp(`http://127\\.0\\.0\\.1:${port}/control`));
      const response = await fetch(`${server.base}/control`);
      assert.equal(response.status, 200);
    } finally {
      if (server) await server.stop();
    }
  });
});

test('--host 0.0.0.0 lists candidate addresses and still serves this machine', async () => {
  await withServer(async ({ base, port, output }) => {
    // No single interface may be presented as the answer; 127.0.0.1 must remain
    // available as the same-machine fallback.
    assert.match(output(), /serving on every interface/);
    assert.match(output(), new RegExp(`http://127\\.0\\.0\\.1:${port}`));
    const response = await fetch(`${base}/control`);
    assert.equal(response.status, 200);
  }, { args: ['--host', '0.0.0.0'] });
});
