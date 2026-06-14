import { useState } from 'react';
import { templateRegistry } from '../templates/registry';
import { useLiveLayerStore } from '../../store/useLiveLayerStore';

function templateName(templateId: string): string {
  return templateRegistry.find((item) => item.id === templateId)?.name ?? templateId;
}

/**
 * Save / list / apply / remove presets, with a clear empty state and a small
 * reset-all at the bottom. Used inside the Library panel/step; owns its own
 * store subscription.
 */
export default function PresetControls() {
  const presets = useLiveLayerStore((state) => state.presets);
  const savePreset = useLiveLayerStore((state) => state.savePreset);
  const removePreset = useLiveLayerStore((state) => state.removePreset);
  const loadGraphicInstance = useLiveLayerStore((state) => state.loadGraphicInstance);
  const clearLocalData = useLiveLayerStore((state) => state.clearLocalData);
  const currentTemplateId = useLiveLayerStore((state) => state.currentTemplateId);

  const [name, setName] = useState('');

  const onSave = () => {
    const finalName = name.trim() || templateName(currentTemplateId);
    savePreset(finalName);
    setName('');
  };

  return (
    <div className="preset-grid">
      <div className="preset-save">
        <input
          className="field__input"
          value={name}
          placeholder={`Save “${templateName(currentTemplateId)}” as…`}
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
                <span className="preset-row__name">{preset.presetName || templateName(preset.templateId)}</span>
                <span className="preset-row__meta">{templateName(preset.templateId)}</span>
              </span>
              <span className="preset-row__actions">
                <button type="button" className="btn btn--secondary btn--xs" onClick={() => loadGraphicInstance(preset)}>
                  Load
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--xs"
                  onClick={() => removePreset(preset.id)}
                  aria-label={`Remove ${preset.presetName || templateName(preset.templateId)}`}
                >
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <button type="button" className="preset-reset" onClick={clearLocalData}>
        Reset all local data
      </button>
    </div>
  );
}
