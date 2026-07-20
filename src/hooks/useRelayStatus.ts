import { useEffect, useState } from 'react';
import { getRealtimeRelayUrl } from '../lib/realtime';

export type RelayConnection = 'local' | 'connected' | 'unreachable' | 'checking';

export interface RelayStatus {
  connection: RelayConnection;
  /** Relay host:port when a relay is configured, else null (same-browser output). */
  host: string | null;
}

/**
 * Truthful transport state for the header. The control surface reaches /output
 * either same-browser (BroadcastChannel — we genuinely cannot confirm a remote
 * OBS source is listening, so this is reported honestly as "local") or through
 * a configured LAN relay, whose /health endpoint we poll. We never claim a
 * confirmed OBS connection the control client can't verify.
 */
export function useRelayStatus(pollMs = 5000): RelayStatus {
  const [status, setStatus] = useState<RelayStatus>(() => {
    const relayUrl = getRealtimeRelayUrl();
    return relayUrl ? { connection: 'checking', host: hostOf(relayUrl) } : { connection: 'local', host: null };
  });

  useEffect(() => {
    const relayUrl = getRealtimeRelayUrl();
    if (!relayUrl) {
      setStatus({ connection: 'local', host: null });
      return;
    }
    const host = hostOf(relayUrl);
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch(`${relayUrl}/health`, { method: 'GET' });
        if (cancelled) return;
        setStatus({ connection: res.ok ? 'connected' : 'unreachable', host });
      } catch {
        if (!cancelled) setStatus({ connection: 'unreachable', host });
      }
    };

    check();
    const timer = window.setInterval(check, pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pollMs]);

  return status;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}
