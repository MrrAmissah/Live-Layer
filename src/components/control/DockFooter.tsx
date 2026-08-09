import { RELAY_LABEL } from '../../lib/relayReadiness';
import type { RelayStatus } from '../../hooks/useRelayStatus';

interface DockFooterProps {
  /** Polled once by DockShell and shared with the header — never a second poller. */
  relay: RelayStatus;
}

/**
 * Dock status footer: transport truth, spelled out. The indicator reports the
 * REAL five relay states from `relayReadiness.ts` (`RELAY_LABEL`) — `Local
 * output` is the healthy same-browser default, not a failure, and `Not a
 * relay` is its own state (issue #20 / PR #23). There is deliberately no
 * "Online" readout: nothing on a control surface reads `navigator.onLine`, and
 * internet reachability says nothing about whether output renders.
 *
 * Stage 2b: the active-pack name moved to the header's event switcher, and on
 * short docks CSS hides this footer entirely — the header's relay dot carries
 * the same state there. The reason detail is rendered here (not only in a
 * tooltip) because on a tall dock this is the one place with room for it.
 */
export default function DockFooter({ relay }: DockFooterProps) {
  return (
    <footer className="dock-footer">
      <span
        className="dock-footer__relay"
        data-connection={relay.connection}
        role="status"
        title={[relay.host, relay.detail].filter(Boolean).join(' — ') || undefined}
      >
        <span className="dock-footer__dot" aria-hidden />
        {RELAY_LABEL[relay.connection]}
      </span>
      {relay.detail ? <span className="dock-footer__detail">{relay.detail}</span> : null}
    </footer>
  );
}
