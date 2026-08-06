import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import { graphicPacks } from '../../lib/packs';
import { usePackSwitchGuard } from '../../hooks/usePackSwitchGuard';
import { RELAY_LABEL } from '../../lib/relayReadiness';
import type { RelayStatus } from '../../hooks/useRelayStatus';
import { Icon } from '../../lib/icons';

interface DockHeaderProps {
  /** Polled once by DockShell and shared with the footer — never a second poller. */
  relay: RelayStatus;
}

/**
 * Dock masthead: brand mark, the event switcher, and the transport dot.
 *
 * Stage 2b folded the old full-bleed EVENT block (56px) into this row: the
 * active pack is now a real switcher, not a label. Every change routes through
 * `usePackSwitchGuard` — the same guard as the studio's CommandBar — because a
 * pack switch re-seeds the draft and can destroy unsaved edits, and a one-tap
 * header dropdown makes that far easier to trigger than the studio flow ever
 * did. This component must never call setActivePack itself.
 *
 * The relay dot is the header's copy of the footer's transport truth (same
 * five RELAY_LABEL states). CSS shows exactly one of the two: the dot on short
 * docks where the footer is hidden, the footer line on tall docks. Both render
 * so a browser without height container queries fails safe (both visible),
 * never silent.
 *
 * Still deliberately quieter than the mockups: no `✕` (an OBS dock has nothing
 * to close) and no `⋮` (no menu exists to open yet — the More tab will own
 * utilities).
 */
export default function DockHeader({ relay }: DockHeaderProps) {
  const activePackId = useLiveLayerStore((state) => state.activePackId);
  const { requestPackChange } = usePackSwitchGuard();

  return (
    <header className="dock-header">
      <span className="dock-header__brand">
        <span className="dock-header__mark" aria-hidden>
          <Icon name="layers" size={21} />
        </span>
        <span className="dock-header__title">LiveLayer</span>
      </span>

      <label className="dock-header__event" title="Active event pack">
        <select
          className="dock-header__select"
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
        <Icon name="chevronDown" size={14} />
      </label>

      <span
        className="dock-header__relay"
        data-connection={relay.connection}
        role="status"
        aria-label={RELAY_LABEL[relay.connection]}
        title={[RELAY_LABEL[relay.connection], relay.host, relay.detail].filter(Boolean).join(' — ')}
      >
        <span className="dock-header__dot" aria-hidden />
      </span>
    </header>
  );
}
