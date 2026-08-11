/**
 * Synthesise the evaluation audio locally with macOS `say`.
 *
 * **This is not church audio and must never be reported as though it were.** It is
 * a synthetic voice reading hand-written sentences in a silent room, which is
 * read speech with clean articulation and no PA system, no congregation, no
 * reverb and no code-switched prosody — that is, the single most favourable
 * condition a recogniser can be given, and very close to the read-religious-text
 * domain DONDO was trained on (`docs/ASR_EVALUATION.md` §3). Numbers measured
 * against it are an OPTIMISTIC BOUND and a check that the transcript's *shape*
 * fits the parser. They are not the Gate A number, which §6 requires on real
 * church audio.
 *
 * What it is legitimately good for: durations are exact and reproducible, so the
 * real-time-factor and latency measurements in §5 items 1–4 — which are properties
 * of the machine and the model, not of the speaker — are honest measurements.
 *
 * `say` is offline and on-device: nothing is uploaded, and no person is recorded,
 * so §7's consent rules are not engaged by this file at all.
 */
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * 16 kHz mono 16-bit LE, which is the sample rate the model card declares, written
 * straight out of `say` — no resampling step, so nothing between the synthesiser
 * and the model can colour the measurement.
 */
const durationOf = async (wav) => {
  const { stdout } = await run('afinfo', [wav]);
  return Number(/estimated duration: ([\d.]+) sec/.exec(stdout)?.[1] ?? 0);
};

async function speak(text, wav, voice, rate) {
  await run('say', ['-v', voice, '-r', String(rate), '-o', wav, '--data-format=LEI16@16000', text]);
  return durationOf(wav);
}

/**
 * Public-domain filler for the fixed-length clips: KJV scripture and plain
 * narration. Only its DURATION matters for real-time factor — the clips exist to
 * load the machine for a known number of audio seconds, not to be scored.
 */
const FILLER = [
  'The Lord is my shepherd, I shall not want. He maketh me to lie down in green pastures.',
  'He leadeth me beside the still waters. He restoreth my soul.',
  'He leadeth me in the paths of righteousness for his name sake.',
  'Yea, though I walk through the valley of the shadow of death, I will fear no evil.',
  'For thou art with me, thy rod and thy staff they comfort me.',
  'Thou preparest a table before me in the presence of mine enemies.',
  'Thou anointest my head with oil, my cup runneth over.',
  'Surely goodness and mercy shall follow me all the days of my life.',
  'And I will dwell in the house of the Lord for ever.',
  'In the beginning God created the heaven and the earth.',
  'And the earth was without form, and void, and darkness was upon the face of the deep.',
  'And the Spirit of God moved upon the face of the waters.',
  'And God said, let there be light, and there was light.',
  'And God saw the light, that it was good, and God divided the light from the darkness.'
];

const [, , corpusPath, outDir, voiceArg, rateArg] = process.argv;
if (!corpusPath || !outDir) {
  console.error('usage: node make-audio.mjs <corpus.json> <outDir> [voice] [wordsPerMinute]');
  process.exit(1);
}
const voice = voiceArg || 'Daniel';
const rate = Number(rateArg || 165);

await mkdir(join(outDir, 'corpus'), { recursive: true });
await mkdir(join(outDir, 'duration'), { recursive: true });

const corpus = JSON.parse(await readFile(corpusPath, 'utf8'));
const manifest = [];
for (const { index, spoken } of corpus.utterances) {
  const wav = join(outDir, 'corpus', `${String(index).padStart(3, '0')}.wav`);
  const seconds = await speak(spoken, wav, voice, rate);
  manifest.push({ index, spoken, wav, seconds });
  process.stdout.write(`\rcorpus ${index + 1}/${corpus.utterances.length}`);
}
process.stdout.write('\n');

/**
 * Fixed-length clips for real-time factor. Built by repeating filler until the
 * synthesised file is at least the target, then reported at its MEASURED duration
 * — an RTF divided by an assumed length is not a measurement.
 */
const durationClips = [];
for (const target of [10, 30, 120]) {
  const wav = join(outDir, 'duration', `${target}s.wav`);
  let text = '';
  let seconds = 0;
  for (let i = 0; seconds < target; i += 1) {
    text += `${FILLER[i % FILLER.length]} `;
    seconds = await speak(text, wav, voice, rate);
    if (i > 200) break;
  }
  durationClips.push({ target, wav, seconds });
  console.log(`duration clip ${target}s -> measured ${seconds.toFixed(2)}s`);
}

await writeFile(
  join(outDir, 'manifest.json'),
  JSON.stringify({ voice, wordsPerMinute: rate, synthetic: true, corpus: manifest, durationClips }, null, 2)
);
console.log(`wrote manifest for ${manifest.length} corpus clips and ${durationClips.length} duration clips`);
