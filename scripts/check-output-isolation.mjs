import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outputPath = join(root, 'src/app/OutputPage.tsx');
// The Take path used to live in exactly one file, so this checked exactly one
// file — and would have gone green at the moment that stopped being true. It now
// walks the whole control surface and fails if it cannot even find the place
// SHOW_GRAPHIC is constructed.
const controlDirs = ['src/app', 'src/components/control'];
const stylesPath = join(root, 'src/styles.css');
const source = readFileSync(outputPath, 'utf8');
function collectSources(dir) {
  const out = [];
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...collectSources(rel));
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts')) {
      out.push({ path: rel, source: readFileSync(join(root, rel), 'utf8') });
    }
  }
  return out;
}
const controlFiles = controlDirs.flatMap(collectSources);
// Scope the Take-path checks to the files that actually build or publish a
// SHOW_GRAPHIC, found by content rather than by path — the editor legitimately
// resolves asset bytes for preview, and scanning it would flag that.
const takePathFiles = controlFiles.filter((file) =>
  /createMessage\(\s*['"]SHOW_GRAPHIC['"]|buildInstanceFromDraft\s*\(/.test(file.source)
);
const controlSource = takePathFiles.map((file) => file.source).join('\n');
const styles = readFileSync(stylesPath, 'utf8');

const forbiddenPatterns = [
  { pattern: /from ['"].*store\/useLiveLayerStore['"]/, label: 'control Zustand store import' },
  { pattern: /from ['"].*components\/control\//, label: 'control component import' },
  { pattern: /from ['"].*lib\/storage['"]/, label: 'direct control storage import' },
  { pattern: /from ['"].*lib\/people\//, label: 'people store import' },
  { pattern: /from ['"].*lib\/rundown\//, label: 'rundown store/import helper import' },
  { pattern: /from ['"].*lib\/export\//, label: 'import/export pack import' },
  { pattern: /from ['"].*lib\/scripture\//, label: 'scripture provider/cache import' },
  { pattern: /from ['"].*hooks\/useScripture/, label: 'scripture hook import' },
  { pattern: /\blocalStorage\.(setItem|removeItem|clear)\b/, label: 'direct localStorage write' },
  { pattern: /\bfetch\s*\(/, label: 'direct network fetch' },
  { pattern: /\b(saveAsset|savePerson|importPeople|importRundown|deleteRundown|clearAllData)\b/, label: 'control/storage write helper usage' },
  { pattern: /\bcreateMessage\b/, label: 'control-side realtime command construction' },
  { pattern: /\.post\(/, label: 'realtime message posting' }
];

const failures = forbiddenPatterns.filter(({ pattern }) => pattern.test(source));

if (failures.length) {
  console.error('Output isolation check failed:');
  for (const failure of failures) {
    console.error(`- OutputPage.tsx contains ${failure.label}`);
  }
  process.exit(1);
}

// Positive anchor: if the construction site vanished, the greps below would
// pass by inspecting code that no longer sends anything.
const showSite = takePathFiles.find((file) => /createMessage\(\s*['"]SHOW_GRAPHIC['"]/.test(file.source));
if (!showSite) {
  console.error('SHOW_GRAPHIC asset-reference check failed:');
  console.error("- could not find where SHOW_GRAPHIC is constructed; this guard would pass vacuously");
  process.exit(1);
}

const controlMessageFailures = [
  { pattern: /\bdataUrl\b/, label: 'thumbnail/dataUrl usage in the Take path' },
  { pattern: /\b(getAsset|getAssetBlob|resolveAssetSource)\b/, label: 'asset byte resolution in the Take path' },
  { pattern: /\b(logoResolvedSrc|headshotResolvedSrc)\b/, label: 'pre-resolved image src in SHOW_GRAPHIC messages' }
].filter(({ pattern }) => pattern.test(controlSource));

if (controlMessageFailures.length) {
  console.error('SHOW_GRAPHIC asset-reference check failed:');
  for (const failure of controlMessageFailures) {
    console.error(`- the control surface contains ${failure.label}`);
  }
  process.exit(1);
}

const transparencyFailures = [];
if (!source.includes("document.documentElement.classList.add('gfx-transparent')")) {
  transparencyFailures.push('OutputPage no longer applies gfx-transparent to html');
}
if (!source.includes("document.body.classList.add('gfx-transparent')")) {
  transparencyFailures.push('OutputPage no longer applies gfx-transparent to body');
}
if (!/html\.gfx-transparent,\s*body\.gfx-transparent\s*\{[^}]*background:\s*transparent\s*!important;[^}]*color-scheme:\s*normal;/s.test(styles)) {
  transparencyFailures.push('styles.css no longer forces transparent html/body output background');
}
if (!/\.output-root\s*\{[^}]*background:\s*transparent;/s.test(styles)) {
  transparencyFailures.push('styles.css no longer keeps .output-root transparent');
}

if (transparencyFailures.length) {
  console.error('Output transparency check failed:');
  for (const failure of transparencyFailures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Output isolation, transparency, and asset-reference checks passed.');
