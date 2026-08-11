/**
 * The 90-minute run: OBS under load, the recogniser beside it, §5 items 5 and 6.
 *
 * Three windows, because "did the recogniser cost anything" is a comparison and not
 * a reading:
 *
 *   baseline  — OBS recording, no recogniser. What this rig drops on its own.
 *   soak      — OBS recording, recogniser transcribing continuously for 90 minutes.
 *   recovery  — OBS recording, recogniser stopped. Whether OBS comes back.
 *
 * Without the baseline, any dropped frame gets blamed on the recogniser; without the
 * recovery window, a rig that was already degrading looks like one the recogniser
 * broke.
 *
 * OBS is loaded with a **local recording**, never a stream — see `obs-stats.mjs`.
 * The recording file this script creates is deleted when the run ends.
 */
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { connect, sample, delta } from './obs-stats.mjs';

const EVAL = join(homedir(), 'LiveLayer-ASR-Eval');
const RESULTS = join(EVAL, 'results');
const PY = join(EVAL, 'venv/bin/python');

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
};
const BASELINE_S = Number(arg('baseline', 300));
const SOAK_S = Number(arg('soak', 5400));
const RECOVERY_S = Number(arg('recovery', 180));
const SAMPLE_S = Number(arg('sample', 15));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toISOString().slice(11, 19);

await mkdir(RESULTS, { recursive: true });

const obs = await connect();
const version = await obs.request('GetVersion');
const scene = await obs.request('GetCurrentProgramScene');
console.log(`OBS ${version.obsVersion} · scene "${scene.currentProgramSceneName ?? scene.sceneName}"`);

const samples = [];
/** Sample on a fixed cadence for `seconds`, tagging each row with its window. */
async function window_(label, seconds, stopWhen) {
  const started = Date.now();
  const first = samples.length;
  while ((Date.now() - started) / 1000 < seconds) {
    const row = await sample(obs.request);
    samples.push({ ...row, window: label });
    if (samples.length % 8 === 0 || samples.length - first === 1) {
      console.log(`  [${stamp()}] ${label} ${((Date.now() - started) / 60000).toFixed(1)}min ` +
        `cpu=${row.cpuUsage}% render=${row.renderSkippedFrames}/${row.renderTotalFrames} ` +
        `output=${row.outputSkippedFrames}/${row.outputTotalFrames} frt=${row.averageFrameRenderTimeMs}ms`);
    }
    if (stopWhen && stopWhen()) break;
    await sleep(SAMPLE_S * 1000);
  }
  return { label, from: first, to: samples.length - 1 };
}

let recordingPath = null;
const windows = [];
let soakProc = null;

