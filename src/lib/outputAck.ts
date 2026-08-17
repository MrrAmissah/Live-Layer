import type { OutputEventMessage } from '../types/graphics';
import { REALTIME_CHANNEL_NAME, createRealtimeId } from './realtimeMessages';
import { getRealtimeRelayUrl } from './relayConfig';

/**
 * The output surface's ONE transmitter — and the reason the output isolation
 * guard could be re-expressed as directionality instead of a blanket network
 * ban. The invariant the old ban protected was never "output may not talk"; it
 * was "output may not COMMAND, and may not mutate control state". This module
 * keeps that invariant while letting output report:
 *
 *  - `createOutputEvent` is typed against `OutputEventMessage` and this file
 *    contains no control command construction — it cannot mint a SHOW/CLEAR.
 *    (`scripts/check-output-isolation.mjs` greps this file for command type
 *    literals and fails the build if one ever appears.)
 *  - `sendOutputEvent` is fire-and-forget and failure-tolerant: it never
 *    throws, never returns a promise for the render path to await, and a dead
 *    relay costs one aborted request — an acknowledgement must never delay,
 *    break, or backpressure a graphic that is going to air.
 *  - Nothing here writes storage or touches the store. Reporting only.
 *
 * Local-first: the event goes out on the BroadcastChannel unconditionally (a
 * same-browser control confirms without any relay), and to the relay only when
 * one is configured.
 */
export const OUTPUT_ACK_TIMEOUT_MS = 4000;

/** Fresh per page load — identifies WHICH output answered, across reconnects. */
const outputSessionId = createRealtimeId();

export function getOutputSessionId(): string {
  return outputSessionId;
}

export function createOutputEvent<T extends OutputEventMessage['type']>(
  type: T,
  payload: Extract<OutputEventMessage, { type: T }>['payload']
): OutputEventMessage {
  return {
    id: createRealtimeId(),
    type,
    payload,
    timestamp: Date.now()
  } as OutputEventMessage;
}

/** Injectable for tests; production uses the real transports. */
export interface OutputAckPorts {
  fetchImpl?: typeof fetch;
  /** `undefined` = resolve from config; `null` = explicitly no relay. */
  relayUrl?: string | null;
  postLocal?: (event: OutputEventMessage) => void;
}

let localChannel: BroadcastChannel | null | undefined;

function postLocalDefault(event: OutputEventMessage) {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    localChannel = localChannel ?? new BroadcastChannel(REALTIME_CHANNEL_NAME);
    localChannel.postMessage(event);
  } catch {
    // A closed or unavailable channel loses one report, never the graphic.
  }
}

/**
 * Report, without consequences for the render. Every failure path ends here in
 * a swallow: acknowledgement is best-effort by design, and the honest fallback
 * for a lost ack already exists on the control side (SENT / "Awaiting output").
 */
/**
 * WHAT THE LAST RELAY REPORT DID, kept because swallowing every failure made a
 * real fault unfindable.
 *
 * The swallow itself is right — an acknowledgement must never break a graphic
 * going to air — but "never throws" turned into "never tells anyone", and a rig
 * spent a session where the desk on the other machine sat at "Awaiting output"
 * while every surface here looked healthy. A page could not say whether it had
 * tried, been refused, timed out, or had no relay to talk to.
 *
 * Display only, on `?debug=1`. Never sent, never part of Program truth.
 */
export interface RelayReportState {
  url: string | null;
  outcome: 'none' | 'sending' | 'ok' | 'failed';
  detail: string | null;
  at: number | null;
  sent: number;
  failed: number;
}

const relayReport: RelayReportState = {
  url: null,
  outcome: 'none',
  detail: null,
  at: null,
  sent: 0,
  failed: 0
};

export function getRelayReport(): RelayReportState {
  return { ...relayReport };
}

export function sendOutputEvent(event: OutputEventMessage, ports: OutputAckPorts = {}): void {
  try {
    (ports.postLocal ?? postLocalDefault)(event);
  } catch {
    // reporting must never throw into the render path
  }

  try {
    const relayUrl = ports.relayUrl !== undefined ? ports.relayUrl : getRealtimeRelayUrl();
    relayReport.url = relayUrl;
    if (!relayUrl) {
      /* Not a failure — there is simply no relay configured. Named separately
         because "no relay" and "relay refused" look identical from the desk and
         need completely different fixes. */
      relayReport.outcome = 'none';
      relayReport.detail = 'no relay configured for this page';
      return;
    }
    const fetchImpl = ports.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OUTPUT_ACK_TIMEOUT_MS);
    relayReport.outcome = 'sending';
    fetchImpl(`${relayUrl}/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(event),
      signal: controller.signal
    })
      .then((response) => {
        relayReport.at = Date.now();
        if (response.ok) {
          relayReport.outcome = 'ok';
          relayReport.detail = `${event.type} accepted`;
          relayReport.sent += 1;
        } else {
          // A 4xx here is the relay REFUSING the report — a different problem
          // from not reaching it, and the status code says which.
          relayReport.outcome = 'failed';
          relayReport.detail = `relay answered ${response.status}`;
          relayReport.failed += 1;
        }
      })
      .catch((error: unknown) => {
        relayReport.at = Date.now();
        relayReport.outcome = 'failed';
        relayReport.failed += 1;
        relayReport.detail = controller.signal.aborted
          ? `no answer in ${OUTPUT_ACK_TIMEOUT_MS}ms`
          : (error instanceof Error ? error.message : String(error)) || 'send failed';
      })
      .finally(() => clearTimeout(timer));
  } catch (error) {
    // same rule: a failed report is a lost ack, not a broken output — but it is
    // now a failed report somebody can READ.
    relayReport.outcome = 'failed';
    relayReport.failed += 1;
    relayReport.detail = error instanceof Error ? error.message : 'send threw';
    relayReport.at = Date.now();
  }
}
