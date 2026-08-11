/**
 * Bridge the TypeScript evaluation corpus out to the Python inference harness.
 *
 * The corpus, the parser and the reference-outcome rule live in `src/lib/asr/` and
 * `src/lib/scripture/` and are the authority. Nothing is re-implemented on the
 * Python side: this writes the corpus out as JSON, the Python harness synthesises
 * audio and recognises it, and `score-transcripts.mjs` reads the recognised text
 * back through the SAME `scoreCorpus` the test suite runs. A second implementation
 * of the scoring rule would be a second thing to keep correct, and the one that
 * disagreed would be discovered on air.
 *
 * Bundled with esbuild rather than run through a TypeScript loader because
 * `referenceOutcome.ts` imports the parser by an extensionless path, which Node's
 * type-stripping does not rewrite.
 */
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '../..');

/** Bundle an entry that re-exports what we need, then import the built module. */
export async function loadAsrModule() {
  const dir = await mkdtemp(join(tmpdir(), 'livelayer-asr-'));
  const entry = join(dir, 'entry.ts');
  await writeFile(
    entry,
    [
      `export { SERVICE_CORPUS, CORPUS_GROUPS } from ${JSON.stringify(join(ROOT, 'src/lib/asr/serviceCorpus.ts'))};`,
      `export { HELD_OUT_CORPUS, HELD_OUT_GROUPS } from ${JSON.stringify(join(ROOT, 'src/lib/asr/heldOutCorpus.ts'))};`,
      `export { scoreCorpus, scoreUtterance } from ${JSON.stringify(join(ROOT, 'src/lib/asr/referenceOutcome.ts'))};`,
      `export { corpusErrorRate, wordErrorRate } from ${JSON.stringify(join(ROOT, 'src/lib/asr/transcriptMetrics.ts'))};`
    ].join('\n')
  );

  const out = join(dir, 'bundle.mjs');
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
  const mod = await import(pathToFileURL(out).href);
  return { mod, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = process.argv[2];
  if (!target) {
    console.error('usage: node export-corpus.mjs <out.json>');
    process.exit(1);
  }
  const { mod, cleanup } = await loadAsrModule();
  const groups = Object.entries(mod.CORPUS_GROUPS).map(([name, cases]) => ({
    name,
    spoken: cases.map((item) => item.spoken)
  }));
  await writeFile(
    target,
    JSON.stringify(
      {
        // Index is the join key: the Python side never reorders, and the scorer
        // re-reads the corpus from source rather than trusting what comes back.
        utterances: mod.SERVICE_CORPUS.map((item, index) => ({ index, spoken: item.spoken })),
        groups
      },
      null,
      2
    )
  );
  await cleanup();
  console.log(`wrote ${mod.SERVICE_CORPUS.length} utterances to ${target}`);
}
