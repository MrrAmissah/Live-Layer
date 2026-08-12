import type { LanguageTag, LiveTranscriptSource, TranscriptEvent } from './transcriptSource';
import { liveLatency } from './liveLatency';
import {
  DEFAULT_ENDPOINTER,
  createFramer,
  frameDb,
  emptyEndpointer,
  pushFrame,
  pushSamples,
  looksLikeSpeech,
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
  /**
   * Override the capture constraints. The defaults turn Chrome's voice-call
   * processing off, which is right for a lectern feed and wrong for a laptop
   * microphone sitting beside a loudspeaker.
   */
  audioConstraints?: MediaTrackConstraints;
  /** Which capture profile to ask for. Development comparison only. */
  captureProfile?: CaptureProfileName;
  /**
   * What Chrome ACTUALLY honoured, reported after the stream is granted.
   *
   * Asking for a constraint is not getting it — Chrome may quietly ignore any of
   * them, and a comparison between profiles is worthless if both resolved to the
   * same real settings. Development only; nothing renders this to an operator.
   */
  onCaptureSettings?: (settings: MediaTrackSettings) => void;
  /** Injected for tests; defaults to the real browser APIs. */
  getMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  createSocket?: (url: string) => WebSocket;
}

/**
 * How the microphone is asked for — as a named, switchable profile.
 *
 * The previous stage turned Chrome's voice-call processing off on a hypothesis:
 * "jon thr ixteen" loses exactly the fricatives a spectral gate removes. The
 * operator then reported listening felt somewhat WORSE. Both observations are
 * real and neither is a measurement, so the setting stops being an opinion baked
 * into a call and becomes something a human can A/B in one sitting.
 *
 * `autoGainControl` is off in every profile offered. It is the one of the three
 * that actively fights the silence shield: it raises the gain when nobody is
 * speaking, which lifts room noise toward the level the shield uses to recognise
 * a voice. Nothing measured here argues for it, so nothing here offers it.
 *
 * **Development only.** Selected by URL query, never persisted, and absent from
 * the operator's surface — a microphone-settings dashboard is not the product.
 */
export type CaptureProfileName = 'raw' | 'cleanup' | 'echo-only';

export const CAPTURE_PROFILES: Record<CaptureProfileName, MediaTrackConstraints> = {
  /** A. Nothing between the microphone and the recogniser. */
  raw: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  /** B. Chrome's voice cleanup, minus the gain rider. */
  cleanup: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
  /** C. Echo cancellation alone — for a laptop beside a loudspeaker. */
  'echo-only': { echoCancellation: true, noiseSuppression: false, autoGainControl: false }
};

export const DEFAULT_CAPTURE_PROFILE: CaptureProfileName = 'raw';

/** `?mic=cleanup` during a comparison. Nothing is remembered between sessions. */
export function captureProfileFromLocation(search: string): CaptureProfileName | null {
  const asked = new URLSearchParams(search).get('mic');
  return asked && asked in CAPTURE_PROFILES ? (asked as CaptureProfileName) : null;
}

const captureProfile = (options: LiveTranscriptSourceOptions): MediaTrackConstraints => ({
  ...CAPTURE_PROFILES[options.captureProfile ?? DEFAULT_CAPTURE_PROFILE],
  ...(options.audioConstraints ?? {})
});

/**
 * A bounded, development-only record of what the capture lifecycle did.
 *
 * The defect that produced this — Chrome reporting the microphone in use while
 * LiveLayer offered to start listening — was invisible from either side alone.
 * The source behaved correctly and the UI reported correctly; what went wrong
 * was the sequence between them. Reading `window.__liveMic.trail()` in the
 * console shows that sequence.
 *
 * Timings and state names only. No audio, no transcripts — the same rule as the
 * latency recorder, and for the same reason: a diagnostic is exactly the sort of
 * place a sermon's contents leak in unnoticed.
 */
interface MicTrail {
  at: number;
  session: number;
  event: string;
  detail: string;
}

