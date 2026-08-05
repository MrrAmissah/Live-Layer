import { useEffect, useState } from 'react';
import { getRealtimeRelayUrl } from '../lib/realtime';
import {
  classifyRelayProbe,
  type RelayConnection,
  type RelayProbe,
  type RelayVerdict
} from '../lib/relayReadiness';

export type { RelayConnection } from '../lib/relayReadiness';

export interface RelayStatus {
  connection: RelayConnection;
  /** Relay host:port when a relay is configured, else null (same-browser output). */
  host: string | null;
  /** Why it is not ready. Empty when ready or local. */
  detail: string;
}

/**
 * Truthful transport state for the header. The control surface reaches /output
 * either same-browser (BroadcastChannel — we genuinely cannot confirm a remote
 * OBS source is listening, so this is reported honestly as "local") or through a
 * configured LAN relay, which we probe.
 *
 * The verdict lives in `classifyRelayProbe` so it can be tested without a
 * network — including the case that made this necessary, where a dev server's SPA
 * fallback answered `/health` with 200 text/html and the header read "Relay
 * connected" while every command 404'd (issue #20). This hook performs the probe
 * and reports what the rule decides; it never infers readiness from `res.ok`.
 *
 * `fetchImpl` is injectable for the same reason `postToRelay` takes it: assigning
 * `globalThis.fetch` in a test is not undone by `vi.restoreAllMocks()`.
 */
export function useRelayStatus(pollMs = 5000, deps: { fetchImpl?: typeof fetch } = {}): RelayStatus {
  const [status, setStatus] = useState<RelayStatus>(() => {
    const relayUrl = getRealtimeRelayUrl();
    return relayUrl
      ? { connection: 'checking', host: hostOf(relayUrl), detail: '' }
      : { connection: 'local', host: null, detail: '' };
  });

  const injectedFetch = deps.fetchImpl;

  useEffect(() => {
    const fetchImpl = injectedFetch ?? fetch;
    const relayUrl = getRealtimeRelayUrl();
    if (!relayUrl) {
      setStatus({ connection: 'local', host: null, detail: '' });
      return;
    }
    const host = hostOf(relayUrl);
    let cancelled = false;

    const check = async () => {
      let probe: RelayProbe | null = null;
      try {
        const res = await fetchImpl(`${relayUrl}/health`, { method: 'GET' });
        // The body has to be read to classify it. A non-JSON body is the SIGNAL,
        // not an error, so a parse failure resolves to `body: null` rather than
        // falling into the catch and being reported as unreachable.
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
      if (cancelled) return;
      const verdict: RelayVerdict = classifyRelayProbe(probe);
      setStatus({ connection: verdict.connection, host, detail: verdict.detail });
    };

    void check();
    const timer = window.setInterval(() => void check(), pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pollMs, injectedFetch]);

  return status;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}
