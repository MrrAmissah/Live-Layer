import { useDockPrefs } from '../../store/useDockPrefs';
import { RELAY_LABEL } from '../../lib/relayReadiness';
import type { RelayStatus } from '../../hooks/useRelayStatus';
import { Icon } from '../../lib/icons';
import ResetLocalData from './ResetLocalData';

interface DockSettingsTabProps {
  /** Polled once by DockShell and shared with header and footer. */
  relay: RelayStatus;
}

/**
 * Settings — what the "More" tab was always supposed to become.
 *
 * More rendered a card reading "Coming in the next stage." while occupying a
 * quarter of the dock's primary navigation, and meanwhile `compactProgramStrip`
 * was a real preference — persisted, read, honoured — that nothing in the
 * product could write. The tab now contains exactly the things that already
 * have behaviour behind them, and nothing else.
 *
 * Deliberately sparse. There is no OBS connection state, no queue-sync badge,
 * no FPS, no version card, no "Online" pill and no switch for a feature that
 * does not exist yet. Every one of those would be a claim this app cannot
 * check, and the product's credibility rests on not making them. If that leaves
 * three sections, it leaves three sections.
 */
export default function DockSettingsTab({ relay }: DockSettingsTabProps) {
  const preferCompact = useDockPrefs((state) => state.compactProgramStrip);
  const setCompactProgramStrip = useDockPrefs((state) => state.setCompactProgramStrip);

  return (
    <div className="dock-tabpane dock-settings">
      <section className="dock-card">
        <span className="ll-kicker">Dock</span>
        <label className="dock-set__row">
          <input
            type="checkbox"
            checked={preferCompact}
            onChange={(event) => setCompactProgramStrip(event.target.checked)}
          />
          <span className="dock-set__label">
            <span className="dock-set__name">Compact Program strip</span>
            <span className="dock-set__hint">
              Trades the Program strip&rsquo;s spare height for the tab below it. Short docks
              compact automatically.
            </span>
          </span>
        </label>
      </section>

      <section className="dock-card">
        <span className="ll-kicker">Connection</span>
        {/* The REAL five relay states from relayReadiness.ts — `Local output` is
            the healthy same-browser default, not a failure. No invented status. */}
        <p className="dock-set__row dock-set__row--static">
          <span className="dock-set__label">
            <span className="dock-set__name" data-connection={relay.connection}>
              {RELAY_LABEL[relay.connection]}
            </span>
            {relay.detail ? <span className="dock-set__hint">{relay.detail}</span> : null}
            {relay.host ? <span className="dock-set__hint dock-set__mono">{relay.host}</span> : null}
          </span>
        </p>
        <a className="btn btn--secondary btn--sm dock-set__link" href="/setup" target="_blank" rel="noreferrer">
          Open setup &amp; diagnostics
          <Icon name="external" size={13} />
        </a>
      </section>

      <section className="dock-card dock-set__danger">
        <span className="ll-kicker">Local data</span>
        <ResetLocalData />
      </section>
    </div>
  );
}
