import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import { getPack } from '../../lib/packs';
import { useRelayStatus } from '../../hooks/useRelayStatus';
import { RELAY_LABEL } from '../../lib/relayReadiness';

/**
 * Dock status footer: transport truth on the left, the active pack on the
 * right. The transport indicator reports the REAL five relay states from
 * `useRelayStatus` — `Local output` is the healthy same-browser default, not a
 * failure, and `Not a relay` is its own state (issue #20 / PR #23). There is
 * deliberately no "Online" readout: nothing on a control surface reads
 * `navigator.onLine`, and internet reachability says nothing about whether
 * output renders.
 */
export default function DockFooter() {
  const activePackId = useLiveLayerStore((state) => state.activePackId);
  const relay = useRelayStatus();

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
      <span className="dock-footer__pack" title="Active event pack">
        {getPack(activePackId).name}
      </span>
    </footer>
  );
}