try {
  const before = await obs.request('GetRecordStatus');
  if (before.outputActive) throw new Error('OBS is already recording — refusing to interfere.');
  await obs.request('StartRecord');
  console.log('recording started (local file, no stream)');
  await sleep(3000);

  console.log(`--- baseline ${BASELINE_S}s (no recogniser) ---`);
  windows.push(await window_('baseline', BASELINE_S));

  const readyFile = join(RESULTS, 'soak.ready');
  await rm(readyFile, { force: true });
  const soakLog = join(RESULTS, 'soak.jsonl');
  console.log(`--- soak ${SOAK_S}s (recogniser running) ---`);
  soakProc = spawn(PY, [
    join(import.meta.dirname, 'soak.py'),
    '--audio', join(EVAL, 'audio'),
    '--seconds', String(SOAK_S),
    '--out', soakLog,
    '--ready-file', readyFile,
    // The local weights directory, not a Hub id — a soak that starts by downloading
    // 2.4 GB is measuring the network, and on a machine with no connection it would
    // fail an hour into the run rather than at the start.
    '--repo', arg('repo', join(EVAL, 'models/w2v-bert-en')),
    '--chunk-seconds', arg('chunk', '30'),
    '--device', arg('device', 'mps'),
    '--dtype', arg('dtype', 'float32')
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  let soakExit = null;
  soakProc.on('exit', (code) => { soakExit = code; });
  soakProc.stderr.on('data', (d) => process.stderr.write(`[soak] ${d}`));

  // Only start counting the soak window once the model is loaded and warm —
  // otherwise model load time is charged to OBS as recogniser load.
  for (let i = 0; i < 300 && soakExit === null; i += 1) {
    try { await stat(readyFile); break; } catch { await sleep(1000); }
  }
  if (soakExit !== null) throw new Error(`soak process exited early with code ${soakExit}`);
  console.log('recogniser warm; soak window begins');

  windows.push(await window_('soak', SOAK_S + 120, () => soakExit !== null));

  if (soakExit === null) { soakProc.kill('SIGTERM'); await sleep(2000); }
  console.log(`--- recovery ${RECOVERY_S}s (recogniser stopped) ---`);
  windows.push(await window_('recovery', RECOVERY_S));
} finally {
  try {
    if (soakProc && soakProc.exitCode === null) soakProc.kill('SIGKILL');
    const status = await obs.request('GetRecordStatus');
    if (status.outputActive) {
      const stopped = await obs.request('StopRecord');
      recordingPath = stopped.outputPath ?? null;
      console.log(`recording stopped: ${recordingPath}`);
    }
  } catch (err) {
    console.error(`failed to stop recording cleanly: ${err.message}`);
  }
}

// The recording existed only to load the encoder. Deleting it is part of the run,
// not cleanup left to someone else — the disk on this machine is 92% full.
let deleted = false;
if (recordingPath) {
  try { await rm(recordingPath, { force: true }); deleted = true; console.log('recording deleted'); }
  catch (err) { console.error(`could not delete recording: ${err.message}`); }
}

const slice = (w) => samples.slice(w.from, w.to + 1);
const summary = windows.map((w) => {
  const rows = slice(w);
  if (rows.length < 2) return { window: w.label, samples: rows.length, note: 'too few samples' };
  const frt = rows.map((r) => r.averageFrameRenderTimeMs).filter(Number.isFinite).sort((a, b) => a - b);
  const cpu = rows.map((r) => r.cpuUsage).filter(Number.isFinite).sort((a, b) => a - b);
  return {
    window: w.label,
    samples: rows.length,
    ...delta(rows[0], rows[rows.length - 1]),
    medianFrameRenderTimeMs: frt[Math.floor(frt.length / 2)],
    maxFrameRenderTimeMs: frt[frt.length - 1],
    medianCpuPercent: cpu[Math.floor(cpu.length / 2)],
    maxCpuPercent: cpu[cpu.length - 1]
  };
});

let soakCurve = null;
try {
  const lines = (await readFile(join(RESULTS, 'soak.jsonl'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
  // Thermal drift, stated as first-tenth vs last-tenth RTF. If Apple Silicon
  // throttles over 90 minutes, this is where it shows.
  const tenth = Math.max(1, Math.floor(lines.length / 10));
  const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  soakCurve = {
    iterations: lines.length,
    runSeconds: lines.at(-1)?.elapsed_run_seconds,
    firstTenthMedianRtf: med(lines.slice(0, tenth).map((l) => l.rtf)),
    lastTenthMedianRtf: med(lines.slice(-tenth).map((l) => l.rtf)),
    overallMedianRtf: med(lines.map((l) => l.rtf)),
    worstRtf: Math.max(...lines.map((l) => l.rtf)),
    peakRssMb: Math.max(...lines.map((l) => l.peak_rss_mb)),
    maxSwapUsedMb: Math.max(...lines.map((l) => l.swap_used_mb))
  };
  soakCurve.driftPercent = Number(
    (((soakCurve.lastTenthMedianRtf - soakCurve.firstTenthMedianRtf) / soakCurve.firstTenthMedianRtf) * 100).toFixed(2)
  );
} catch (err) {
  console.error(`no soak curve: ${err.message}`);
}

const out = {
  obsVersion: version.obsVersion,
  scene: scene.currentProgramSceneName ?? scene.sceneName,
  streamStarted: false,
  recordingDeleted: deleted,
  config: { baselineSeconds: BASELINE_S, soakSeconds: SOAK_S, recoverySeconds: RECOVERY_S, sampleSeconds: SAMPLE_S },
  windows: summary,
  soakCurve,
  samples
};
await writeFile(join(RESULTS, 'soak-report.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ windows: summary, soakCurve }, null, 2));
obs.close();
