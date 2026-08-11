import type { LanguageTag, LiveTranscriptSource, TranscriptEvent } from './transcriptSource';
import { liveLatency } from './liveLatency';
import {
  DEFAULT_ENDPOINTER,
  createFramer,
  frameDb,
  emptyEndpointer,
  pushFrame,
  pushSamples,
  type EndpointerConfig,
  type EndpointerState,
  type Framer
} from './utteranceEndpointer';

/**
 * The capture source §4 declared and Stage 5 refused to build.
 *
 * It is built now because the two INTEGRATION blockers that stopped it are fixed and
 * measured (§9): misleading-top fell from 34.0% to 3.8% on the same transcripts once
 * the spoken path stopped reading the typed abbreviation table, and latency fell from
 * 15.6 s to 0.649 s once fixed windows were replaced by endpointing.
 *
 * It is **not** built because the feature is validated. **Gate A remains NOT
 * CLEARED** — criterion 3 is unestablished, 4 and 6 have no evidence, and DONDO's
 * own acoustic limits are unchanged. This exists so that validation can happen.
 *
 * ## Where the model is, and is not
 *
 * ```
 *  microphone ─▶ this module ─ PCM over WS ─▶ [ local Python process ]
 *   (browser)     VAD only                     w2v-BERT, 2.4 GB, MPS
 *                     ▲                                 │
 *                     └──────── text only ──────────────┘
 *                                   │
 *                                   ▼  TranscriptEvent
 *                          transcriptStream reducer
 * ```
 *
 * The 0.6B encoder never enters the browser: the page that composites graphics at
 * frame rate does voice-activity detection and nothing else. What crosses back is a
 * string. §4's rule that "no audio, no tensors, no model handle, no credentials"
 * cross the `TranscriptSource` port is intact — the port emits `TranscriptEvent`
 * only. Audio does reach the browser, because that is where the microphone is; it
 * is sent to the local process and never stored, never uploaded, and never
 * persisted.
 *
 * ## The safety properties this must not break
 *
 * - **Nothing airs.** This produces `TranscriptEvent`s. Everything downstream —
 *   candidates, retrieval, review, accept, Take — is unchanged and still requires
 *   two separate operator presses.
 * - **Only finals are interpreted.** `isFinal` is true only for a settled
 *   utterance; the reducer already refuses to parse anything else.
 * - **Stop is immediate.** `stop()` closes the socket, releases the microphone
 *   track, and drops anything in flight — the reducer discards late arrivals too.
 * - **Failure degrades to typing.** Every error path stops listening and reports
 *   why; the typed transcript source is untouched and always available.
 */

/** Where the local recogniser listens. Localhost only — never a hosted service. */
export const DEFAULT_SPEECH_SERVICE = 'ws://127.0.0.1:4179';

/** The languages the local service can be asked for. DONDO cannot infer one. */
export const SPEECH_LANGUAGES: LanguageTag[] = ['en'];

export type ListeningStatus =
  | 'idle'
  | 'starting'
  | 'listening'
  | 'recognising'
  | 'stopped'
  | 'unavailable'
  | 'denied';

export interface LiveSourceStatus {
  status: ListeningStatus;
  /** Operator-facing detail. Empty when there is nothing to say. */
  detail: string;
  /** True while the operator's voice is actually being heard. */
  speaking: boolean;
  /**
   * Actual input level, 0–1, derived from the measured frame RMS.
   *
   * A REAL measurement, never an animation. An operator watching a meter that
   * moves whether or not audio is arriving learns nothing from it, and the one
   * question this surface has to answer instantly is "is LiveLayer hearing me".
   * Mapped from dBFS across a range wide enough to show a quiet room as visibly
   * quiet and speech as visibly loud.
   */
  level: number;
}

/** dBFS → 0–1 for display. −65 dB reads as silence, −10 dB as a full meter. */
export const levelFromDb = (db: number): number => {
  if (!Number.isFinite(db)) return 0;
  return Math.max(0, Math.min(1, (db + 65) / 55));
};

