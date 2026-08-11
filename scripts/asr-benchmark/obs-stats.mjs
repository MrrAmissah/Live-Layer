/**
 * Sample OBS performance counters over the WebSocket, for §5 item 6.
 *
 * "Does the recogniser make OBS drop frames" cannot be answered by an idle OBS —
 * a compositor with nothing to encode has spare capacity by definition. So the
 * measurement runs OBS under a **local recording**, which loads the same encoder
 * path a service uses.
 *
 * ## What this will not do
 *
 * **It never starts a stream, and it refuses to run if one is already live.** This
 * OBS install points at the church's real streaming endpoints, and an accidental
 * `StartStream` is a broadcast, not a test. `StartStream` and `StartVirtualCam` are
 * not called anywhere in this file; the only state it changes is starting and then
 * stopping a recording, and the caller deletes the file it created.
 *
 * Frames are reported as deltas across the window rather than as OBS's
 * since-launch totals: a rig that dropped frames an hour ago would otherwise be
 * charged to the recogniser.
 */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

const URL_ = process.env.OBS_WS_URL || 'ws://127.0.0.1:4455';

async function password() {
  if (process.env.OBS_WEBSOCKET_PASSWORD) return process.env.OBS_WEBSOCKET_PASSWORD;
  const cfg = JSON.parse(await readFile(join(homedir(), '.claude.json'), 'utf8'));
  for (const project of Object.values(cfg.projects ?? {})) {
    const found = project?.mcpServers?.obs?.env?.OBS_WEBSOCKET_PASSWORD;
    if (found) return found;
  }
  throw new Error('OBS WebSocket password not found; set OBS_WEBSOCKET_PASSWORD');
}

const sha256b64 = (value) => createHash('sha256').update(value).digest('base64');

export async function connect() {
  const pass = await password();
  const ws = new WebSocket(URL_);
  const pending = new Map();
  let seq = 0;

  await new Promise((resolve, reject) => {
    const fail = (event) => reject(new Error(`OBS WebSocket unreachable at ${URL_} (${event?.type ?? 'error'})`));
    ws.addEventListener('error', fail, { once: true });
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.op === 0) {
        const auth = msg.d.authentication;
        const identify = { op: 1, d: { rpcVersion: 1 } };
        if (auth) {
          identify.d.authentication = sha256b64(sha256b64(pass + auth.salt) + auth.challenge);
        }
        ws.send(JSON.stringify(identify));
      } else if (msg.op === 2) {
        ws.removeEventListener('error', fail);
        resolve();
      } else if (msg.op === 7) {
        const entry = pending.get(msg.d.requestId);
        if (!entry) return;
        pending.delete(msg.d.requestId);
        if (msg.d.requestStatus.result) entry.resolve(msg.d.responseData ?? {});
        else entry.reject(new Error(`${msg.d.requestType}: ${msg.d.requestStatus.comment ?? msg.d.requestStatus.code}`));
      }
    });
  });

  const request = (requestType, requestData = {}) =>
    new Promise((resolve, reject) => {
      const requestId = `r${(seq += 1)}`;
      pending.set(requestId, { resolve, reject });
      ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
      setTimeout(() => {
        if (pending.delete(requestId)) reject(new Error(`${requestType} timed out`));
      }, 15000);
    });

  /**
   * The guard, checked on every connection rather than once at the top of a run:
   * if OBS is live, this process does nothing at all.
   */
  const stream = await request('GetStreamStatus');
  if (stream.outputActive) {
    ws.close();
    throw new Error('OBS is STREAMING — refusing to run. Stop the stream first.');
  }

  return { request, close: () => ws.close(), streamWasActive: false };
}

export async function sample(request) {
  const stats = await request('GetStats');
  const record = await request('GetRecordStatus');
  return {
    t: Date.now(),
    cpuUsage: Number(stats.cpuUsage?.toFixed(2)),
    memoryUsageMb: Number(stats.memoryUsage?.toFixed(1)),
    availableDiskSpaceMb: Number(stats.availableDiskSpace?.toFixed(0)),
    activeFps: Number(stats.activeFps?.toFixed(2)),
    averageFrameRenderTimeMs: Number(stats.averageFrameRenderTime?.toFixed(3)),
    renderTotalFrames: stats.renderTotalFrames,
    renderSkippedFrames: stats.renderSkippedFrames,
    outputTotalFrames: stats.outputTotalFrames,
    outputSkippedFrames: stats.outputSkippedFrames,
    recording: record.outputActive,
    recordDurationMs: record.outputDuration
  };
}

/** Deltas across a window. Since-launch totals would charge old drops to this run. */
export function delta(first, last) {
  const d = (key) => (last[key] ?? 0) - (first[key] ?? 0);
  const renderTotal = d('renderTotalFrames');
  const outputTotal = d('outputTotalFrames');
  return {
    windowSeconds: Number(((last.t - first.t) / 1000).toFixed(1)),
    renderTotalFrames: renderTotal,
    renderSkippedFrames: d('renderSkippedFrames'),
    renderSkippedPercent: renderTotal ? Number(((d('renderSkippedFrames') / renderTotal) * 100).toFixed(4)) : 0,
    outputTotalFrames: outputTotal,
    outputSkippedFrames: d('outputSkippedFrames'),
    outputSkippedPercent: outputTotal ? Number(((d('outputSkippedFrames') / outputTotal) * 100).toFixed(4)) : 0
  };
}

if (process.argv[1]?.endsWith('obs-stats.mjs')) {
  const obs = await connect();
  const version = await obs.request('GetVersion');
  const scene = await obs.request('GetCurrentProgramScene');
  const one = await sample(obs.request);
  console.log(JSON.stringify({ obsVersion: version.obsVersion, websocketVersion: version.obsWebSocketVersion,
    currentScene: scene.currentProgramSceneName ?? scene.sceneName, stats: one }, null, 2));
  obs.close();
}
