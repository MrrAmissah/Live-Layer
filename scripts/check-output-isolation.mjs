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

/**
 * WHAT THIS GUARD PROTECTS, restated for the acknowledgement era.
 *
 * These bans began life as a blanket "output does not talk": no fetch, no
 * post, no message construction, no storage writes. Output→control
 * acknowledgement makes the blanket reading obsolete — output now REPORTS —
 * but the invariant underneath it was never "no network"; it was
 * DIRECTIONALITY:
 *
 *   the page that renders to air must not be able to COMMAND (construct or
 *   publish SHOW/HIDE/CLEAR/preview/theme traffic) and must not MUTATE
 *   control state, and nothing it does transmit may delay or break a graphic.
 *
 * So the rules are now expressed that way, and enforced TRANSITIVELY over the
 * real import closure (the single-file greps below survive as the first line):
 *
 *  - `lib/outputAck.ts` is the ONE module in the closure allowed to transmit,
 *    it can construct only OUTPUT_* events, and it is itself content-checked
 *    (no command literals, no awaits, failure swallowed) further down.
 *  - The control transport (`lib/realtime.ts` — createMessage, publishCommand,
 *    postToRelay, the posting channel) is banned from the entire closure, not
 *    just this file. Before this stage, moving a `.post()` one import away
 *    from OutputPage.tsx would have gone green; now it cannot.
 *  - The inverse direction is pinned too: control surfaces cannot import the
 *    output ack modules (see the control-side section).
 */
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
 * air. The messaging-directionality patterns ARE applied transitively now (see
 * the section after this one): output subscribes through `lib/outputChannel.ts`
 * (receive-only) rather than `lib/realtime.ts`, so the control transport and its
 * verbs can be banned from the whole closure without failing on correct code.
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

/**
 * DIRECTIONALITY, transitively (see the block comment above forbiddenPatterns).
 *
 * Output may report; it may never command or mutate control state, and its one
 * transmitter must be unable to hurt the render. Enforced in four parts:
 *
 *  1. Nothing in the closure may reach the control transport — not the module,
 *     not its verbs. This is the old single-file `.post(`/`createMessage` ban
 *     made transitive, which is strictly stronger: the realistic regression was
 *     always one import away from OutputPage.tsx, exactly like the scripture
 *     case that motivated the closure walk.
 *  2. Nothing in the closure may transmit at all, EXCEPT `lib/outputAck.ts` —
 *     one narrow, named module whose contents are pinned by part 3. (The relay
 *     POST there is written as `fetchImpl ?? fetch`, so a naive `fetch(` grep
 *     would not even see it; the exemption is declared anyway so the intent is
 *     enforced, not accidental.)
 *  3. The transmitter itself can only report: no control-command type literal
 *     ever appears in it (it could not construct a SHOW/CLEAR even by casting),
 *     no `await` (fire-and-forget — the render path can never block on it), and
 *     the send failure is swallowed (`.catch(`), never thrown into rendering.
 *  4. No command CONSTRUCTION anywhere in the closure: a `type: 'SHOW_GRAPHIC'`
 *     object literal is banned outside `src/types/` (interface declarations
 *     cannot execute; `parseRealtimeMessage`'s comparisons don't match the
 *     construction shape).
 *
 * localStorage writes get the same transitive treatment with two named
 * exemptions: `lib/relayConfig.ts` (persisting `?relay=` is output's one
 * sanctioned write — an OBS Browser Source must keep its relay across
 * refreshes, and that behaviour predates this guard) and `lib/storage.ts`,
 * which is reachable via registry→packs and is PRE-EXISTING DEBT: the ban
 * still catches a new write appearing in any renderer, stage or hook.
 */
const OUTPUT_SEND_MODULE = 'src/lib/outputAck.ts';
const RELAY_CONFIG_MODULE = 'src/lib/relayConfig.ts';
const STORAGE_WRITE_EXEMPT = new Set([RELAY_CONFIG_MODULE, 'src/lib/storage.ts']);
const COMMAND_TYPES = ['SHOW_GRAPHIC', 'HIDE_GRAPHIC', 'CLEAR_ALL', 'UPDATE_PREVIEW', 'LOAD_PRESET', 'SET_THEME'];

const relPath = (file) => file.replace(`${root}/`, '');
// Capability lives in code; the modules DOCUMENT the banned verbs in their
// comments (they exist to explain this exact boundary), so comments are
// stripped before matching — same approach as dockOperator.test.ts.
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const closureByRel = new Map(renderPathFiles.map((file) => [relPath(file), stripComments(readFileSync(file, 'utf8'))]));

