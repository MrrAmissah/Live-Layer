/**
 * Score recognised transcripts through the SAME harness the test suite runs.
 *
 * Input is the Python harness's output: one recognised string per corpus index.
 * The expectations are re-read from `serviceCorpus.ts` here rather than carried
 * through the JSON, so a recogniser cannot be scored against expectations that
 * travelled with it — the corpus in source is the only authority for what each
 * utterance named.
 *
 * Reports reference outcomes (the number that decides anything) alongside WER (the
 * number papers publish), and keeps them clearly apart.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { loadAsrModule } from './export-corpus.mjs';

const [, , transcriptsPath, outPath] = process.argv;
if (!transcriptsPath) {
  console.error('usage: node score-transcripts.mjs <transcripts.json> [out.json]');
  process.exit(1);
}

const { mod, cleanup } = await loadAsrModule();
const raw = JSON.parse(await readFile(transcriptsPath, 'utf8'));

/**
 * Accept either a plain `{results:[{index,hypothesis}]}` file or a `benchmark.py`
 * report, picking the corpus run for the requested backend. Reading the benchmark's
 * own output directly removes a copy step, and a copy step is somewhere for the
 * hypotheses to get separated from the run that produced them.
 */
const wanted = process.env.BACKEND || 'mps:float32';
const recognised = raw.results
  ? raw
  : (() => {
      const [device, dtype] = wanted.split(':');
      const run = (raw.runs ?? []).find(
        (r) => r.corpus_run && r.device === device && r.dtype === dtype && r.transcripts
      );
      if (!run) {
        console.error(`no corpus run for ${wanted} in ${transcriptsPath}`);
        process.exit(1);
      }
      return { meta: { repo: raw.repo, label: raw.label, backend: wanted, language: raw.language_prefix,
                       audio: raw.audio, machine: raw.machine }, results: run.transcripts };
    })();

/** index -> hypothesis text, so a missing or reordered entry is caught, not averaged over. */
const byIndex = new Map(recognised.results.map((row) => [row.index, row.hypothesis]));
const missing = mod.SERVICE_CORPUS.map((_, i) => i).filter((i) => !byIndex.has(i));
if (missing.length) {
  console.error(`missing hypotheses for corpus indexes: ${missing.join(', ')}`);
  process.exit(1);
}

// Substitute the recognised text for the hand-written `spoken`, keeping every
// expectation exactly as the corpus declares it.
const asRecognised = mod.SERVICE_CORPUS.map((item, index) => ({ ...item, spoken: byIndex.get(index) }));

const clean = mod.scoreCorpus(mod.SERVICE_CORPUS);
const heard = mod.scoreCorpus(asRecognised);
const wer = mod.corpusErrorRate(
  mod.SERVICE_CORPUS.map((item, index) => ({ reference: item.spoken, hypothesis: byIndex.get(index) }))
);

const summarise = (score) => ({
  total: score.total,
  correct: score.correct,
  correctRate: Number(score.correctRate.toFixed(4)),
  exact: score.exact,
  offered: score.offered,
  outOfOrder: score.outOfOrder,
  incomplete: score.incomplete,
  misGrouped: score.misGrouped,
  refused: score.refused,
  misleadingTop: score.misleadingTop,
  misleadingTopRate: Number(score.misleadingTopRate.toFixed(4)),
  exactRate: Number(score.exactRate.toFixed(4)),
  reachableRate: Number(score.reachableRate.toFixed(4))
});

/** Per-group, because a flat number over a mixed bag hides which situations are safe. */
const groupBreakdown = Object.entries(mod.CORPUS_GROUPS).map(([name, cases]) => {
  const indexes = cases.map((item) => mod.SERVICE_CORPUS.findIndex((entry) => entry.spoken === item.spoken));
  const scored = indexes.map((i) => mod.scoreUtterance({ ...mod.SERVICE_CORPUS[i], spoken: byIndex.get(i) }));
  const wants = (item) => (item.expected ?? []).length === 0;
  return {
    name,
    total: scored.length,
    correct: scored.filter((s) => (wants(s) ? s.outcome === 'refused' : s.outcome === 'exact')).length,
    misleadingTop: scored.filter((s) => s.outcome === 'misleading-top').length
  };
});

const report = {
  source: recognised.meta ?? null,
  wordErrorRate: {
    rate: Number(wer.rate.toFixed(4)),
    substitutions: wer.substitutions,
    deletions: wer.deletions,
    insertions: wer.insertions,
    referenceLength: wer.referenceLength
  },
  cleanTranscripts: summarise(clean),
  recognisedTranscripts: summarise(heard),
  groupBreakdown,
  // Every case that changed outcome, with both texts, so a regression is readable
  // rather than a delta in a summary line.
  changed: mod.SERVICE_CORPUS.map((item, index) => ({
    index,
    spoken: item.spoken,
    heard: byIndex.get(index),
    was: clean.scored[index].outcome,
    now: heard.scored[index].outcome,
    tops: heard.scored[index].tops
  })).filter((row) => row.was !== row.now),
  misleadingCases: heard.misleadingCases.map((c) => ({ heard: c.spoken, tops: c.tops, unexpected: c.unexpected }))
};

await cleanup();
const json = JSON.stringify(report, null, 2);
if (outPath) await writeFile(outPath, json);
console.log(json);
