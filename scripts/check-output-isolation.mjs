import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outputPath = join(root, 'src/app/OutputPage.tsx');
const stylesPath = join(root, 'src/styles.css');
const source = readFileSync(outputPath, 'utf8');
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

console.log('Output isolation and transparency checks passed.');