// Positive anchors first: every exemption below names a module that must
// actually be in the closure, or the rule it relaxes is checking nothing.
const anchorFailures = [];
for (const required of [OUTPUT_SEND_MODULE, RELAY_CONFIG_MODULE, 'src/lib/outputChannel.ts']) {
  if (!closureByRel.has(required)) {
    anchorFailures.push(`${required} is not reachable from OutputPage.tsx — the ack/receive path or an exemption is dead`);
  }
}
// The acknowledgements themselves cannot silently vanish from the page.
for (const ack of ['OUTPUT_APPLIED', 'OUTPUT_CLEARED', 'OUTPUT_FAILED', 'OUTPUT_STATUS']) {
  if (!source.includes(`createOutputEvent('${ack}'`)) {
    anchorFailures.push(`OutputPage.tsx no longer sends ${ack} — output stopped acknowledging`);
  }
}
const sendModuleSource = closureByRel.get(OUTPUT_SEND_MODULE) ?? '';
if (!/fetchImpl \?\? fetch/.test(sendModuleSource)) {
  anchorFailures.push(`${OUTPUT_SEND_MODULE} no longer contains the relay send — the network exemption would be vacuous`);
}
if (!/\.catch\(/.test(sendModuleSource)) {
  anchorFailures.push(`${OUTPUT_SEND_MODULE} no longer swallows send failures — a dead relay could throw into the render path`);
}
if (anchorFailures.length) {
  console.error('Output directionality check failed:');
  for (const failure of anchorFailures) console.error(`- ${failure}`);
  process.exit(1);
}

const directionalityFailures = [];
const commandLiteral = new RegExp(`type:\\s*['"](${COMMAND_TYPES.join('|')})['"]`);
for (const [file, text] of closureByRel) {
  // Part 1: the control transport and its verbs, banned everywhere. The path
  // form catches `../lib/realtime` and a sibling `./realtime` alike, without
  // matching `realtimeMessages` (the shared, send-free parse module).
  for (const verb of [/\bcreateMessage\b/, /\bpublishCommand\b/, /\bpostToRelay\b/]) {
    if (verb.test(text)) directionalityFailures.push(`${file} references control command verb ${verb}`);
  }
  if (/\.post\(/.test(text)) {
    directionalityFailures.push(`${file} posts realtime messages`);
  }
  if (/from ['"][^'"]*\/realtime['"]/.test(text)) {
    directionalityFailures.push(`${file} imports the control transport by relative path`);
  }
  // Part 2: transmission, allowed only in the named send module.
  if (file !== OUTPUT_SEND_MODULE) {
    for (const net of [/\bfetch\s*\(/, /\bfetchImpl\b/, /\bXMLHttpRequest\b/, /\bnew WebSocket\b/, /\bsendBeacon\b/]) {
      if (net.test(text)) directionalityFailures.push(`${file} can transmit (${net}) but is not ${OUTPUT_SEND_MODULE}`);
    }
  }
  // Part 4: command construction, banned outside type declarations.
  if (!file.startsWith('src/types/') && commandLiteral.test(text)) {
    directionalityFailures.push(`${file} constructs a control command object`);
  }
  // localStorage writes, transitively.
  if (!STORAGE_WRITE_EXEMPT.has(file) && /\blocalStorage\.(setItem|removeItem|clear)\b/.test(text)) {
    directionalityFailures.push(`${file} writes localStorage from the output render path`);
  }
}
// Part 3: the transmitter can only report.
if (new RegExp(`['"](${COMMAND_TYPES.join('|')})['"]`).test(sendModuleSource)) {
  directionalityFailures.push(`${OUTPUT_SEND_MODULE} names a control command type — it must be unable to construct one`);
}
if (/\bawait\b/.test(sendModuleSource)) {
  directionalityFailures.push(`${OUTPUT_SEND_MODULE} awaits — acknowledgement must stay fire-and-forget`);
}

if (directionalityFailures.length) {
  console.error('Output directionality check failed:');
  for (const failure of directionalityFailures) console.error(`- ${failure}`);
  process.exit(1);
}

/**
 * The INVERSE direction: control surfaces may not speak with output's voice.
 * An OUTPUT_APPLIED minted by a control page would be a forged acknowledgement
 * — Program would confirm a graphic nothing rendered. Applied to every control
 * file (not just the Take path): the ban is on the capability, not the intent.
 */
const controlSideFiles = controlFiles.filter((file) => !file.path.endsWith('app/OutputPage.tsx'));
const outputVoiceFailures = [];
for (const file of controlSideFiles) {
  for (const pattern of [/\bsendOutputEvent\b/, /\bcreateOutputEvent\b/, /from ['"][^'"]*lib\/output(Ack|Channel)['"]/]) {
    if (pattern.test(file.source)) outputVoiceFailures.push(`${file.path} uses output's transmitter (${pattern})`);
  }
}
if (outputVoiceFailures.length) {
  console.error('Control-side directionality check failed:');
  for (const failure of outputVoiceFailures) console.error(`- ${failure}`);
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
