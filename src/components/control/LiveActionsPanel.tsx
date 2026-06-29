import Panel from './Panel';
import SectionHeader from './SectionHeader';
import StatusBadge, { type LastAction } from './StatusBadge';
import DurationControl from './DurationControl';
import LastActionLine from './LastActionLine';
import LayoutControls from './LayoutControls';
import StudioRundownPanel from './StudioRundownPanel';
import { useLiveTakeContext } from '../../hooks/useLiveTakeContext';

interface LiveActionsPanelProps {
  onTake: () => void;
  onClear: () => void;
  lastAction: LastAction;
  lastTakenAt: number | null;
}

/**
 * Operator action deck (studio mode). The Take button is the loudest element on
 * the surface by design. In rundown mode it becomes "Take selected" (mode-aware
 * via ControlPage.onTake) and the rundown queue replaces the draft layout/
 * duration controls; in ad-hoc mode it's the draft.
 */
export default function LiveActionsPanel({ onTake, onClear, lastAction, lastTakenAt }: LiveActionsPanelProps) {
  const { takeLabel, takeDisabled, rundownActive, selectedItem } = useLiveTakeContext();
  const takeDisplayLabel = lastAction === 'taken' ? 'Update live' : takeLabel;
  const takeAriaLabel = rundownActive && selectedItem
    ? `${takeDisplayLabel}: ${selectedItem.title}`
    : takeDisplayLabel;

  return (
    <Panel>
      <SectionHeader kicker="Live" title="On-air actions" aside={<StatusBadge status={lastAction} />} />
      <div className="ll-panel__body live-deck">
        <div className="live-deck__primary">
          <button
            type="button"
            className="take-btn"
            data-state={lastAction}
            onClick={onTake}
            disabled={takeDisabled}
            aria-label={takeAriaLabel}
          >
            {takeDisplayLabel}
          </button>
          <button type="button" className="clear-btn" onClick={onClear}>
            Clear graphic
          </button>
        </div>

        {rundownActive ? (
          <StudioRundownPanel />
        ) : (
          <>
            <LayoutControls />
            <DurationControl />
          </>
        )}

        <LastActionLine lastAction={lastAction} lastTakenAt={lastTakenAt} />
      </div>
    </Panel>
  );
}
