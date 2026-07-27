import { useState } from 'react';
import { useLiveLayerStore } from '../../store/useLiveLayerStore';
import { templateRegistry } from '../templates/registry';
import { describeTemplate } from '../../lib/templateMeta';
import { Icon } from '../../lib/icons';
import type { GraphicInstance } from '../../types/graphics';

const templateById = new Map(templateRegistry.map((t) => [t.id, t]));
const COMPACT_COUNT = 4;

function presetLabel(preset: GraphicInstance): string {
  return preset.presetName?.trim() || describeTemplate(templateById.get(preset.templateId), preset.templateId).label;
}

/**
 * Compact presets companion for the Design tab. Uses the real preset slice and
 * actions — it is NOT the full PresetControls surface (no rename, remove,
 * add-to-rundown, or the destructive reset). Load routes through the shared
 * openGraphicInEditor owner callback; "Browse all" and "Browse assets" switch
 * to the existing Saved graphics / Assets destinations.
 */
export default function DesignPresets({
  onLoad,
  onSaved,
  onSaveMessage,
  onBrowseSaved,
  onBrowseAssets
}: {
  onLoad: (preset: GraphicInstance) => void;
  onSaved?: () => void;
  onSaveMessage?: (text: string) => void;
  onBrowseSaved: () => void;
  onBrowseAssets: () => void;
}) {
  const presets = useLiveLayerStore((state) => state.presets);
  const savePreset = useLiveLayerStore((state) => state.savePreset);
  const currentTemplateId = useLiveLayerStore((state) => state.currentTemplateId);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');

  const shown = presets.slice(0, COMPACT_COUNT);

  const commitSave = () => {
    const label = name.trim() || describeTemplate(templateById.get(currentTemplateId), currentTemplateId).label;
    savePreset(label);
    setName('');
    setSaving(false);
    onSaveMessage?.(`Saved “${label}”`);
    onSaved?.();
  };

  return (
    <section className="design-presets" aria-label="Presets">
      <div className="design-presets__head">
        <span className="ll-kicker">Presets</span>
        {presets.length > 0 ? <span className="design-presets__count">{presets.length}</span> : null}
      </div>

      {shown.length === 0 ? (
        <p className="design-presets__empty">Save a look here to recall it in one click.</p>
      ) : (
        <ul className="design-presets__list">
          {shown.map((preset) => (
            <li key={preset.id} className="design-presets__row">
              <span className="design-presets__body">
                <span className="design-presets__name">{presetLabel(preset)}</span>
                <span className="design-presets__type">
                  <Icon name={describeTemplate(templateById.get(preset.templateId), preset.templateId).icon} size={11} />
                  {describeTemplate(templateById.get(preset.templateId), preset.templateId).label}
                </span>
              </span>
              <button
                type="button"
                className="design-presets__load"
                aria-label={`Load ${presetLabel(preset)}`}
                onClick={() => onLoad(preset)}
              >
                Load
              </button>
            </li>
          ))}
        </ul>
      )}

      {saving ? (
        <div className="design-presets__save">
          <input
            className="field__input"
            autoFocus
            value={name}
            placeholder="Preset name…"
            aria-label="Preset name"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitSave();
              if (event.key === 'Escape') setSaving(false);
            }}
          />
          <button type="button" className="btn btn--secondary btn--sm" onClick={commitSave}>
            Save
          </button>
        </div>
      ) : (
        <button type="button" className="design-presets__action" onClick={() => setSaving(true)}>
          <Icon name="plus" size={14} />
          Save current as preset
        </button>
      )}

      <div className="design-presets__links">
        <button type="button" className="design-presets__link" onClick={onBrowseSaved}>
          Browse all
        </button>
        <button type="button" className="design-presets__link" onClick={onBrowseAssets}>
          Browse assets
        </button>
      </div>
    </section>
  );
}
