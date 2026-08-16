#!/usr/bin/env node
/**
 * Download a Creative Commons Bible from eBible.org and lay it out as JSON this
 * app can serve itself.
 *
 * ## Why a vendored text at all, when every other provider is an API
 *
 * Because there is no API. The Akuapem Twi Bible — Biblica's *Nkwa Asɛm* — is
 * carried by none of the free scripture services: not bible-api, not getbible,
 * not bolls. The only place it exists in a machine-readable form is eBible.org,
 * as a file. So the choice is a vendored copy or no Twi at all.
 *
 * ## The licence, which is the whole permission for this
 *
 * `Copyright © 1996, 2020 Biblica, Inc.`, released under **CC BY-SA 4.0** —
 * eBible's own page says so in Twi: *"Adwuma yi, Creative Commons
 * Attribution-ShareAlike 4.0 International License (CC BY-SA) na wɔde bae."*
 * That is what makes redistributing it lawful, and it comes with obligations
 * this script preserves rather than strips: the copyright line and the licence
 * are written into `about.json` beside the text, and the provider puts them on
 * the graphic's `attribution` so a saved card carries them too.
 *
 * The text is copied UNCHANGED. Only its container changes — verse-per-line to
 * JSON — which also keeps the Biblica® trademark condition satisfied, since
 * that permits redistribution of the work as it stands.
 *
 * ## Why this is not the ESV
 *
 * `esvApiProvider.ts` explains at length that this app does not bundle Bibles,
 * because a rundown pack carries verse text inside it and shipping a
 * copyrighted text that way is publishing rather than display. That reasoning
 * was about a text with NO redistribution licence. This one has an explicit
 * one, which is exactly the difference, and it is why this file exists without
 * contradicting that one.
 *
 * ## Verse-per-line, not USFM
 *
 * eBible offers USFM, USX, HTML and VPL. VPL is one verse per line as
 * `JHN 3:16 text…` with standard USFM book codes — the same codes
 * `apiBibleProvider.ts` already uses — so the conversion is a regular
 * expression rather than a markup parser. A parser I could get subtly wrong on
 * a language I do not read is not worth writing.
 *
 *   node scripts/fetch-bible-text.mjs twi
 */
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * What may be fetched. A allow-list rather than a free-form argument: this
 * writes into `public/`, and every entry here has had its licence read.
 */
const AVAILABLE = {
  twi: {
    ebibleId: 'twi',
    label: 'TWI',
    name: 'Akuapem Twi Nkwa Asɛm',
    language: 'Akuapem Twi',
    attribution:
      'Biblica® Wonhia ɛho kwamma nhoma Akuapem Twi Nkwa Asɛm™ © 1996, 2020 Biblica, Inc. CC BY-SA 4.0.'
  }
};

const id = process.argv[2];
const spec = AVAILABLE[id];
if (!spec) {
  console.error(`Usage: node scripts/fetch-bible-text.mjs <${Object.keys(AVAILABLE).join('|')}>`);
  process.exit(1);
}

const url = `https://ebible.org/Scriptures/${spec.ebibleId}_vpl.zip`;
console.log(`Downloading ${url} …`);
const response = await fetch(url);
if (!response.ok) {
  console.error(`eBible answered ${response.status}. Nothing was written.`);
  process.exit(1);
}

const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
const vplName = Object.keys(files).find((name) => name.endsWith('_vpl.txt'));
if (!vplName) {
  console.error('No *_vpl.txt inside the archive — the format may have changed.');
  process.exit(1);
}

const text = new TextDecoder('utf-8').decode(files[vplName]);

/**
 * `JHN 3:16 Na sɛnea…`
 *
 * Anchored, and a line that does not match is COUNTED rather than ignored: a
 * silent skip would drop verses and leave a Bible with holes in it that nobody
 * notices until a Sunday.
 */
const LINE = /^([1-3A-Z]{3})\s+(\d+):(\d+)\s+(.*)$/;

/**
 * eBible's VPL codes are NOT USFM, for eleven books.
 *
 * `JOH` for John, `1JO` for 1 John, `SOL` for Song of Songs, and eight more.
 * Nothing warned about this — the files simply came out named `JOH.json` and a
 * lookup for `JHN` would have 404'd on exactly the book most likely to be
 * asked for first. Normalising here means the served files speak the same
 * vocabulary as `apiBibleProvider`'s `usfmCodeFor`, so the runtime has ONE set
 * of book codes rather than two that agree most of the time.
 */
const TO_USFM = {
  SOL: 'SNG', EZE: 'EZK', JOE: 'JOL', NAH: 'NAM', MAR: 'MRK', JOH: 'JHN',
  PHI: 'PHP', JAM: 'JAS', '1JO': '1JN', '2JO': '2JN', '3JO': '3JN'
};

const books = new Map();
let parsed = 0;
let skipped = 0;

for (const raw of text.split('\n')) {
  const line = raw.trim();
  if (!line) continue;
  const match = LINE.exec(line);
  if (!match) {
    skipped += 1;
    continue;
  }
  const [, rawCode, chapter, verse, words] = match;
  const code = TO_USFM[rawCode] ?? rawCode;
  if (!books.has(code)) books.set(code, {});
  const chapters = books.get(code);
  if (!chapters[chapter]) chapters[chapter] = {};
  chapters[chapter][verse] = words.trim();
  parsed += 1;
}

const outDir = join(ROOT, 'public', 'bibles', id);
if (existsSync(outDir)) rmSync(outDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

/**
 * ONE FILE PER BOOK, not one file for the Bible.
 *
 * A single 4MB JSON would be fetched in full to show one verse, over whatever
 * the hall's network happens to be. Per book, John is about 200KB and is
 * fetched once and cached by the browser for the rest of the service.
 */
let bytes = 0;
for (const [code, chapters] of books) {
  const body = JSON.stringify(chapters);
  writeFileSync(join(outDir, `${code}.json`), body);
  bytes += body.length;
}

writeFileSync(
  join(outDir, 'about.json'),
  JSON.stringify(
    {
      id,
      label: spec.label,
      name: spec.name,
      language: spec.language,
      /* Required by CC BY-SA, and carried onto every graphic this text fills. */
      attribution: spec.attribution,
      licence: 'CC BY-SA 4.0',
      source: url,
      books: [...books.keys()]
    },
    null,
    2
  )
);

console.log(`${books.size} books, ${parsed} verses, ${Math.round(bytes / 1024)} KB → public/bibles/${id}/`);
if (skipped) console.log(`${skipped} lines did not look like verses and were not written.`);
