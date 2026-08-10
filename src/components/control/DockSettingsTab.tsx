import { useDockPrefs } from '../../store/useDockPrefs';
import { RELAY_LABEL } from '../../lib/relayReadiness';
import type { RelayStatus } from '../../hooks/useRelayStatus';
import { Icon } from '../../lib/icons';
import ResetLocalData from './ResetLocalData';
import { useServiceContext, setServiceContext } from '../../hooks/useServiceContext';
import { isConfiguredStart } from '../../lib/serviceContext';

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
 * four sections, it leaves four sections.
 */
export default function DockSettingsTab({ relay }: DockSettingsTabProps) {
  const preferCompact = useDockPrefs((state) => state.compactProgramStrip);
  const setCompactProgramStrip = useDockPrefs((state) => state.setCompactProgramStrip);
  const service = useServiceContext();

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

      {/**
        * The service, settable from the dock.
        *
        * The studio has the command-bar summary; the dock had nothing, and an
        * operator working only inside OBS would have watched the start-time and
        * countdown fields appear or not appear with no way to find out why. The
        * hint on those fields says "set the service start time" — this is where
        * a dock operator can.
        *
        * Two fields, no popover: it sits inside a tab the operator already
        * chose to open, so it costs no dock height anywhere else.
        */}
      <section className="dock-card">
        <span className="ll-kicker">Service</span>
        <label className="field">
          <span className="field__label"><span>Service or session</span></span>
          <input
            className="field__input"
            value={service.name}
            placeholder="Sunday Service, Evening Session…"
            onChange={(event) => setServiceContext({ ...service, name: event.target.value })}
          />
        </label>
        <label className="field">
          <span className="field__label"><span>Starts</span></span>
          <input
            className="field__input"
            type="datetime-local"
            value={service.startAt}
            onChange={(event) => setServiceContext({ ...service, startAt: event.target.value })}
          />
          <span className="field__hint">
            {isConfiguredStart(service.startAt)
              ? 'Date and time fields can use this. Graphics already on air keep the time they were taken with.'
              : 'Set a start time to use the event time and countdown fields.'}
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
