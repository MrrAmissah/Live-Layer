import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import type { LastAction } from './StatusBadge';
import { useLiveTakeContext } from '../../hooks/useLiveTakeContext';

interface StickyLiveBarProps {
  onTake: () => void;
  onClear: () => void;
  lastAction: LastAction;
}

/**
 * Sticky bottom action bar — the dock's single, always-visible Take/Clear, on
 * every tab (this is also the Take for the Live tab). The live state itself is
 * read out once, in the top status bar; here it only shifts emphasis toward
 * Clear when a graphic is live (via data-state) without hiding Take. The meta
 * row carries just the auto-hide value.
 */
export default function StickyLiveBar({ onTake, onClear, lastAction }: StickyLiveBarProps) {
  const durationSeconds = useLiveLayerStore((state) => state.durationSeconds);
  const { takeLabel, takeDisabled } = useLiveTakeContext();

  return (
    <div className="dock-livebar" data-state={lastAction}>
      <div className="dock-livebar__meta">
        <span className="dock-livebar__hide">
          Auto-hide · {durationSeconds === 0 ? 'Off' : `${durationSeconds}s`}
        </span>
      </div>
      <div className="dock-livebar__actions">
        <button type="button" className="take-btn dock-livebar__take" onClick={onTake} disabled={takeDisabled}>
          <span className="take-btn__icon" aria-hidden>▶</span>
          {takeLabel}
        </button>
        <button type="button" className="clear-btn dock-livebar__clear" onClick={onClear}>
          Clear
        </button>
      </div>
    </div>
  );
}
