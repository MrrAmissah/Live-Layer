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

/**
 * The five states as operator words — shared by the studio CommandBar and the
 * dock footer so the vocabulary cannot fork. Never flatten these to a binary
 * "connected": `local` is the healthy default (same-browser output, no relay),
 * and `not-relay` is a distinct misconfiguration (something answered `/health`
 * but it is not a relay — usually the app's own port).
 */
export const RELAY_LABEL: Record<RelayConnection, string> = {
  ready: 'Relay ready',
  'not-relay': 'Not a relay',
  unreachable: 'Relay unreachable',
  checking: 'Checking relay…',
  local: 'Local output'
};

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

/** What the header shows, kept here so the transition rule can be tested. */
export interface RelayStatusShape {
  connection: RelayConnection;
  host: string | null;
  detail: string;
}

/** `host:port`, or null for an unparseable URL. */
export function relayHost(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/**
 * The state to show the moment the effective relay changes, before any probe.
 *
 * `useRelayStatus` used to resolve the relay only inside an effect keyed on
 * `[pollMs, fetchImpl]`. The control layout stays mounted across navigation, so
 * changing `?relay=` — including to `off` — did not re-run it: the old relay kept
 * being polled, the old badge kept showing, and because the persistence side
 * effects live inside `getRealtimeRelayUrl` (it clears storage on `off` and writes
 * it on a valid value), **the stored relay was never cleared either**. The old
 * configuration survived until a full reload.
 *
 * Two rules, and the second is the one that prevents a lie:
 *
 *  - No relay → `local` immediately. `?relay=off` must not sit on a stale `ready`
 *    badge while a doomed probe finishes.
 *  - A DIFFERENT relay → `checking` against the NEW host at once, so the previous
 *    target's `ready` is never displayed beside the new host label.
 *  - The SAME relay → unchanged, so re-running on an unrelated `search` change
 *    does not flash `checking` at an operator mid-service.
 */
export function resolveRelayTransition(
  previous: RelayStatusShape | null,
  relayUrl: string | null
): RelayStatusShape {
  if (!relayUrl) return { connection: 'local', host: null, detail: '' };

  const host = relayHost(relayUrl);
  const sameTarget = previous && previous.host === host && previous.connection !== 'local';
  if (sameTarget) return previous;

  return { connection: 'checking', host, detail: '' };
}

/** Injected so a probe can be exercised without a network. */
export interface RelayProbePorts {
  fetchImpl: typeof fetch;
  /** False once a newer relay generation has started. Checked after the await. */
  isCurrent: () => boolean;
}

/**
 * Probe one relay and classify it, or return `null` when the result is stale.
 *
 * The staleness check is the point. Without it, switching relay A → B (or A →
 * `off`) let A's in-flight response land afterwards and overwrite B's state — so
 * the badge could show A `ready` while the URL named B, or restore a relay the
 * operator had just turned off. Same shape as `runScriptureLookup`: the rule and
 * its guard live here where they can be interleaved in a test, and the hook only
 * supplies the generation.
 */
export async function probeRelay(
  relayUrl: string,
  ports: RelayProbePorts
): Promise<RelayStatusShape | null> {
  const host = relayHost(relayUrl);
  let probe: RelayProbe | null = null;

  /**
   * Destructured deliberately. Calling `ports.fetchImpl(...)` invokes the real
   * `fetch` as a METHOD of `ports`, so `this` is that object and the browser
   * throws "Illegal invocation" — every probe then failed as `unreachable`,
   * including against a healthy relay. Unit tests could not catch it: a plain
   * function fake does not care what `this` is. Found in the browser.
   */
  const { fetchImpl } = ports;

  try {
    const res = await fetchImpl(`${relayUrl}/health`, { method: 'GET' });
    // The body must be read to classify it. A non-JSON body is the SIGNAL, not an
    // error, so a parse failure becomes `body: null` rather than "unreachable".
    let body: unknown = null;
    try {
      body = await res.clone().json();
    } catch {
      body = null;
    }
    probe = { ok: res.ok, status: res.status, contentType: res.headers.get('content-type'), body };
  } catch {
    probe = null;
  }

  if (!ports.isCurrent()) return null;
  const verdict = classifyRelayProbe(probe);
  return { connection: verdict.connection, host, detail: verdict.detail };
}
