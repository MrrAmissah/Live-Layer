import { useEditTarget } from '../../hooks/useEditTarget';

const DURATIONS = [0, 3, 6, 10, 15];

/**
 * Auto-hide duration as a segmented control (Off / 3 / 6 / 10 / 15s). Reads &
 * writes through the edit target — the draft, or the selected rundown item (R4).
 */
export default function DurationControl() {
  const { durationSeconds, setDuration: setDurationSeconds } = useEditTarget();

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
