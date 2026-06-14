import Panel from './Panel';
import SectionHeader from './SectionHeader';
import StatusBadge, { type LastAction } from './StatusBadge';
import DurationControl from './DurationControl';
import LastActionLine from './LastActionLine';
import LayoutControls from './LayoutControls';

interface LiveActionsPanelProps {
  onTake: () => void;
  onClear: () => void;
  lastAction: LastAction;
  lastTakenAt: number | null;
}

/**
 * Operator action deck (studio mode). The Take button is the loudest element on
 * the surface by design; Clear, the auto-hide duration, current state, and the
 * last action sit directly beneath it so the whole live decision is one glance.
 */
export default function LiveActionsPanel({ onTake, onClear, lastAction, lastTakenAt }: LiveActionsPanelProps) {
  return (
    <Panel>
      <SectionHeader kicker="Live" title="On-air actions" aside={<StatusBadge status={lastAction} />} />
      <div className="ll-panel__body live-deck">
        <button type="button" className="take-btn" onClick={onTake}>
          <span className="take-btn__icon" aria-hidden>▶</span>
          Take live
        </button>
        <button type="button" className="clear-btn" onClick={onClear}>
          Clear live graphic
        </button>

        <LayoutControls />
        <DurationControl />

        <LastActionLine lastAction={lastAction} lastTakenAt={lastTakenAt} />
      </div>
    </Panel>
  );
}
