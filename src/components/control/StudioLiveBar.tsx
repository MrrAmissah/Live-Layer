import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import { describeProgramStatus } from '../../lib/programStatus';
import { worstOutput } from '../../lib/outputPresence';
import { programClockMs } from '../../lib/programClock';
import { useTicks } from '../../hooks/useTicks';
import LiveActions from './LiveActions';

interface StudioLiveBarProps {
  onTake: () => void;
  onTakeNext: () => void;
  onClear: () => void;
  sending?: boolean;
}

/**
 * The studio's always-visible live actions, for layouts where the Program rail
 * is not.
 *
 * Stacked, the three studio regions become one column and the rail lands last —
 * Take sits roughly 3000px down a 4700px scroll, behind the entire template
 * library. This bar is a flex sibling of the workspace grid, so the frame
 * always shows it and it covers nothing: no overlay, no padding to compensate,
 * no scroll-padding needed, and the pack-switch dialog still sits above it.
 *
 * It is the SAME `LiveActions` the rail renders, calling the same handlers.
 * Which of the two is in the DOM is a CSS decision (`display: none` removes the
 * other from the accessibility tree as well), so an operator never sees — and a
 * screen reader never hears — two Takes.
 *
 * The status readout is the same `describeProgramStatus` vocabulary the rail
 * uses. It reports what was commanded, never a confirmed live.
 */
export default function StudioLiveBar({ onTake, onTakeNext, onClear, sending = false }: StudioLiveBarProps) {
  const program = useLiveLayerStore((state) => state.program);
  const outputs = useLiveLayerStore((state) => state.outputs);
  // Same cadence rule as every Program surface: awake while `showing`, so a
  // confirmed reading can fall to UNVERIFIED when the heartbeat goes stale.
  const now = useTicks(programClockMs(program, Date.now()));
  const status = describeProgramStatus(program, worstOutput(outputs, now), now);

  return (
    <div className="studio-livebar">
      <div className="studio-livebar__status">
        <span className={`program-rail__status program-rail__status--${program.status}`}>
          <span className="program-rail__status-dot" aria-hidden />
          {status.pill}
        </span>
        <span className="studio-livebar__phrase">{status.phrase}</span>
      </div>
      <LiveActions surface="studio" onTake={onTake} onTakeNext={onTakeNext} onClear={onClear} sending={sending} />
    </div>
  );
}
