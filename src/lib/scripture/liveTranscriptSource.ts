import type { LanguageTag, LiveTranscriptSource, TranscriptEvent } from './transcriptSource';
import {
  DEFAULT_ENDPOINTER,
  emptyEndpointer,
  pushFrame,
  toFrames,
  type EndpointerConfig,
  type EndpointerState
} from './utteranceEndpointer';

/**
 * The capture source §4 declared and Stage 5 refused to build.
 *
 * It is built now because the two things that stopped it are fixed and measured
 * (§9): the wrong-passage rate fell from 34% to 1.2% once the spoken path stopped
 * reading the typed abbreviation table, and latency fell from 15.6 s to 0.65 s once
 * fixed windows were replaced by endpointing. It is **not** built because the
 * feature is validated — Gate A criteria 4 and 6 still have no evidence, and they
 * need a real service to get any.
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
}

export interface LiveTranscriptSourceOptions {
  serviceUrl?: string;
  endpointer?: EndpointerConfig;
  onStatus?: (status: LiveSourceStatus) => void;
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
  let segment = 0;
  let pending = 0;

  const report = (status: ListeningStatus, detail = '', speaking = false) =>
    options.onStatus?.({ status, detail, speaking });

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
    pending = 0;
  };

  const send = (utterance: Float32Array) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    // 16-bit PCM: what the model's feature extractor wants, and a quarter the bytes
    // of float32 over the socket.
    const pcm = new Int16Array(utterance.length);
    for (let i = 0; i < utterance.length; i += 1) {
      pcm[i] = Math.max(-32768, Math.min(32767, Math.round(utterance[i] * 32767)));
    }
    pending += 1;
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
      report('starting', 'Asking for the microphone…');
      const getMedia =
        options.getMedia ?? ((constraints) => navigator.mediaDevices.getUserMedia(constraints));

      try {
        stream = await getMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
      } catch (error) {
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

      try {
        socket = (options.createSocket ?? ((url) => new WebSocket(url)))(serviceUrl);
        socket.binaryType = 'arraybuffer';
        socket.addEventListener('message', (event) => {
          pending = Math.max(0, pending - 1);
          try {
            const payload = JSON.parse(typeof event.data === 'string' ? event.data : '{}');
            if (payload.text) emit(String(payload.text));
          } catch {
            /* a malformed frame is dropped rather than parsed as a reference */
          }
          if (listening) report('listening', '', false);
        });
        socket.addEventListener('error', () => {
          teardown();
          report(
            'unavailable',
            'The local speech service is not running. Start it, or type the reference.'
          );
        });
        socket.addEventListener('close', () => {
          if (listening) {
            teardown();
            report('stopped', 'The local speech service closed the connection.');
          }
        });

        context = new AudioContext({ sampleRate: config.sampleRate });
        const source = context.createMediaStreamSource(stream);
        // ScriptProcessor rather than AudioWorklet: the dock runs in OBS's embedded
        // Chromium, and a worklet needs a separately served module file. This is a
        // deprecated API doing arithmetic on 20 ms of audio, not a hot path.
        node = context.createScriptProcessor(1024, 1, 1);
        node.onaudioprocess = (event) => {
          if (!listening) return;
          const input = event.inputBuffer.getChannelData(0);
          for (const frame of toFrames(Float32Array.from(input), config.sampleRate)) {
            const result = pushFrame(endpointer, frame, config);
            endpointer = result.state;
            if (result.utterance) send(result.utterance);
            else if (pending === 0) report('listening', '', result.speaking);
          }
        };
        source.connect(node);
        node.connect(context.destination);

        listening = true;
        report('listening', '');
      } catch {
        teardown();
        report('unavailable', 'Could not start listening. Type the reference instead.');
      }
    },

    stop() {
      const wasListening = listening;
      teardown();
      if (wasListening) report('stopped', '');
    }
  };
}
