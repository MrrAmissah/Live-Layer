import { useEditTarget } from '../../hooks/useEditTarget';
import { DEFAULT_LAYOUT_SETTINGS, type LayoutSettings } from '../../types/layout';
import { Icon, type IconName } from '../../lib/icons';

const DURATIONS = [0, 3, 6, 10, 15];
const POSITIONS: Array<{ value: string; icon: IconName; label: string }> = [
  { value: 'left', icon: 'posLeft', label: 'Left' },
  { value: 'center', icon: 'posCenter', label: 'Center' },
  { value: 'full', icon: 'posFull', label: 'Full' }
];
const DENSITY = ['compact', 'standard', 'bold'];
const SAFE = ['normal', 'tight'];

/**
 * Studio Live-settings block — compact label-left / control-right rows matching
 * Full-studio01 (Size is a dropdown; the rest are tight segments). Reads and
 * writes through the shared edit target, so behaviour matches the dock controls
 * exactly; only the studio presentation differs. The dock keeps its own
 * LayoutControls/DurationControl.
 */
export default function LiveSettings() {
  const { layout, setLayout, resetLayout, durationSeconds, setDuration } = useEditTarget();
  const size = layout.size ?? DEFAULT_LAYOUT_SETTINGS.size;
  const position = layout.position ?? DEFAULT_LAYOUT_SETTINGS.position;
  const density = layout.density ?? DEFAULT_LAYOUT_SETTINGS.density;
  const safe = layout.safeMargin ?? DEFAULT_LAYOUT_SETTINGS.safeMargin;
  const set = (patch: Partial<LayoutSettings>) => setLayout(patch);

  return (
    <div className="ls">
      <span className="ll-kicker">Live settings</span>

      <div className="ls-row">
        <span className="ls-row__label">Size</span>
        <span className="ls-select">
          <select value={size} aria-label="Size" onChange={(e) => set({ size: e.target.value as LayoutSettings['size'] })}>
            <option value="small">Small</option>
            <option value="medium">Medium (Default)</option>
            <option value="large">Large</option>
          </select>
          <Icon name="chevronDown" size={15} />
        </span>
      </div>

      <div className="ls-row">
        <span className="ls-row__label">Position</span>
        <div className="ls-seg ls-seg--icons" role="group" aria-label="Position">
          {POSITIONS.map((p) => (
            <button
              key={p.value}
              type="button"
              aria-label={p.label}
              aria-pressed={position === p.value}
              className={`ls-seg__btn${position === p.value ? ' ls-seg__btn--active' : ''}`}
              onClick={() => set({ position: p.value as LayoutSettings['position'] })}
            >
              <Icon name={p.icon} size={18} />
            </button>
          ))}
        </div>
      </div>

      <div className="ls-row">
        <span className="ls-row__label">Density</span>
        <div className="ls-seg" role="group" aria-label="Density">
          {DENSITY.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={density === value}
              className={`ls-seg__btn${density === value ? ' ls-seg__btn--active' : ''}`}
              onClick={() => set({ density: value as LayoutSettings['density'] })}
            >
              {value[0].toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="ls-row">
        <span className="ls-row__label">Auto-hide</span>
        <div className="ls-seg" role="group" aria-label="Auto-hide">
          {DURATIONS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={durationSeconds === value}
              className={`ls-seg__btn${durationSeconds === value ? ' ls-seg__btn--active' : ''}`}
              onClick={() => setDuration(value)}
            >
              {value === 0 ? 'Off' : `${value}s`}
            </button>
          ))}
        </div>
      </div>

      <div className="ls-row">
        <span className="ls-row__label">Safe margin</span>
        <div className="ls-seg" role="group" aria-label="Safe margin">
          {SAFE.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={safe === value}
              className={`ls-seg__btn${safe === value ? ' ls-seg__btn--active' : ''}`}
              onClick={() => set({ safeMargin: value as LayoutSettings['safeMargin'] })}
            >
              {value[0].toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="ls-row ls-row--reset">
        <button type="button" className="ls-reset" onClick={resetLayout}>
          Reset layout
        </button>
        <button type="button" className="ls-reset__icon" aria-label="Reset layout" onClick={resetLayout}>
          <Icon name="reset" size={15} />
        </button>
      </div>
    </div>
  );
}
