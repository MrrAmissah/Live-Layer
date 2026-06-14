import { useLiveLayerStore } from '../../store/useLiveLayerStore';

const DURATIONS = [0, 3, 6, 10, 15];

/**
 * Auto-hide duration as a segmented control (Off / 3 / 6 / 10 / 15s). Shared by
 * the studio live deck and the dock Live step; reads/writes the store directly.
 */
export default function DurationControl() {
  const durationSeconds = useLiveLayerStore((state) => state.durationSeconds);
  const setDurationSeconds = useLiveLayerStore((state) => state.setDurationSeconds);

  return (
    <div className="duration">
      <div className="duration__head">
        <span className="ll-kicker">Auto-hide</span>
        <span className="duration__value">{durationSeconds === 0 ? 'Manual' : `${durationSeconds}s`}</span>
      </div>
      <div className="duration__seg" role="group" aria-label="Auto-hide duration">
        {DURATIONS.map((value) => (
          <button
            key={value}
            type="button"
            className={`duration__opt ${durationSeconds === value ? 'duration__opt--active' : ''}`}
            onClick={() => setDurationSeconds(value)}
          >
            {value === 0 ? 'Off' : `${value}s`}
          </button>
        ))}
      </div>
    </div>
  );
}
