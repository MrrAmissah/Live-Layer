import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

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

/**
 * The same forbidden imports, applied to everything the output RENDER PATH can reach.
 *
 * The check above reads one file. That was enough while the only plausible
 * mistake was importing a provider directly into `OutputPage.tsx` — which nobody
 * would do. The realistic leak is one hop away: adding a scripture import to
 * `ScriptureCard.tsx`, which the render path pulls in through `registry.ts` and
 * which that grep never opens. Measured: the entry point reaches 32 files, and
 * only 1 was being inspected, so the two scripture patterns were dead in practice.
 *
 * WHAT THIS DOES AND DOES NOT PROVE. It proves no module reachable from
 * `OutputPage.tsx` can fetch a passage, touch a cache, open a microphone or call
 * an AI provider — i.e. nothing on the path that renders to air can do those
 * things. It does NOT prove the strings are absent from the JavaScript the
 * browser downloads: `main.tsx` imports `App`, `App` statically imports every
 * route including the control surface, and the build emits a single chunk, so
 * `bible-api.com` does appear in the file `/output` loads. Making that untrue
 * needs the control routes lazily loaded so `/output` gets its own chunk — a
 * change to how the OBS browser source boots, which does not belong in a
 * Scripture PR. Walking from `main.tsx` instead would fail permanently and
 * usefully tell us nothing, since App reaches everything by design.
 *
 * Scoped deliberately to the dependencies that must never run while rendering to
 * air. The broader control-surface patterns are NOT applied transitively:
 * `lib/realtime.ts` is legitimately reachable (the output subscribes to it) and
 * defines `createMessage`, so reusing the full list would fail on correct code.
 */
function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function outputRenderPathClosure(entry) {
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g)) {
      const next = resolveImport(file, match[1]);
      if (next) walk(next);
    }
  };
  walk(entry);
  return [...seen];
}

const renderPathFiles = outputRenderPathClosure(outputPath);
// Positive anchor: a resolver that silently stopped following imports would
// inspect one file and report success. The render path genuinely spans dozens.
if (renderPathFiles.length < 10) {
  console.error('Output render-path isolation check failed:');
  console.error(
    `- resolved only ${renderPathFiles.length} file(s) from OutputPage.tsx; the import walk is broken and this guard would pass vacuously`
  );
  process.exit(1);
}

const renderPathPatterns = [
  { pattern: /from ['"].*lib\/scripture\//, label: 'scripture provider/cache import' },
  { pattern: /from ['"].*hooks\/useScripture/, label: 'scripture hook import' },
  { pattern: /bible-api\.com/, label: 'passage provider endpoint' },
  { pattern: /\b(openai|anthropic)\b/i, label: 'AI provider SDK' },
  { pattern: /\b(SpeechRecognition|webkitSpeechRecognition|MediaRecorder|getUserMedia)\b/, label: 'speech/microphone API' }
];

const renderPathFailures = [];
for (const file of renderPathFiles) {
  const text = readFileSync(file, 'utf8');
  for (const { pattern, label } of renderPathPatterns) {
    if (pattern.test(text)) renderPathFailures.push({ file: file.replace(`${root}/`, ''), label });
  }
}

if (renderPathFailures.length) {
  console.error('Output render-path isolation check failed:');
  for (const failure of renderPathFailures) {
    console.error(`- ${failure.file} contains ${failure.label} and is reachable from OutputPage.tsx`);
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