const TRAIL_LIMIT = 200;
let trail: MicTrail[] = [];

const trace = (session: number, event: string, detail = ''): void => {
  trail = [...trail, { at: Math.round(performance.now()), session, event, detail }].slice(-TRAIL_LIMIT);
};

if (typeof window !== 'undefined') {
  (window as unknown as { __liveMic: unknown }).__liveMic = {
    trail: () => trail,
    /** Live tracks the page still owns — the number that must be 0 when idle. */
    clear: () => {
      trail = [];
    }
  };
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
  /**
   * Identity for every frame, so a result can be matched to what asked for it.
   *
   * Arrival order is not identity: a provisional snapshot can be answered AFTER the
   * final result that superseded it, and "whatever came last" would then replace
   * the authoritative transcript with a guess made from half the sentence.
   */
  let utteranceNo = 0;
  let revisionNo = 0;
  /**
   * How much audio this session has actually produced.
   *
   * Counted because "the session started" and "the session is capturing" are
   * different claims, and only the second one matters. A restart that reported
   * listening while producing zero frames is the defect these exist to make
   * visible — both in the development trail and in the tests.
   */
  let pcmFrames = 0;
  let pcmSamples = 0;
  /** The server has this session and has reset its VAD state. */
  let serverReady = false;

  /**
   * Listening means the WHOLE chain is proven, not one end of it.
   *
   * Three separate facts, and the restart bug lived in the gap between them: the
   * server acknowledged the session (transport and VAD state are ready), the
   * audio context reached `running` (capture CAN produce audio), and PCM has
   * actually arrived (capture IS producing audio). The second session satisfied
   * the first and failed the other two while reporting itself healthy.
   */
  const announceIfReady = (mine: number) => {
    if (mine !== session || !serverReady || pcmFrames === 0) return;
    if (lastStatus !== 'listening') report('listening', '');
  };
  /** Timeline id per utterance, so provisional and final share one measurement. */
  const timelines = new Map<number, number>();
  /** Utterances whose final answer has arrived; later provisionals are stale. */
  const finalised = new Set<number>();

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

  const emit = (text: string, utterance: number, revision: number, isFinal: boolean) => {
    const trimmed = text.trim();
    if (!trimmed && !isFinal) return;
    const event: TranscriptEvent = {
      text: trimmed,
      /**
       * Provisional snapshots are INTERIM, and honestly labelled as such.
       *
       * The model still has no partial hypotheses — each snapshot is a complete
       * re-recognition of the utterance so far, not a continuation. But from the
       * consumer's side that is exactly what interim means: a revisable guess for
       * the same utterance, superseded by the final one. The reducer's rules for
       * interim text — show it, never let it be the last word — are the rules this
       * needs, and claiming these were final would let half a sentence stand as the
       * settled answer.
       */
      isFinal,
      // One segment per utterance, so revisions of the same utterance supersede
      // each other rather than reading as separate things the speaker said.
      segmentId: `${id}-${utterance}`,
      sequence: revision,
      language,
      sourceId: id
    };
    for (const listener of listeners) listener(event);
  };

  /** Release everything, in an order that cannot leave the microphone live. */
  const teardown = () => {
    trace(session, 'teardown', `${stream?.getTracks().length ?? 0} track(s) to release`);
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
    trace(session, 'session-audio', `${pcmFrames} frames, ${pcmSamples} samples`);
    pcmFrames = 0;
    pcmSamples = 0;
    serverReady = false;
    timelines.clear();
    finalised.clear();
    pending = 0;
    queued = [];
    if (meterTimer) clearInterval(meterTimer);
    meterTimer = null;
    level = 0;
  };

  /** Uplink header: session, sequence, control. 16-bit PCM follows for audio. */
  const CONTROL_AUDIO = 0;
  const CONTROL_START = 1;
  const CONTROL_STOP = 2;

  const uplink = (mine: number, kind: number, pcm?: Int16Array) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const header = new ArrayBuffer(12);
    const view = new DataView(header);
    view.setUint32(0, mine, true);
    view.setUint32(4, (revisionNo += 1), true);
    view.setInt32(8, kind, true);
    if (!pcm) {
      socket.send(header);
      return;
    }
    const frame = new Uint8Array(header.byteLength + pcm.byteLength);
    frame.set(new Uint8Array(header), 0);
    frame.set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength), header.byteLength);
    socket.send(frame);
  };

  /**
   * Transport one block of microphone audio. No judgement is applied to it.
   *
   * While the socket is still connecting, audio is DROPPED rather than queued —
   * the opposite of the rule the old uplink used, and deliberately. That one sent
   * complete utterances, so queuing meant not losing something the operator had
   * said. This one sends a continuous stream, and a queue of stream would replay
   * seconds of stale audio into the VAD the moment the socket opened, segmenting a
   * burst of the past as though it were the present. The connect-time warm-up
   * covers the gap, and a connection that never opens is already reported.
   */
  const send = (mine: number, block: Float32Array) => {
    if (mine !== session || !socket || socket.readyState !== WebSocket.OPEN) return;
    // 16-bit PCM: what the feature extractor wants, and a quarter the bytes of
    // float32 over the socket.
    const pcm = new Int16Array(block.length);
    for (let i = 0; i < block.length; i += 1) {
      pcm[i] = Math.max(-32768, Math.min(32767, Math.round(block[i] * 32767)));
    }
    uplink(mine, CONTROL_AUDIO, pcm);
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
      trace(mine, 'start', 'requesting permission');
      report('starting', 'Asking for the microphone…');
      const getMedia =
        options.getMedia ?? ((constraints) => navigator.mediaDevices.getUserMedia(constraints));

      let granted: MediaStream;
      try {
        /**
         * Chrome's voice-call processing is turned OFF, deliberately.
         *
         * `getUserMedia` enables echo cancellation, noise suppression and
         * automatic gain by default, and this asked for all three explicitly.
         * They are tuned to make a human on the other end of a call intelligible,
         * not to preserve a signal for a recogniser — noise suppression is a
         * spectral gate that attenuates exactly the low-energy, broadband parts of
         * speech, which is what fricatives and consonant onsets are.
         *
         * The first human microphone test returned `"jon thr ixteen"` for "John
         * three sixteen" — the vowels intact, the `ee` of "three" and the `s` of
         * "sixteen" gone. That is the signature of a spectral gate, and the same
         * words recognise cleanly when a file is fed to the same model over the
         * same pipeline, because a file never passes through any of this.
         *
         * Echo cancellation is off for a second reason: it adapts against what the
         * machine is PLAYING, and in a booth that is the programme audio. There is
         * no echo path worth cancelling between a lectern microphone and a
         * recogniser, and cancelling one that is not there costs signal.
         *
         * Left overridable, because a laptop microphone beside a loudspeaker is a
         * genuinely different problem from a lectern feed, and this is the knob
         * that would fix it.
         */
        granted = await getMedia({ audio: { channelCount: 1, ...captureProfile(options) } });
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
        trace(mine, 'permission-late', 'stopped while asking — releasing the track');
        for (const track of granted.getTracks()) track.stop();
        return;
      }
      stream = granted;
      trace(mine, 'permission-granted', `${granted.getTracks().length} track(s)`);
      /**
       * What Chrome actually gave us, which is not necessarily what was asked for.
       * A profile comparison in which both profiles silently resolved to the same
       * settings would look like "the profile makes no difference" and mean
       * "the constraint was ignored".
       */
      if (options.onCaptureSettings) {
        const track = granted.getAudioTracks?.()[0] ?? granted.getTracks()[0];
        if (track?.getSettings) options.onCaptureSettings(track.getSettings());
      }

      try {
        socket = (options.createSocket ?? ((url) => new WebSocket(url)))(serviceUrl);
        socket.binaryType = 'arraybuffer';
        socket.addEventListener('open', () => {
          if (mine !== session) return;
          queued = [];
          /**
           * Declare the session before any audio arrives. The server resets Silero
           * on this, so the recurrent state cannot carry the tail of a previous
           * session into the first frames of this one — which is what makes
           * Stop → Start a genuinely independent stream rather than a resumption.
           */
          trace(mine, 'socket-open', 'sending START');
          uplink(mine, CONTROL_START);
          /**
           * Deliberately NOT 'listening' yet. An open socket means the transport
           * exists; it does not mean the server has reset this session's VAD state
           * and is willing to segment audio. The server acknowledges START, and
           * `ready` below is what turns the indicator on — otherwise the first
           * thing the operator says can be fed to a segmenter still holding the
           * previous session's state.
           */
          report('starting', 'Preparing the recogniser…');
        });
        socket.addEventListener('message', (event) => {
          /**
           * The session check is the whole point. A response already in flight when
           * Stop was pressed — or one belonging to the session BEFORE a Stop/Start —
           * must not become a candidate for what the operator just said.
           */
          if (mine !== session) return;
          try {
            const payload = JSON.parse(typeof event.data === 'string' ? event.data : '{}');
            /**
             * Identity, not arrival order. A provisional result for an utterance
             * that has already been finalised is stale by definition — it was made
             * from less audio than the answer already on screen.
             */
            if (payload.session !== undefined && payload.session !== mine) return;

            /**
             * Speech state now comes FROM the server, because the server is what
             * decides it. The browser measures a level for the meter and is told
             * whether that level is a voice.
             */
            if (payload.type === 'ready') {
              trace(mine, 'session-ready', `server accepted; ${pcmFrames} PCM frames so far`);
              serverReady = true;
              // Not enough on its own — the audio path has to be producing too.
              announceIfReady(mine);
              return;
            }

            if (payload.type === 'vad') {
              const speaking = Boolean(payload.speech);
              if (speaking) {
                // The utterance's identity and clock exist from the moment speech
                // starts, so a snapshot has something to be timed against.
                const id = liveLatency.begin();
                timelines.set(Number(payload.utterance ?? 0), id);
                liveLatency.mark(id, 'speech-start');
              } else {
                const id = timelines.get(Number(payload.utterance ?? 0));
                if (id !== undefined) liveLatency.mark(id, 'endpoint');
              }
              report(speaking ? 'recognising' : 'listening', '', speaking);
              return;
            }

            const utterance = Number(payload.utterance ?? 0);
            const isFinal = Boolean(payload.final);
            if (!isFinal && finalised.has(utterance)) return;
            if (isFinal) {
              pending = Math.max(0, pending - 1);
              finalised.add(utterance);
            }

            const timelineId = timelines.get(utterance);
            if (timelineId !== undefined) {
              if (isFinal) {
                liveLatency.mark(timelineId, 'transcript');
                if (typeof payload.inference_seconds === 'number') {
                  liveLatency.inference(timelineId, payload.inference_seconds);
                }
                if (!payload.text) liveLatency.refuse(timelineId);
                else options.onUtteranceTiming?.(timelineId);
              } else {
                liveLatency.mark(timelineId, 'first-interim');
                if (payload.text) options.onUtteranceTiming?.(timelineId);
              }
            }
            if (payload.text || isFinal) {
              emit(String(payload.text ?? ''), utterance, Number(payload.revision ?? 0), isFinal);
            }
          } catch {
            /* a malformed frame is dropped rather than parsed as a reference */
          }
          if (listening) report('listening', '', false);
        });
        socket.addEventListener('error', () => {
          // An old socket erroring must not tear down a newer listening session.
          if (mine !== session) return;
          trace(mine, 'socket-error', 'releasing capture');
          teardown();
          report(
            'unavailable',
            'The local speech service is not running. Start it, or type the reference.'
          );
        });
        socket.addEventListener('close', () => {
          if (mine !== session) return;
          trace(mine, 'socket-close', listening ? 'while listening' : 'during startup');
          if (!listening) {
            // A close BEFORE listening was established still owns a microphone.
            teardown();
            report('unavailable', 'The local speech service closed the connection.');
            return;
          }
          teardown();
          report('stopped', 'The local speech service closed the connection.');
        });

        context = new AudioContext({ sampleRate: config.sampleRate });
        /**
         * Resume it, and then CHECK. This is the restart bug.
         *
         * A context constructed outside a user-gesture call stack starts
         * **suspended** in Chrome, and a suspended context never fires
         * `onaudioprocess` — so no PCM leaves the page and no transcript can
         * possibly arrive. `start()` awaits `getUserMedia` before building the
         * audio graph, which puts the construction outside that stack every time;
         * the first session survives on the page's sticky activation from the
         * click, and later ones, created moments after the previous context was
         * closed, do not.
         *
         * The symptom was exact: the second Start "appears to start" — permission
         * is held, the socket opens, the server acknowledges the session — and
         * then nothing is ever heard, because the microphone's audio was never
         * being read in the first place.
         */
        await context.resume?.();
        trace(mine, 'audio-context', context.state ?? 'unknown');
        if (context.state === 'suspended' || context.state === 'closed') {
          // Said plainly rather than reported as listening. A session that cannot
          // read the microphone is not a session, and claiming otherwise is what
          // left the operator talking to something that was never going to answer.
          teardown();
          report('unavailable', 'Could not start the audio input. Stop and start listening again.');
          return;
        }
        const source = context.createMediaStreamSource(stream);
        // ScriptProcessor rather than AudioWorklet: the dock runs in OBS's embedded
        // Chromium, and a worklet needs a separately served module file. This is a
        // deprecated API doing arithmetic on 20 ms of audio, not a hot path.
        node = context.createScriptProcessor(1024, 1, 1);
        node.onaudioprocess = (event) => {
          if (mine !== session || !listening) return;
          const block = event.inputBuffer.getChannelData(0);
          /**
           * Two things, and only two: measure a level for the meter, and transport
           * the samples.
           *
           * The browser used to decide here whether audio deserved to reach the
           * recogniser, using an energy threshold. That failed human testing in
           * both directions at once — the operator had to lean toward the
           * microphone for normal speech to register, and silence still got through
           * often enough for Whisper to answer "Thank you." No threshold fixes
           * that, because loudness is not what separates a voice from a room. The
           * judgement now lives behind Silero on the server and this is a pipe.
           *
           * The level is still measured HERE, because a meter must respond to the
           * microphone rather than to a round trip. It drives a display and nothing
           * else; no code path reads it to decide anything.
           */
          level = levelFromDb(frameDb(block));
          if (pcmFrames === 0) {
            trace(mine, 'pcm-first', `${block.length} samples`);
            pcmFrames += 1;
            pcmSamples += block.length;
            // The last of the three facts. Announced here rather than assumed,
            // because a session that never reaches this line is the whole defect.
            announceIfReady(mine);
          } else {
            pcmFrames += 1;
            pcmSamples += block.length;
          }
          // Every sample, exactly once, in order. No framing and therefore no
          // remainder to lose — the accumulator that meets Silero's fixed 512-sample
          // frame lives on the server, where the frames are actually needed.
          send(mine, block);
        };
        source.connect(node);
        node.connect(context.destination);

        listening = true;
        trace(mine, 'capture-live', 'audio nodes connected');
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
      } catch (error) {
        trace(mine, 'start-failed', (error as Error)?.name ?? 'unknown');
        // Torn down even if this session is already stale: `stream` may hold a
        // track this start acquired, and nothing else will release it.
        teardown();
        if (mine !== session) return;
        report('unavailable', 'Could not start listening. Type the reference instead.');
      }
    },

    stop() {
      /**
       * Tell the server BEFORE tearing down, so it drops the partial utterance,
       * the pre-roll and Silero's recurrent state rather than carrying them into
       * whatever the operator says next. Sent while the socket is still open —
       * `teardown` closes it.
       */
      uplink(session, CONTROL_STOP);
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