export interface LiveTranscriptSourceOptions {
  serviceUrl?: string;
  endpointer?: EndpointerConfig;
  onStatus?: (status: LiveSourceStatus) => void;
  /**
   * The timeline id for an utterance whose transcript just arrived, so the caller
   * can continue timing through parsing, lookup and render. Timings only — the
   * transcript itself travels by the ordinary `TranscriptEvent`, whose shape is
   * fixed and asserted.
   */
  onUtteranceTiming?: (timelineId: number) => void;
  /** Injected for tests; defaults to the real browser APIs. */
  getMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  createSocket?: (url: string) => WebSocket;
}

export function createLiveTranscriptSource(
  options: LiveTranscriptSourceOptions = {}
): LiveTranscriptSource {
  const id = 'dondo-local';
  const serviceUrl = options.serviceUrl ?? DEFAULT_SPEECH_SERVICE;
  const config = options.endpointer ?? DEFAULT_ENDPOINTER;
  const listeners = new Set<(event: TranscriptEvent) => void>();

  let language: LanguageTag = SPEECH_LANGUAGES[0];
  let listening = false;
  let socket: WebSocket | null = null;
  let stream: MediaStream | null = null;
  let context: AudioContext | null = null;
  let node: ScriptProcessorNode | null = null;
  let endpointer: EndpointerState = emptyEndpointer();
  /**
   * Framing is a STREAM, not a per-callback operation. Framing each audio callback
   * independently discarded whatever did not fill a whole 20 ms frame — 64 of every
   * 1024 samples at 16 kHz, on every callback, for as long as the microphone was on.
   */
  let framer: Framer = createFramer(config.sampleRate);
  let segment = 0;
  let pending = 0;
  /**
   * Which listening session owns the current callbacks.
   *
   * `if (listening)` is not enough and the difference is not theoretical. A socket
   * response already in flight when the operator presses Stop would still have been
   * emitted; worse, after Stop → Start the flag is true again, so a reply belonging
   * to the OLD session would have been interpreted as the new one's first utterance
   * — a transcript from before the operator stopped, offered as a candidate for what
   * they just said.
   *
   * Every callback captures the session it was created in and compares. Bumped
   * BEFORE teardown, so nothing in flight can win the race.
   */
  let session = 0;
  /**
   * Utterances endpointed before the socket opened, flushed on open.
   *
   * **Bounded.** The socket may never open — the service might not be running at
   * all — and an unbounded queue of raw audio behind a connection that never
   * arrives is a memory leak that grows for as long as someone keeps talking. Two
   * utterances is enough to cover a connection handshake and no more; beyond that
   * the oldest is dropped and the operator is told, rather than silently losing
   * audio after the UI has implied it was captured.
   */
  let queued: Float32Array[] = [];
  const MAX_QUEUED_UTTERANCES = 2;
  /** Timeline ids awaiting their response, FIFO — the service answers in order. */
  let timing: number[] = [];

  /**
   * Latest measured level, published on a timer rather than per audio frame.
   *
   * Frames arrive every 20 ms; re-rendering React that often for a meter is waste
   * an operator surface cannot afford while OBS is compositing. The audio path
   * keeps measuring every frame — only the UI notification is coalesced.
   */
  let level = 0;
  let lastStatus: ListeningStatus = 'idle';
  let lastDetail = '';
  let lastSpeaking = false;
  let meterTimer: ReturnType<typeof setInterval> | null = null;

  const report = (status: ListeningStatus, detail = '', speaking = false) => {
    lastStatus = status;
    lastDetail = detail;
    lastSpeaking = speaking;
    options.onStatus?.({ status, detail, speaking, level });
  };

  const emit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    segment += 1;
    const event: TranscriptEvent = {
      text: trimmed,
      // Always final: this source has no interim guesses to offer, because the
      // model does not produce partial hypotheses. Claiming interim results it
      // cannot produce would be a lie the reducer would faithfully act on.
      isFinal: true,
      segmentId: `${id}-${segment}`,
      sequence: 0,
      language,
      sourceId: id
    };
    for (const listener of listeners) listener(event);
  };

  /** Release everything, in an order that cannot leave the microphone live. */
  const teardown = () => {
    // Invalidate FIRST: any callback that fires during teardown belongs to a session
    // that no longer exists.
    session += 1;
    listening = false;
    try { node?.disconnect(); } catch { /* already gone */ }
    try { context?.close(); } catch { /* already gone */ }
    // The track is stopped LAST and unconditionally: if anything above throws, the
    // microphone must still go off. A live mic with no listener is the one failure
    // an operator cannot see.
    for (const track of stream?.getTracks() ?? []) track.stop();
    try { socket?.close(); } catch { /* already gone */ }
    node = null;
    context = null;
    stream = null;
    socket = null;
    endpointer = emptyEndpointer();
    framer = createFramer(config.sampleRate);
    timing = [];
    pending = 0;
    queued = [];
    if (meterTimer) clearInterval(meterTimer);
    meterTimer = null;
    level = 0;
  };

  const send = (mine: number, utterance: Float32Array) => {
    if (mine !== session || !socket) return;
    /**
     * The socket may still be CONNECTING when the first utterance is endpointed.
     * Dropping it here is what "the first thing you say never works" looks like, so
     * it is queued until the socket opens and sent then — or discarded if the
     * connection never comes up, in which case the error path has already told the
     * operator to type.
     */
    if (socket.readyState === WebSocket.CONNECTING) {
      queued.push(utterance);
      if (queued.length > MAX_QUEUED_UTTERANCES) {
        queued.shift();
        report(
          'starting',
          'Still connecting to the local speech service — the earliest utterance was dropped.'
        );
      }
      return;
    }
    if (socket.readyState !== WebSocket.OPEN) return;
    // 16-bit PCM: what the model's feature extractor wants, and a quarter the bytes
    // of float32 over the socket.
    const pcm = new Int16Array(utterance.length);
    for (let i = 0; i < utterance.length; i += 1) {
      pcm[i] = Math.max(-32768, Math.min(32767, Math.round(utterance[i] * 32767)));
    }
    pending += 1;
    // The clock the operator feels starts the moment the endpointer decided.
    const id = liveLatency.begin();
    liveLatency.mark(id, 'endpoint');
    liveLatency.mark(id, 'sent');
    timing.push(id);
    report('recognising', 'Recognising…');
    socket.send(pcm.buffer);
  };

  return {
    id,
    label: 'Microphone (local DONDO)',
    isLive: true,
    languages: SPEECH_LANGUAGES,
    get language() {
      return language;
    },
    setLanguage(tag: LanguageTag) {
      // DONDO's multilingual checkpoints cannot infer a language, so the operator
      // declares it. A wrong declaration is a wrong transcript, not a silent
      // degradation, which is why this is explicit rather than automatic.
      if (SPEECH_LANGUAGES.includes(tag)) language = tag;
    },
    isListening: () => listening,

    subscribe(onEvent) {
      listeners.add(onEvent);
      return () => {
        listeners.delete(onEvent);
      };
    },

    async start() {
      if (listening) return;
      // A fresh session for this start. Everything below captures `mine`, so any
      // callback surviving from a previous session compares unequal and does nothing.
      session += 1;
      const mine = session;
      report('starting', 'Asking for the microphone…');
      const getMedia =
        options.getMedia ?? ((constraints) => navigator.mediaDevices.getUserMedia(constraints));

      let granted: MediaStream;
      try {
        granted = await getMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
      } catch (error) {
        if (mine !== session) return; // stopped while the permission prompt was open
        teardown();
        const denied = (error as DOMException)?.name === 'NotAllowedError';
        report(
          denied ? 'denied' : 'unavailable',
          denied
            ? 'Microphone permission was refused. Type the reference instead.'
            : 'No microphone available. Type the reference instead.'
        );
        return;
      }

      /**
       * Stopped while the permission prompt was open.
       *
       * Without this the start continued: a socket opened, capture began, and —
       * because `teardown()` had already run and cleared `stream` — the microphone
       * granted a moment later was never tracked. A live, untracked microphone that
       * `stop()` cannot reach is the one failure an operator cannot see, and it is
       * exactly what this source promises cannot happen. The track is released here
       * rather than assigned.
       */
      if (mine !== session) {
        for (const track of granted.getTracks()) track.stop();
        return;
      }
      stream = granted;

      try {
        socket = (options.createSocket ?? ((url) => new WebSocket(url)))(serviceUrl);
        socket.binaryType = 'arraybuffer';
        socket.addEventListener('open', () => {
          if (mine !== session) return;
          // Flush anything endpointed while the socket was still connecting.
          const backlog = queued;
          queued = [];
          for (const utterance of backlog) send(mine, utterance);
          report('listening', '');
        });
        socket.addEventListener('message', (event) => {
          /**
           * The session check is the whole point. A response already in flight when
           * Stop was pressed — or one belonging to the session BEFORE a Stop/Start —
           * must not become a candidate for what the operator just said.
           */
          if (mine !== session) return;
          pending = Math.max(0, pending - 1);
          const timelineId = timing.shift();
          try {
            const payload = JSON.parse(typeof event.data === 'string' ? event.data : '{}');
            if (timelineId !== undefined) {
              liveLatency.mark(timelineId, 'transcript');
              if (typeof payload.inference_seconds === 'number') {
                liveLatency.inference(timelineId, payload.inference_seconds);
              }
              if (!payload.text) liveLatency.refuse(timelineId);
              else options.onUtteranceTiming?.(timelineId);
            }
            if (payload.text) emit(String(payload.text));
          } catch {
            /* a malformed frame is dropped rather than parsed as a reference */
          }
          if (listening) report('listening', '', false);
        });
        socket.addEventListener('error', () => {
          // An old socket erroring must not tear down a newer listening session.
          if (mine !== session) return;
          teardown();
          report(
            'unavailable',
            'The local speech service is not running. Start it, or type the reference.'
          );
        });
        socket.addEventListener('close', () => {
          if (mine !== session || !listening) return;
          teardown();
          report('stopped', 'The local speech service closed the connection.');
        });

        context = new AudioContext({ sampleRate: config.sampleRate });
        const source = context.createMediaStreamSource(stream);
        // ScriptProcessor rather than AudioWorklet: the dock runs in OBS's embedded
        // Chromium, and a worklet needs a separately served module file. This is a
        // deprecated API doing arithmetic on 20 ms of audio, not a hot path.
        node = context.createScriptProcessor(1024, 1, 1);
        node.onaudioprocess = (event) => {
          if (mine !== session || !listening) return;
          // Carried across callbacks: samples that do not fill a frame wait for the
          // next block rather than being discarded.
          const framed = pushSamples(framer, event.inputBuffer.getChannelData(0));
          framer = framed.framer;
          for (const frame of framed.frames) {
            // Measured every frame; published to the UI on the timer below.
            level = levelFromDb(frameDb(frame));
            const result = pushFrame(endpointer, frame, config);
            endpointer = result.state;
            if (result.utterance) send(mine, result.utterance);
            else if (pending === 0) {
              const status = result.calibrating ? 'starting' : 'listening';
              const detail = result.calibrating ? 'Listening for the room…' : '';
              // Only when something CHANGED — the meter has its own cadence, and
              // re-reporting identical status per frame is pure re-render.
              if (status !== lastStatus || detail !== lastDetail || result.speaking !== lastSpeaking) {
                report(status, detail, result.speaking);
              }
            }
          }
        };
        source.connect(node);
        node.connect(context.destination);

        listening = true;
        // ~20 Hz: fast enough to read as live, slow enough not to re-render React
        // at audio-frame frequency.
        meterTimer = setInterval(() => {
          if (mine !== session) return;
          options.onStatus?.({ status: lastStatus, detail: lastDetail, speaking: lastSpeaking, level });
        }, 50);
        /**
         * Capture is live, but the connection may not be. Saying "Listening" before
         * the socket is open would claim a working pipeline that cannot yet deliver
         * a transcript; audio endpointed in the meantime is queued rather than lost,
         * and the `open` handler reports the honest state.
         */
        if (socket.readyState === WebSocket.OPEN) report('listening', '');
        else report('starting', 'Connecting to the local speech service…');
      } catch {
        if (mine !== session) return;
        teardown();
        report('unavailable', 'Could not start listening. Type the reference instead.');
      }
    },

    stop() {
      teardown();
      /**
       * Reported unconditionally, not just when fully listening. Stopping while the
       * permission prompt was still open left the status line reading "Asking for
       * the microphone…" over a source that had already been torn down — the button
       * said Start and the text said we were still asking. A stale status about
       * audio capture is exactly the thing an operator cannot afford to misread.
       */
      report('stopped', '');
    }
  };
}
