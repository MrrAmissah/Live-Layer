import { useEffect, useRef, useState } from 'react';
import { useEditTarget } from '../../hooks/useEditTarget';
import { defaultPresetName, resolvePresetName } from '../../lib/presetNaming';

/**
 * Section A — save the VISIBLE graphic as a preset.
 *
 * One primary action, target-aware: in draft mode it serializes the ad-hoc
 * draft; with a rundown item selected it serializes that item. Both go through
 * `useEditTarget().saveAsPreset`, which is the same creation path the Design
 * tab uses — this component adds no serialization of its own, so a preset saved
 * here is indistinguishable from one saved there.
 *
 * Deliberately NOT here: "save as new", update-in-place preset identity, saved
 * timestamps, or an "all changes saved" indicator — the model has no preset
 * identity to update and no save-time to report. See the Stage 3 audit.
 */
export default function BrandSaveGraphic() {
  const { isRundownItem, sourceLabel, templateId, saveAsPreset } = useEditTarget();
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  const fallbackName = defaultPresetName(isRundownItem, sourceLabel, templateId);

  const commit = () => {
    const label = resolvePresetName(name, isRundownItem, sourceLabel, templateId);
    saveAsPreset(label);
    setName('');
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setMessage(`Saved “${label}” to Saved graphics`);
    timerRef.current = window.setTimeout(() => {
      setMessage('');
      timerRef.current = undefined;
    }, 4000);
  };

  return (
    <div className="brand-save">
      <label className="field brand-save__field">
        <span className="field__label">
          <span>Preset name</span>
          <span className="field__opt">Optional</span>
        </span>
        <input
          className="field__input"
          value={name}
          placeholder={fallbackName}
          aria-label="Preset name"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
          }}
        />
      </label>

      <div className="brand-save__actions">
        <button type="button" className="btn btn--secondary btn--sm brand-save__go" onClick={commit}>
          Save preset
        </button>
        <span className="brand-save__target">
          {isRundownItem ? 'Saves the selected rundown item' : 'Saves the current graphic'}
        </span>
      </div>

      {message ? (
        <p className="field__hint" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
    </div>
  );
}
