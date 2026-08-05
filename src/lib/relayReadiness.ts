/**
 * What a relay probe actually proves — stated as a rule, not inferred from `res.ok`.
 *
 * The old check was `setStatus({ connection: res.ok ? 'connected' : 'unreachable' })`
 * against `GET {relay}/health`. A dev or preview server answers **any** unknown
 * path with the SPA index at HTTP 200, and the app and the relay differ only by
 * port on the same host — so pointing the relay at the app's own origin made the
 * probe pass and the header read "Relay connected" while `POST /message` 404'd on
 * every command. Reproduced on the merge base:
 *
 *   GET  127.0.0.1:4173/health  -> 200 text/html   (the SPA index)
 *   POST 127.0.0.1:4173/message -> 404
 *
 * That is worse than an outage, because `realtime.ts` returns the relay's answer
 * and discards the successful local BroadcastChannel delivery — so the overlay
 * shows the graphic while Program records every Take as FAILED, under a green
 * badge. See issue #20.
 *
 * A reachable socket is therefore not readiness. The relay identifies itself:
 * `livelayer-lan-relay.mjs` answers `/health` with JSON `{ ok: true, clients,
 * hasLastMessage }`. Requiring that shape is what separates "something answered"
 * from "a relay answered and can take commands".
 */

export type RelayConnection =
  /** No relay configured — same-browser delivery. Not a failure. */
  | 'local'
  /** Configured; the first probe has not returned yet. */
  | 'checking'
  /** A genuine relay answered. Commands can be accepted. */
  | 'ready'
  /** Something answered, but it is not a relay — commands would fail. */
  | 'not-relay'
  /** Configured and nothing usable answered. */
  | 'unreachable';

/** Everything the classifier needs, so it can be tested without a network. */
export interface RelayProbe {
  /** True for a 2xx. */
  ok: boolean;
  status: number;
  /** Raw `content-type`, or null when absent. */
  contentType: string | null;
  /** Parsed JSON body, or null when the body was not JSON. */
  body: unknown;
}

export interface RelayVerdict {
  connection: RelayConnection;
  /** Operator-facing detail. Empty when ready or local. */
  detail: string;
}

/** The relay's own `/health` shape. Anything else is not a relay. */
function looksLikeRelay(body: unknown): boolean {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const shape = body as Record<string, unknown>;
  // `ok: true` is the identifying claim; `clients` is present on every real
  // response and absent from anything that merely happens to serve JSON.
  return shape.ok === true && typeof shape.clients === 'number';
}

export function classifyRelayProbe(probe: RelayProbe | null): RelayVerdict {
  // A rejected fetch — DNS, refused connection, CORS, timeout.
  if (!probe) {
    return { connection: 'unreachable', detail: 'No response from the relay. Is it running?' };
  }

  if (!probe.ok) {
    return {
      connection: 'unreachable',
      detail: `The relay answered ${probe.status}. Commands would not be delivered.`
    };
  }

  /**
   * 200 but not a relay. This is the case the old check called "connected", and
   * naming it precisely is the whole point: an HTML body at `/health` means the
   * URL is almost certainly the app's own origin rather than the relay's port.
   */
  if (!looksLikeRelay(probe.body)) {
    const html = (probe.contentType ?? '').includes('html');
    return {
      connection: 'not-relay',
      detail: html
        ? 'That address serves the app, not the relay — check the port. Commands will fail.'
        : 'That address answered, but it is not a LiveLayer relay. Commands will fail.'
    };
  }

  return { connection: 'ready', detail: '' };
}

/** True only when a command has somewhere to go. */
export const canAcceptCommands = (connection: RelayConnection): boolean =>
  connection === 'ready' || connection === 'local';
