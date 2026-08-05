import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import { graphicPacks } from '../../lib/packs';
import { useRelayStatus, type RelayConnection } from '../../hooks/useRelayStatus';
import { usePackSwitchGuard } from '../../hooks/usePackSwitchGuard';
import { Icon } from '../../lib/icons';

/** Opens an app route in a new tab (output source / setup dock helpers). */
function openRoute(path: string) {
  window.open(`${window.location.origin}${path}`, '_blank');
}

/**
 * Four distinguishable states, because "connected" used to cover two very
 * different things. A dev server's SPA fallback answers `/health` with 200, so a
 * relay URL pointing at the app's own port read as connected while every command
 * 404'd. `not-relay` is that case, named. Only `ready` claims commands can go
 * out — see `relayReadiness.ts` and issue #20.
 */
const RELAY_LABEL: Record<RelayConnection, string> = {
  ready: 'Relay ready',
  'not-relay': 'Not a relay',
  unreachable: 'Relay unreachable',
  checking: 'Checking relay…',
  local: 'Local output'
};

/**
 * Studio header: brand, active production/event context, truthful transport
 * state, and OBS-surface links. The transport indicator reports what the
 * control client can actually verify — a polled LAN relay, or same-browser
 * local output — never an unverifiable "connected to OBS".
 */
export default function CommandBar() {
  const activePackId = useLiveLayerStore((state) => state.activePackId);
  const { requestPackChange } = usePackSwitchGuard();
  const relay = useRelayStatus();

  return (
    <header className="cmd-bar">
      <div className="cmd-bar__brand">
        <span className="cmd-logo">
          <img className="cmd-logo__mark" src="/livelayer-mark.svg" alt="" aria-hidden="true" />
        </span>
        <span className="cmd-logo__name">LiveLayer</span>
      </div>

      <label className="cmd-event" title="Active event pack">
        <span className="cmd-event__label">Event</span>
        <span className="cmd-event__control">
          <select
            className="cmd-event__select"
            value={activePackId}
            onChange={(event) => requestPackChange(event.target.value)}
            aria-label="Active event pack"
          >
            {graphicPacks.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
          <Icon name="chevronDown" size={16} />
        </span>
      </label>

      <div className={`cmd-transport cmd-transport--${relay.connection}`} role="status">
        <span className="cmd-transport__dot" aria-hidden />
        <span className="cmd-transport__copy">
          <span className="cmd-transport__state">{RELAY_LABEL[relay.connection]}</span>
          {relay.host ? <span className="cmd-transport__host">{relay.host}</span> : null}
          {/* The reason, when there is one. A badge that says only "unreachable"
              sends the operator guessing at the port. */}
          {relay.detail ? <span className="cmd-transport__detail">{relay.detail}</span> : null}
        </span>
      </div>

      <div className="cmd-bar__right">
        <button type="button" className="btn btn--ghost btn--md cmd-action" onClick={() => openRoute('/output?debug=1')}>
          <Icon name="previewOutput" size={17} />
          <span>Preview Output</span>
        </button>
        <button type="button" className="btn btn--ghost btn--md cmd-action" onClick={() => openRoute('/setup')}>
          <Icon name="settings" size={17} />
          <span>Setup</span>
        </button>
        {/* Identity, not a menu. It previously wore a dropdown chevron but only
            opened a duplicate /control tab — no menu exists to back it yet. */}
        <span className="cmd-operator" title="Signed in as the operator of this control surface">
          <Icon name="user" size={17} />
          <span>Operator</span>
        </span>
      </div>
    </header>
  );
}
