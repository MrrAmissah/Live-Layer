#!/usr/bin/env node
/**
 * Bundle a runnable LiveLayer into one zip, for a machine that has no repo.
 *
 * `serve-dist.mjs`'s own header already describes what this produces: "`dist/`
 * plus this file plus the relay script is a complete, runnable LiveLayer". This
 * script is that sentence, executable — so getting LiveLayer onto a borrowed
 * laptop before a service is a download and one command instead of a git clone,
 * a toolchain, and `npm install` over a hall's Wi-Fi.
 *
 * ## The layout is not arbitrary
 *
 * `serve-dist.mjs` resolves the build as `join(dirname(itself), '..', 'dist')`,
 * so `scripts/` and `dist/` must stay SIDE BY SIDE inside the archive. Flatten
 * it and the server starts and then serves nothing, with an error about a
 * missing `dist/index.html` that reads like a broken download.
 *
 * ## fflate, not `zip`
 *
 * `zip` is not on Windows, and this project stays cross-platform on purpose —
 * the same reason the servers are Node rather than shell. `fflate` is already a
 * runtime dependency, so this adds nothing to install.
 *
 * ## What is deliberately NOT in here
 *
 * No `node_modules`, no source, no `.env`, no local data. Assets, People,
 * presets and rundowns live in the browser that created them and cannot travel
 * in a build — a second machine is a different origin and starts empty. The
 * `.livelayerpack` export is how content moves; this moves the APP.
 *
 *   node scripts/package-release.mjs        # after npm run build
 *   npm run package                         # builds first, then this
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const OUT_DIR = join(ROOT, 'out');

/** The two dependency-free servers. Both must run on Node alone. */
const SCRIPTS = ['serve-dist.mjs', 'livelayer-lan-relay.mjs'];

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('No dist/index.html — run `npm run build` first (or `npm run package`, which does).');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const version = pkg.version ?? '0.0.0';
const stem = `livelayer-${version}`;

/** Every file under `dir`, as archive-relative paths with forward slashes. */
function collect(dir, base = dir, found = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, base, found);
    else found.push(full);
  }
  return found;
}

const files = {};
const archivePath = (...parts) => [stem, ...parts].join('/');

for (const file of collect(DIST)) {
  // POSIX separators inside the archive: a backslash in a zip entry name is a
  // literal character on macOS and Linux, so a Windows-packed archive would
  // unpack as one file called `dist\assets\index.js`.
  const rel = relative(DIST, file).split(sep).join('/');
  files[archivePath('dist', rel)] = readFileSync(file);
}

for (const script of SCRIPTS) {
  files[archivePath('scripts', script)] = readFileSync(join(ROOT, 'scripts', script));
}

/**
 * The one file someone opens first.
 *
 * Written here rather than kept as a template in the repo so it cannot drift
 * from the version and the ports it names.
 */
const engines = pkg.engines?.node ?? '>=22';
files[archivePath('RUNME.txt')] = new TextEncoder().encode(
  `LiveLayer ${version}
================================================================

WHAT THIS IS
  A complete, runnable LiveLayer. No install, no npm, no repo.
  You need Node ${engines} and nothing else: https://nodejs.org

RUN IT
  Open a terminal in this folder, then:

      node scripts/serve-dist.mjs

  It prints the exact addresses to paste into OBS. The usual pair:

      Control dock   http://127.0.0.1:4173/control
      Browser Source http://127.0.0.1:4173/output

  Keep 'dist' and 'scripts' side by side. The server looks for the build
  next to its own folder, so moving either one breaks it.

IF PORT 4173 IS BUSY
      node scripts/serve-dist.mjs --port 4188

  Use the SAME address everywhere. The dock and every Browser Source must
  agree on host and port or Take does nothing — that is not a bug, it is
  the browser refusing to let two different origins talk.

A SECOND DEVICE DRIVING THIS ONE (a tablet, a laptop at the desk)
      node scripts/serve-dist.mjs --host 0.0.0.0
      node scripts/livelayer-lan-relay.mjs

  Then open /setup on this machine's LAN address and copy the control and
  output URLs it gives you — they already carry the ?relay= part.

WHAT DOES NOT COME WITH THIS
  Logos, speaker photos, saved graphics, presets and rundowns live in the
  browser that made them, on the machine that made them. A fresh machine
  starts empty and that is expected. To bring your work across, export a
  rundown as a .livelayerpack on the old machine and import it here.

  Nothing in this archive talks to the internet except Bible lookups.
`
);

mkdirSync(OUT_DIR, { recursive: true });
const outFile = join(OUT_DIR, `${stem}.zip`);
// `level: 9` because this is downloaded over a hall's Wi-Fi once and unpacked
// forever; packing time is nobody's problem.
writeFileSync(outFile, zipSync(files, { level: 9 }));

const count = Object.keys(files).length;
const kb = Math.round(statSync(outFile).size / 1024);
console.log(`${relative(ROOT, outFile)}  —  ${count} files, ${kb} KB`);
console.log('Unpack it anywhere and run:  node scripts/serve-dist.mjs');
