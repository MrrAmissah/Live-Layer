import { useState } from 'react';
import type { LastAction } from './StatusBadge';
import DockHeader from './DockHeader';
import DockTabBar, { type DockTab } from './DockTabBar';
import DockProgramStrip from './DockProgramStrip';
import DockLiveTab from './DockLiveTab';
import DockFooter from './DockFooter';

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
 * A fixed-height app frame: header + event block + tab bar on top, the Program
 * strip pinned beneath them (so Take/Clear and the honest Program record are
 * visible on EVERY tab), one tab's content scrolling in the middle, and the
 * transport/pack footer at the bottom.
 *
 * Only the active tab mounts — an OBS dock shares CPU with an encoder, and a
 * GraphicStage render per hidden tab is a real cost. Queue, Quick Edit and
 * More are honest placeholders until the next build stages.
 */
export default function DockShell({ onTake, onClear, lastAction, sending = false }: DockShellProps) {
  const [tab, setTab] = useState<DockTab>('live');

  return (
    <div className="control-root control-root--dock">
      <div className="dock">
        <DockHeader />
        <DockTabBar active={tab} onChange={setTab} />
        <DockProgramStrip
          variant={tab === 'live' ? 'tall' : 'compact'}
          onTake={onTake}
          onClear={onClear}
          sending={sending}
          lastAction={lastAction}
        />
        <div className="dock-scroll">
          {tab === 'live' ? <DockLiveTab /> : null}
          {tab === 'queue' ? (
            <ComingSoon
              title="Queue"
              note="Queue building, search and reordering land here. For now, run an active rundown from the Live tab."
            />
          ) : null}
          {tab === 'edit' ? (
            <ComingSoon
              title="Quick Edit"
              note="Field editing lands here. Until then, edit content in the full studio at a wider window."
            />
          ) : null}
          {tab === 'more' ? (
            <ComingSoon title="More" note="Utilities, preferences and diagnostics land here." />
          ) : null}
        </div>
        <DockFooter />
      </div>
    </div>
  );
}

/** Honest placeholder for the not-yet-built tabs — never a mocked-up screen. */
function ComingSoon({ title, note }: { title: string; note: string }) {
  return (
    <div className="dock-tabpane">
      <section className="dock-card dock-coming">
        <span className="ll-kicker">{title}</span>
        <p className="dock-coming__note">Coming in the next stage.</p>
        <p className="dock-card__hint">{note}</p>
      </section>
    </div>
  );
}
