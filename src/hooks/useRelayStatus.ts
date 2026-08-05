import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getRealtimeRelayUrl } from '../lib/realtime';
import {
  probeRelay,
  relayHost,
  resolveRelayTransition,
  type RelayConnection,
  type RelayStatusShape
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
 * **Keyed on `location.search`.** The relay is configured by `?relay=`, and the
 * control layout stays mounted across navigation, so resolving it only once per
 * mount left a URL change with no effect: the old relay kept being polled, the old
 * badge kept showing, and — because the persistence side effects live inside
 * `getRealtimeRelayUrl`, which clears storage on `off` and writes it on a valid
 * value — the stored relay was never cleared either. `?relay=off` did nothing
 * until a full reload. Reading the router's location rather than `window.location`
 * is what makes the recompute happen at all: an untracked global read is invisible
 * to React and would reintroduce the same staleness.
 *
 * The verdict, the pre-probe transition and the stale-result guard all live in
 * `relayReadiness.ts` so they can be tested without a DOM; this hook owns only the
 * generation counter, the timer and the state. Nothing here infers readiness from
 * `res.ok`, and Program's SENT / UNVERIFIED / FAILED vocabulary is untouched —
 * readiness is about whether a command has somewhere to go, never about whether
 * output received it.
 */
export function useRelayStatus(pollMs = 5000, deps: { fetchImpl?: typeof fetch } = {}): RelayStatus {
  const { search } = useLocation();
  const [status, setStatus] = useState<RelayStatus>(() => {
    const relayUrl = getRealtimeRelayUrl();
    return relayUrl
      ? { connection: 'checking', host: relayHost(relayUrl), detail: '' }
      : { connection: 'local', host: null, detail: '' };
  });

  const injectedFetch = deps.fetchImpl;
  /**
   * Incremented per effect run. A probe that resolves after the relay changed
   * belongs to an older generation and is discarded, so A's late answer can never
   * overwrite B — or restore a relay that `?relay=off` just cleared.
   */
  const generation = useRef(0);

  useEffect(() => {
    const fetchImpl = injectedFetch ?? fetch;
    const mine = ++generation.current;

    // Re-resolving is also what APPLIES `?relay=off`: the clear-on-off and
    // write-on-valid side effects live inside this call.
    const relayUrl = getRealtimeRelayUrl();

    // Show the new target's state before probing it, so the previous relay's
    // `ready` is never displayed next to the new host label.
    setStatus((previous) => resolveRelayTransition(previous, relayUrl) as RelayStatus);

    if (!relayUrl) return;

    const isCurrent = () => generation.current === mine;
    const check = async () => {
      const next: RelayStatusShape | null = await probeRelay(relayUrl, { fetchImpl, isCurrent });
      if (!next) return; // stale — a newer relay generation has started
      setStatus(next as RelayStatus);
    };

    void check();
    const timer = window.setInterval(() => void check(), pollMs);
    return () => {
      // Bumping the generation cancels in-flight probes as well as the interval;
      // clearing the timer alone would still let one land.
      generation.current += 1;
      window.clearInterval(timer);
    };
  }, [pollMs, injectedFetch, search]);

  return status;
}
