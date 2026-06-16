import Panel from './Panel';
import SectionHeader from './SectionHeader';
import { RadioTower, Trash2, Waves } from 'lucide-react';
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
  const cueLabel = rundownActive
    ? (selectedItem ? `Selected: ${selectedItem.title}` : 'Select a rundown item')
    : 'Current draft';

  return (
    <Panel>
      <SectionHeader kicker="Live" title="On-air actions" aside={<StatusBadge status={lastAction} />} />
      <div className="ll-panel__body live-deck">
        <div className="live-deck__primary" data-armed={!takeDisabled}>
          <div className="live-deck__cue">
            <span className="live-deck__cue-copy">
              <span className="live-deck__cue-kicker"><span className="live-deck__tally" aria-hidden />Live standby</span>
              <span className="live-deck__cue-title">{cueLabel}</span>
            </span>
            <RadioTower className="live-deck__cue-icon" size={26} aria-hidden />
          </div>
          <button type="button" className="take-btn" onClick={onTake} disabled={takeDisabled}>
            <Waves size={19} aria-hidden />
            {takeLabel}
          </button>
          <button type="button" className="clear-btn" onClick={onClear}>
            <Trash2 size={16} aria-hidden />
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
