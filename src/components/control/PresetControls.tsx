import { useEffect, useRef, useState } from 'react';
import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import { useEditTarget } from '../../hooks/useEditTarget';
import { useRundowns } from '../../hooks/useRundowns';
import { noActiveRundownMessage, type ControlSurface } from './rundownDestination';
import { MAX_ITEMS_PER_RUNDOWN } from '../../lib/rundown/rundownStore';
import { defaultPresetName, resolvePresetName, templateDisplayName } from '../../lib/presetNaming';
import type { GraphicInstance } from '../../types/graphics';

/**
 * Save / list / apply / remove presets, with a clear empty state and a small
 * reset-all at the bottom. Used inside the Library panel/step; owns its own
 * store subscription.
 *
 * Save follows the VISIBLE edit target, like every other save surface: the
 * ad-hoc draft normally, the selected rundown item when there is one. It used
 * to save the draft unconditionally, so "Save" here and "Save" in the editor
 * could serialize two different graphics.
 */
export default function PresetControls({
  onLoadGraphic,
  /**
   * Which layout is mounting this. Both do, and they keep their rundown manager
   * in different places, so the recovery message has to follow the surface —
   * correcting it for one silently broke it for the other.
   */
  surface = 'studio'
}: { onLoadGraphic?: (preset: GraphicInstance) => void; surface?: ControlSurface } = {}) {
  const presets = useLiveLayerStore((state) => state.presets);
  const removePreset = useLiveLayerStore((state) => state.removePreset);
  const loadGraphicInstance = useLiveLayerStore((state) => state.loadGraphicInstance);
  const clearLocalData = useLiveLayerStore((state) => state.clearLocalData);
  const { isRundownItem, sourceLabel, templateId, saveAsPreset } = useEditTarget();
  const rd = useRundowns();
  const [confirmingReset, setConfirmingReset] = useState(false);

  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const flashTimerRef = useRef<number | undefined>(undefined);

  const onSave = () => {
    saveAsPreset(resolvePresetName(name, isRundownItem, sourceLabel, templateId));
    setName('');
  };

  const flash = (text: string) => {
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    setMessage(text);
    flashTimerRef.current = window.setTimeout(() => {
      setMessage('');
      flashTimerRef.current = undefined;
    }, 2500);
  };

  useEffect(() => () => {
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
  }, []);

  const onAddToRundown = (preset: GraphicInstance) => {
    if (!rd.activeRundownId) {
      flash(noActiveRundownMessage(surface));
      return;
    }
    if ((rd.activeRundown?.items.length ?? 0) >= MAX_ITEMS_PER_RUNDOWN) {
      flash(`Rundown is full — max ${MAX_ITEMS_PER_RUNDOWN} items.`);
      return;
    }
    const item = rd.addSavedGraphicToRundown(preset);
    flash(item ? `Added “${item.title}” to ${rd.activeRundown?.name}` : 'Could not add item.');
  };

  return (
    <div className="preset-grid">
      <div className="preset-save">
        <input
          className="field__input"
          value={name}
          placeholder={`Save “${defaultPresetName(isRundownItem, sourceLabel, templateId)}” as…`}
          aria-label="Preset name"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onSave();
          }}
        />
        <button type="button" className="btn btn--secondary btn--sm" onClick={onSave}>
          Save
        </button>
      </div>

      {presets.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state__title">No saved presets</p>
          <p className="empty-state__hint">Set up a graphic, then save it here to recall it instantly during a service.</p>
        </div>
      ) : (
        <ul className="preset-list">
          {presets.map((preset) => (
            <li key={preset.id} className="preset-row">
              <span className="preset-row__main">
                <span className="preset-row__name">{preset.presetName || templateDisplayName(preset.templateId)}</span>
                <span className="preset-row__meta">{templateDisplayName(preset.templateId)}</span>
              </span>
              <span className="preset-row__actions">
                <button
                  type="button"
                  className="btn btn--secondary btn--xs"
                  onClick={() => (onLoadGraphic ? onLoadGraphic(preset) : loadGraphicInstance(preset))}
                >
                  Load
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--xs"
                  onClick={() => onAddToRundown(preset)}
                  title="Add to active rundown"
                >
                  + Rundown
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--xs"
                  onClick={() => removePreset(preset.id)}
                  aria-label={`Remove ${preset.presetName || templateDisplayName(preset.templateId)}`}
                >
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {message ? <p className="field__hint" role="status" aria-live="polite">{message}</p> : null}

      {/* Two-step, and never a bare one-click: this removes everything this
          browser holds. The list below is checked against what `clearLocalData`
          actually clears — it also resets Program and removes the working draft,
          which the old copy did not mention. Nothing leaves this browser, so it
          must not imply a server or cloud deletion. */}
      {confirmingReset ? (
        <div className="preset-reset__confirm" role="alertdialog" aria-label="Confirm reset">
          <p className="preset-reset__warning">
            Erase everything saved in this browser — presets, quick queue, recents, rundowns,
            people, uploaded assets, brand colours, the Program record and the graphic you are
            preparing? This cannot be undone.
          </p>
          <div className="preset-reset__actions">
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => setConfirmingReset(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="preset-reset preset-reset--confirm"
              onClick={() => {
                clearLocalData();
                setConfirmingReset(false);
              }}
            >
              Yes, erase everything
            </button>
          </div>
        </div>
      ) : (
        <div className="preset-reset__zone">
          <p className="preset-reset__zonehint">Everything below erases local data.</p>
          <button type="button" className="preset-reset" onClick={() => setConfirmingReset(true)}>
            Reset all local data
          </button>
        </div>
      )}
    </div>
  );
}
