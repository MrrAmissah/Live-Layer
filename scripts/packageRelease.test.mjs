import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

/**
 * The release archive, and the two claims about it that a broken one would make
 * anyway: that it exists, and that it is complete.
 *
 * Run under `node --test` beside `serve-dist.test.mjs`, not vitest, because it
 * spawns real processes and reads real files — the same reason that one is
 * there. It skips when `dist/` has not been built rather than failing: `npm run
 * verify` builds LAST, so a clean checkout has no build when the tests run.
 */
const DIST_BUILT = existsSync(join(ROOT, 'dist', 'index.html'));

test('the archive holds a runnable layout, not just files', { skip: !DIST_BUILT && 'no dist/ yet' }, () => {
  execFileSync('node', [join(ROOT, 'scripts', 'package-release.mjs')], { cwd: ROOT, stdio: 'pipe' });
  const stem = `livelayer-${pkg.version}`;
  const zipPath = join(ROOT, 'out', `${stem}.zip`);
  assert.ok(existsSync(zipPath), 'archive was not written');

  const entries = Object.keys(unzipSync(readFileSync(zipPath)));

  /**
   * `scripts/` AND `dist/` under one folder, side by side.
   *
   * `serve-dist.mjs` resolves the build as `join(dirname(itself), '..', 'dist')`.
   * Flatten the archive, or nest the scripts one level deeper, and the server
   * starts and then serves nothing — with an error about a missing
   * `dist/index.html` that reads to an operator like a corrupt download.
   */
  assert.ok(entries.includes(`${stem}/dist/index.html`), 'no dist/index.html at the expected depth');
  assert.ok(entries.includes(`${stem}/scripts/serve-dist.mjs`), 'no serve-dist.mjs beside dist/');
  assert.ok(
    entries.includes(`${stem}/scripts/livelayer-lan-relay.mjs`),
    'the relay is missing — a second device could not be driven from the archive'
  );
  assert.ok(entries.includes(`${stem}/RUNME.txt`), 'nothing tells whoever opens it what to run');

  // Forward slashes only: a backslash is a literal character in a zip entry
  // name on macOS and Linux, so a Windows-packed archive would unpack as one
  // file called `dist\assets\index.js`.
  assert.ok(!entries.some((name) => name.includes('\\')), 'a path used a backslash separator');

  // No source, no dependencies, no local data. The archive moves the APP.
  assert.ok(!entries.some((name) => name.includes('node_modules')), 'node_modules leaked in');
  assert.ok(!entries.some((name) => name.includes('/src/')), 'source leaked in');
  assert.ok(!entries.some((name) => name.endsWith('.env')), 'an env file leaked in');
});

test('the setup page names the archive and the Node floor it actually ships', () => {
  /**
   * The page prints a filename and a version requirement to an operator standing
   * at another machine. Both are copied literals — importing `package.json` into
   * the bundle to print two strings would ship the whole manifest to the browser
   * — so they are pinned here instead. A version bump that misses the page tells
   * someone to look for a file that is not there.
   */
  const page = readFileSync(join(ROOT, 'src', 'app', 'SetupPage.tsx'), 'utf8');
  assert.match(page, new RegExp(`const APP_VERSION = '${pkg.version.replace(/\./g, '\\.')}'`));
  // The MAJOR only: `engines.node` is a range (`>=22.0.0`), and stripping every
  // non-digit from that gives "2200".
  const floor = (pkg.engines?.node ?? '').match(/(\d+)/)?.[1];
  assert.ok(floor, 'package.json declares no engines.node');
  assert.match(page, new RegExp(`const NODE_FLOOR = '${floor}[^']*'`));
});
