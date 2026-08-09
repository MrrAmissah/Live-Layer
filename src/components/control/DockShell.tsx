import { useState } from 'react';
import type { LastAction } from './StatusBadge';
import { useRelayStatus } from '../../hooks/useRelayStatus';
import DockHeader from './DockHeader';
import DockTabBar, { type DockTab } from './DockTabBar';
import DockProgramStrip from './DockProgramStrip';
import DockLiveTab from './DockLiveTab';
import DockQueueTab from './DockQueueTab';
import DockQuickEditTab from './DockQuickEditTab';
import DockFooter from './DockFooter';
import DockSettingsTab from './DockSettingsTab';

interface DockShellProps {
  onTake: () => void;
  onClear: () => void;
  lastAction: LastAction;
  /**
   * Accepted for prop-compatibility with ControlPage but unused here: the
   * Program strip reads `program.takenAt` from the store for its clock.
   */
  lastTakenAt: number | null;
  /** A command is in flight — passed through to the Program strip's actions. */
  sending?: boolean;
}

/**
 * Dock operator shell (narrow widths / OBS Custom Browser Dock).
 *
 * A fixed-height app frame: header (brand + event switcher + relay dot) and
 * tab bar on top, the Program strip pinned beneath them (so Take/Clear and the
 * honest Program record are visible on EVERY tab), one tab's content scrolling
 * in the middle, and the transport footer at the bottom — hidden by CSS on
 * short docks, where the header's relay dot carries the same state.
 *
 * The relay is polled HERE, once, and handed to both header and footer:
 * mounting useRelayStatus in each would double the probe traffic.
 *
 * Only the active tab mounts — an OBS dock shares CPU with an encoder, and a
 * GraphicStage render per hidden tab is a real cost. Settings is a real tab now,
 * carrying only preferences and information that already have behaviour.
 */
export default function DockShell({ onTake, onClear, lastAction, sending = false }: DockShellProps) {
  const [tab, setTab] = useState<DockTab>('live');
  const relay = useRelayStatus();


  return (
    <div className="control-root control-root--dock">
      <div className="dock">
        <DockHeader relay={relay} />
        <DockTabBar active={tab} onChange={setTab} />
        <DockProgramStrip onTake={onTake} onClear={onClear} sending={sending} lastAction={lastAction} />
        <div className="dock-scroll">
          {tab === 'live' ? <DockLiveTab /> : null}
          {tab === 'queue' ? (
            <DockQueueTab
              onPreviewSelected={() => setTab('live')}
              onEditSelected={() => setTab('edit')}
            />
          ) : null}
          {tab === 'edit' ? <DockQuickEditTab onOpenQueue={() => setTab('queue')} /> : null}
          {tab === 'settings' ? <DockSettingsTab relay={relay} /> : null}
        </div>
        <DockFooter relay={relay} />
      </div>
    </div>
  );
}

